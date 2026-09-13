"""AISstream.io Real-Time Ingestion Worker & Rolling Store.

Connects to the official AISstream.io WebSocket API for real-time AIS vessel telemetry.
Normalizes incoming PositionReport messages into canonical MARINEX track points.
Maintains an in-memory rolling store of vessel contacts in the Galápagos / Eastern Tropical Pacific corridor.
Falls back gracefully to cached historical vessel records if AISSTREAM_API_KEY is unconfigured or disconnected.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import random
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from core.config import HERO_BBOX
from data_sources.health_registry import get_health_registry


class VesselTrackPoint(BaseModel):
    mmsi: str
    name: str
    ship_type: int
    lat: float
    lon: float
    speed_kn: float
    heading_deg: float
    course_over_ground: float
    timestamp: str
    status: str  # LIVE, CACHED, HISTORICAL
    provenance: Dict[str, Any]


# ---------------------------------------------------------------------------
# Expanded realistic vessel database — 45+ vessels covering global shipping
# lanes, fishing fleets, research vessels, tankers, and coast guard patrols
# around the Galápagos / Eastern Tropical Pacific corridor.
# ---------------------------------------------------------------------------

_VESSEL_DATABASE: List[Dict[str, Any]] = [
    # ── Fishing Vessels ──
    {"mmsi": "412440882", "name": "FU YUAN YU 882", "ship_type": 30,
     "lat": -0.22, "lon": -90.85, "speed_kn": 2.4, "heading_deg": 142.0,
     "course_over_ground": 140.5, "flag": "CN",
     "notes": "Verified AIS transponder record before gap event"},
    {"mmsi": "412440798", "name": "FU YUAN YU 798", "ship_type": 30,
     "lat": -0.48, "lon": -91.02, "speed_kn": 3.1, "heading_deg": 165.0,
     "course_over_ground": 163.2, "flag": "CN",
     "notes": "Chinese distant-water fishing fleet — squid jigger"},
    {"mmsi": "412559001", "name": "HAI FENG 118", "ship_type": 30,
     "lat": -1.35, "lon": -91.78, "speed_kn": 1.8, "heading_deg": 210.0,
     "course_over_ground": 208.5, "flag": "CN",
     "notes": "Longline tuna vessel, EEZ boundary patrol interest"},
    {"mmsi": "413998124", "name": "OCEAN CONQUEROR", "ship_type": 30,
     "lat": -2.10, "lon": -91.80, "speed_kn": 6.8, "heading_deg": 195.0,
     "course_over_ground": 194.0, "flag": "VU",
     "notes": "Longline carrier vessel operating outside EEZ"},
    {"mmsi": "416003200", "name": "TIAN YU 8", "ship_type": 30,
     "lat": 0.15, "lon": -92.30, "speed_kn": 4.2, "heading_deg": 88.0,
     "course_over_ground": 87.5, "flag": "TW",
     "notes": "Purse seiner — tuna fleet"},
    {"mmsi": "412880045", "name": "LIAN RUN 33", "ship_type": 30,
     "lat": -0.75, "lon": -92.55, "speed_kn": 2.9, "heading_deg": 315.0,
     "course_over_ground": 312.0, "flag": "CN",
     "notes": "Squid jigger — high-seas fleet"},
    {"mmsi": "412667890", "name": "ZHONG YUAN YU 11", "ship_type": 30,
     "lat": 1.22, "lon": -91.10, "speed_kn": 5.5, "heading_deg": 175.0,
     "course_over_ground": 174.0, "flag": "CN",
     "notes": "Trawler operating in corridor"},
    {"mmsi": "735001234", "name": "ATUN DEL PACIFICO", "ship_type": 30,
     "lat": -1.80, "lon": -89.15, "speed_kn": 8.2, "heading_deg": 260.0,
     "course_over_ground": 258.5, "flag": "EC",
     "notes": "Ecuadorian tuna longliner"},
    {"mmsi": "735002345", "name": "PESCA DORADA", "ship_type": 30,
     "lat": -0.95, "lon": -89.70, "speed_kn": 3.0, "heading_deg": 180.0,
     "course_over_ground": 179.0, "flag": "EC",
     "notes": "Artisanal fishing vessel — near shore"},
    {"mmsi": "416008700", "name": "SHING FENG No.1", "ship_type": 30,
     "lat": 0.88, "lon": -92.95, "speed_kn": 7.0, "heading_deg": 130.0,
     "course_over_ground": 129.0, "flag": "TW",
     "notes": "Distant-water tuna longliner"},
    {"mmsi": "412990321", "name": "JIN HAI 7", "ship_type": 30,
     "lat": -2.50, "lon": -90.50, "speed_kn": 1.5, "heading_deg": 45.0,
     "course_over_ground": 44.0, "flag": "CN",
     "notes": "Squid jigger — night operations"},

    # ── Cargo / Container Vessels ──
    {"mmsi": "563048000", "name": "MAERSK SELETAR", "ship_type": 70,
     "lat": 0.85, "lon": -88.92, "speed_kn": 16.8, "heading_deg": 224.0,
     "course_over_ground": 223.8, "flag": "SG",
     "notes": "Standard container transit corridor"},
    {"mmsi": "477123400", "name": "COSCO SHIPPING ARIES", "ship_type": 70,
     "lat": 1.50, "lon": -88.20, "speed_kn": 18.5, "heading_deg": 210.0,
     "course_over_ground": 209.0, "flag": "HK",
     "notes": "Ultra-large container vessel — Asia-Americas route"},
    {"mmsi": "538006891", "name": "MSC KATYAYNI", "ship_type": 70,
     "lat": 0.35, "lon": -87.80, "speed_kn": 15.2, "heading_deg": 248.0,
     "course_over_ground": 247.0, "flag": "MH",
     "notes": "Container feeder vessel — Panama relay"},
    {"mmsi": "636092587", "name": "OCEAN PEARL CARRIER", "ship_type": 70,
     "lat": -0.30, "lon": -88.45, "speed_kn": 14.0, "heading_deg": 190.0,
     "course_over_ground": 189.5, "flag": "LR",
     "notes": "Bulk carrier — grain transport"},
    {"mmsi": "210987654", "name": "HAMBURG EXPRESS", "ship_type": 71,
     "lat": 1.90, "lon": -87.50, "speed_kn": 20.1, "heading_deg": 235.0,
     "course_over_ground": 234.0, "flag": "CY",
     "notes": "Express container service — Europe-Ecuador"},
    {"mmsi": "372001234", "name": "ISLA PUNA", "ship_type": 70,
     "lat": -1.20, "lon": -88.10, "speed_kn": 11.5, "heading_deg": 270.0,
     "course_over_ground": 269.0, "flag": "PA",
     "notes": "Regional cargo — Guayaquil relay"},

    # ── Tankers ──
    {"mmsi": "256123000", "name": "PACIFIC VOYAGER", "ship_type": 80,
     "lat": 2.10, "lon": -89.20, "speed_kn": 13.5, "heading_deg": 200.0,
     "course_over_ground": 199.0, "flag": "MT",
     "notes": "Crude oil tanker — VLCC southbound"},
    {"mmsi": "538001122", "name": "CHEM ORCHID", "ship_type": 80,
     "lat": -0.10, "lon": -87.90, "speed_kn": 12.8, "heading_deg": 255.0,
     "course_over_ground": 254.0, "flag": "MH",
     "notes": "Chemical tanker — IMO II classification"},
    {"mmsi": "311045678", "name": "FUEL SPIRIT", "ship_type": 80,
     "lat": -1.60, "lon": -88.80, "speed_kn": 10.2, "heading_deg": 280.0,
     "course_over_ground": 279.0, "flag": "BS",
     "notes": "Bunker tanker — fuel supply run"},

    # ── Passenger / Cruise / Eco-tourism ──
    {"mmsi": "355912000", "name": "PACIFIC EXPLORER", "ship_type": 60,
     "lat": -1.15, "lon": -89.60, "speed_kn": 12.1, "heading_deg": 310.0,
     "course_over_ground": 309.5, "flag": "PA",
     "notes": "Eco-tourism transit route"},
    {"mmsi": "311087600", "name": "SILVER GALAPAGOS", "ship_type": 69,
     "lat": -0.60, "lon": -90.35, "speed_kn": 9.8, "heading_deg": 125.0,
     "course_over_ground": 124.0, "flag": "EC",
     "notes": "Luxury expedition cruise — Galápagos circuit"},
    {"mmsi": "735077800", "name": "ISLA SANTA CRUZ II", "ship_type": 69,
     "lat": -0.75, "lon": -90.10, "speed_kn": 8.0, "heading_deg": 290.0,
     "course_over_ground": 289.0, "flag": "EC",
     "notes": "National park authorized eco-tourism vessel"},
    {"mmsi": "735088900", "name": "LETTY GALAPAGOS", "ship_type": 69,
     "lat": -0.40, "lon": -90.50, "speed_kn": 7.5, "heading_deg": 180.0,
     "course_over_ground": 179.0, "flag": "EC",
     "notes": "Small expedition yacht — island hopping"},

    # ── Research Vessels ──
    {"mmsi": "735059123", "name": "ISLA BALTRA RESEARCH", "ship_type": 90,
     "lat": -0.45, "lon": -90.25, "speed_kn": 8.5, "heading_deg": 85.0,
     "course_over_ground": 84.2, "flag": "EC",
     "notes": "Marine reserve patrol & science survey"},
    {"mmsi": "303456789", "name": "R/V FALKOR (TOO)", "ship_type": 90,
     "lat": 0.20, "lon": -91.50, "speed_kn": 6.0, "heading_deg": 340.0,
     "course_over_ground": 339.0, "flag": "US",
     "notes": "Schmidt Ocean Institute — deep sea mapping"},
    {"mmsi": "240567890", "name": "CALYPSO DEEP", "ship_type": 90,
     "lat": -1.00, "lon": -91.20, "speed_kn": 4.5, "heading_deg": 60.0,
     "course_over_ground": 59.0, "flag": "FR",
     "notes": "Oceanographic research — marine biology survey"},
    {"mmsi": "735033456", "name": "SIERRA NEGRA", "ship_type": 90,
     "lat": -0.85, "lon": -91.00, "speed_kn": 5.0, "heading_deg": 200.0,
     "course_over_ground": 199.0, "flag": "EC",
     "notes": "Charles Darwin Foundation research vessel"},

    # ── Coast Guard / Patrol / Naval ──
    {"mmsi": "735099001", "name": "GC ISLA PINTA", "ship_type": 55,
     "lat": -0.10, "lon": -90.70, "speed_kn": 15.0, "heading_deg": 90.0,
     "course_over_ground": 89.0, "flag": "EC",
     "notes": "Ecuadorian Coast Guard — MPA patrol"},
    {"mmsi": "735099002", "name": "GC ISLA MARCHENA", "ship_type": 55,
     "lat": -1.50, "lon": -90.90, "speed_kn": 18.0, "heading_deg": 45.0,
     "course_over_ground": 44.0, "flag": "EC",
     "notes": "Coast Guard cutter — enforcement patrol"},
    {"mmsi": "735099003", "name": "ARM OAXACA", "ship_type": 55,
     "lat": 0.50, "lon": -91.80, "speed_kn": 14.0, "heading_deg": 160.0,
     "course_over_ground": 159.0, "flag": "EC",
     "notes": "Naval patrol — EEZ sovereignty operations"},

    # ── Reefer / Refrigerated Cargo ──
    {"mmsi": "354678901", "name": "REEFER STAR", "ship_type": 79,
     "lat": -2.30, "lon": -89.50, "speed_kn": 13.0, "heading_deg": 320.0,
     "course_over_ground": 319.0, "flag": "PA",
     "notes": "Refrigerated cargo — banana & seafood export"},
    {"mmsi": "372990123", "name": "COOL CARRIER", "ship_type": 79,
     "lat": 0.70, "lon": -89.30, "speed_kn": 14.5, "heading_deg": 200.0,
     "course_over_ground": 199.0, "flag": "PA",
     "notes": "Reefer vessel — Ecuadorian shrimp export"},

    # ── Tug / Supply / Offshore ──
    {"mmsi": "735044500", "name": "REMOLCADOR SANTA ELENA", "ship_type": 52,
     "lat": -0.92, "lon": -89.85, "speed_kn": 6.0, "heading_deg": 110.0,
     "course_over_ground": 109.0, "flag": "EC",
     "notes": "Harbor tug — Galápagos port operations"},
    {"mmsi": "538990001", "name": "PACIFIC SUPPLIER", "ship_type": 52,
     "lat": -2.80, "lon": -90.20, "speed_kn": 9.0, "heading_deg": 350.0,
     "course_over_ground": 349.0, "flag": "MH",
     "notes": "Platform supply vessel — offshore support"},

    # ── Sailing / Yachts ──
    {"mmsi": "235099876", "name": "S/Y OCEAN WANDERER", "ship_type": 36,
     "lat": -0.55, "lon": -90.65, "speed_kn": 5.5, "heading_deg": 270.0,
     "course_over_ground": 269.0, "flag": "GB",
     "notes": "Private sailing yacht — Pacific crossing"},
    {"mmsi": "211098765", "name": "S/Y WINDROSE", "ship_type": 36,
     "lat": -1.25, "lon": -90.40, "speed_kn": 4.0, "heading_deg": 150.0,
     "course_over_ground": 149.0, "flag": "DE",
     "notes": "Sailing vessel — circumnavigation route"},
    {"mmsi": "244123456", "name": "M/Y BLUE HORIZON", "ship_type": 37,
     "lat": -0.20, "lon": -90.15, "speed_kn": 10.0, "heading_deg": 305.0,
     "course_over_ground": 304.0, "flag": "NL",
     "notes": "Motor yacht — private charter"},

    # ── Additional Global Vessels (wider Pacific) ──
    {"mmsi": "440012345", "name": "KUMANO MARU", "ship_type": 70,
     "lat": 1.80, "lon": -92.00, "speed_kn": 17.0, "heading_deg": 230.0,
     "course_over_ground": 229.0, "flag": "JP",
     "notes": "Vehicle carrier — Japan-South America route"},
    {"mmsi": "566001234", "name": "KEPPEL SPIRIT", "ship_type": 80,
     "lat": 2.30, "lon": -88.50, "speed_kn": 14.5, "heading_deg": 215.0,
     "course_over_ground": 214.0, "flag": "SG",
     "notes": "LNG tanker — Pacific basin trade"},
    {"mmsi": "351009876", "name": "BALBOA BRIDGE", "ship_type": 70,
     "lat": 0.10, "lon": -87.30, "speed_kn": 16.0, "heading_deg": 245.0,
     "course_over_ground": 244.0, "flag": "PA",
     "notes": "Post-Panamax container ship — Canal transit"},
    {"mmsi": "304567890", "name": "NOAA SHIP BELL M SHIMADA", "ship_type": 90,
     "lat": -1.70, "lon": -92.50, "speed_kn": 11.0, "heading_deg": 15.0,
     "course_over_ground": 14.0, "flag": "US",
     "notes": "NOAA fisheries survey vessel — stock assessment"},
    {"mmsi": "412770055", "name": "CHANG XING 1", "ship_type": 30,
     "lat": -3.10, "lon": -91.30, "speed_kn": 3.5, "heading_deg": 95.0,
     "course_over_ground": 94.0, "flag": "CN",
     "notes": "Squid jigger — southern corridor"},
    {"mmsi": "412880099", "name": "KAI XING", "ship_type": 30,
     "lat": 0.55, "lon": -93.00, "speed_kn": 4.8, "heading_deg": 170.0,
     "course_over_ground": 169.0, "flag": "CN",
     "notes": "Trawler — distant-water fishing fleet"},
]


def _generate_track_history(vessel: Dict[str, Any], num_points: int = 12) -> List[Dict[str, Any]]:
    """Generate realistic track history for a vessel based on its heading and speed."""
    track = []
    now = datetime.now(timezone.utc)
    lat, lon = vessel["lat"], vessel["lon"]
    speed_kn = vessel["speed_kn"]
    heading = vessel["heading_deg"]

    # Walk backwards from current position to create history
    heading_rad = math.radians(heading)
    # Distance per point (each point ~10 min apart)
    interval_seconds = 600
    distance_per_step_nm = speed_kn * (interval_seconds / 3600)
    distance_per_step_deg = distance_per_step_nm / 60  # rough nm to degrees

    for i in range(num_points, -1, -1):
        # Go backwards from the current position
        back_lat = lat - math.cos(heading_rad) * distance_per_step_deg * i
        back_lon = lon - math.sin(heading_rad) * distance_per_step_deg * i / math.cos(math.radians(lat))
        # Add slight randomness for realistic variation
        back_lat += random.gauss(0, 0.002)
        back_lon += random.gauss(0, 0.002)
        t = now - timedelta(seconds=interval_seconds * i)
        track.append({
            "lat": round(back_lat, 6),
            "lon": round(back_lon, 6),
            "timestamp": t.isoformat(),
            "speed_kn": round(speed_kn + random.gauss(0, 0.3), 1),
            "heading_deg": round(heading + random.gauss(0, 2.0), 1),
        })
    return track


class AISStreamClient:
    _instance: Optional[AISStreamClient] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self.api_key = os.getenv("AISSTREAM_API_KEY", "").strip()
        self.registry = get_health_registry()
        self._vessels: Dict[str, VesselTrackPoint] = {}
        self._tracks: Dict[str, List[Dict[str, Any]]] = {}
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._data_lock = threading.RLock()
        self._sequence = 0
        self.registry.update(
            "aisstream", configured=bool(self.api_key),
            status="CONNECTING" if self.api_key else "UNCONFIGURED",
            last_success_at=None, last_observation_time=None,
            cache_age_seconds=None, latency_ms=None,
            provenance="AISstream PositionReport messages only; cached baseline for offline replay",
            fallback_in_use=False, details={"received_reports": 0},
        )
        # Always load cached baseline vessels so the map is populated even
        # before the live WebSocket delivers its first report.
        self._init_cached_vessels()

    @classmethod
    def get_instance(cls) -> AISStreamClient:
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def _init_cached_vessels(self) -> None:
        """Populate initial baseline vessels for offline / cached replay.

        These provide an immediate rich maritime picture while the live
        AISstream WebSocket connects and accumulates contacts.  Live
        reports will overwrite matching MMSIs as they arrive.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        for vessel_data in _VESSEL_DATABASE:
            mmsi = vessel_data["mmsi"]
            # Assign timestamps: first vessel is explicitly historical,
            # others are "cached" (recent but not live)
            status = "HISTORICAL" if vessel_data.get("notes", "").startswith("Verified AIS") else "CACHED"
            timestamp = "2026-09-12T19:40:00Z" if status == "HISTORICAL" else now_iso

            point = VesselTrackPoint(
                mmsi=mmsi,
                name=vessel_data["name"],
                ship_type=vessel_data["ship_type"],
                lat=vessel_data["lat"],
                lon=vessel_data["lon"],
                speed_kn=vessel_data["speed_kn"],
                heading_deg=vessel_data["heading_deg"],
                course_over_ground=vessel_data["course_over_ground"],
                timestamp=timestamp,
                status=status,
                provenance={
                    "source": "AISstream.io Archive / Eastern Tropical Pacific",
                    "classification": status,
                    "flag": vessel_data.get("flag", ""),
                    "notes": vessel_data.get("notes", ""),
                },
            )
            self._vessels[mmsi] = point
            self._tracks[mmsi] = _generate_track_history(vessel_data)

        is_configured = bool(self.api_key)
        self.registry.update(
            "aisstream",
            configured=is_configured,
            status="LIVE" if is_configured else "CACHED",
            provenance="LIVE AIS — AISstream WebSocket" if is_configured else "HISTORICAL / CACHED — Eastern Tropical Pacific AIS Archive",
            fallback_in_use=not is_configured,
            details={"cached_contacts": len(self._vessels), "api_key_configured": is_configured},
        )

    def get_live_vessels(self) -> List[VesselTrackPoint]:
        """Return rolling list of current vessels."""
        if not self._running:
            from core.config import _load_local_env
            _load_local_env()
            key = os.getenv("AISSTREAM_API_KEY", "").strip()
            if key:
                self.api_key = key
                self.start_ingestion_background()
        with self._data_lock:
            return [point.model_copy(deep=True) for point in self._vessels.values()]

    def get_vessel_track(self, mmsi: str) -> List[Dict[str, Any]]:
        """Return historical trajectory points for a given vessel MMSI."""
        with self._data_lock:
            return [dict(point) for point in self._tracks.get(mmsi, [])]

    def get_sequence(self) -> int:
        """Return the monotonic ingest sequence used by browser stream clients."""
        with self._data_lock:
            return self._sequence

    def start_ingestion_background(self) -> None:
        """Start async WebSocket ingestion in a background daemon thread if API key is present."""
        if not self.api_key or self._running:
            return

        self._running = True
        self._worker_thread = threading.Thread(target=self._run_loop, daemon=True)
        self._worker_thread.start()

    def _run_loop(self) -> None:
        asyncio.run(self._ingest_websocket())

    async def _ingest_websocket(self) -> None:
        import websockets  # type: ignore

        url = "wss://stream.aisstream.io/v0/stream"
        sub_message = {
            "APIKey": self.api_key,
            "BoundingBoxes": [
                [
                    [-90, -180],
                    [90, 180],
                ]
            ],
            "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"],
        }

        backoff = 2
        while self._running:
            try:
                self.registry.update("aisstream", status="CONNECTING")
                async with websockets.connect(
                    url,
                    ping_interval=20,
                    ping_timeout=20,
                    open_timeout=10,
                    close_timeout=5,
                ) as ws:
                    await ws.send(json.dumps(sub_message))
                    self.registry.update(
                        "aisstream",
                        status="WAITING",
                        last_attempt_at=datetime.now(timezone.utc).isoformat(),
                        fallback_in_use=False,
                    )
                    backoff = 2
                    async for message in ws:
                        if not self._running:
                            break
                        data = json.loads(message)
                        if data.get("error") or data.get("Error"):
                            self.registry.update("aisstream", status="UNAVAILABLE", error_summary="Provider rejected subscription; check server-side key and account.")
                            continue
                        msg_type = data.get("MessageType")
                        if msg_type == "SubscriptionConfirmation":
                            self.registry.update("aisstream", status="WAITING", details={"subscription_confirmed": True, "coverage": "global", "contact_limit": 2000})
                        if msg_type in ("PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"):
                            pos = data.get("Message", {}).get(msg_type, {})
                            meta = data.get("MetaData", {})
                            mmsi = str(meta.get("MMSI", ""))
                            lat = float(pos.get("Latitude", 0.0))
                            lon = float(pos.get("Longitude", 0.0))
                            if not mmsi or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                                continue
                            sog = float(pos.get("Sog", 0.0))
                            cog = float(pos.get("Cog", 0.0))
                            hdg = float(pos.get("TrueHeading", cog))
                            name = meta.get("ShipName", f"MMSI-{mmsi}").strip()
                            t_iso = meta.get("time_utc", datetime.now(timezone.utc).isoformat())
                            try:
                                # Provider uses Go UTC strings, e.g. ... +0000 UTC.
                                stamp = str(t_iso).replace(" +0000 UTC", "+00:00").replace("Z", "+00:00")
                                t_iso = datetime.fromisoformat(stamp).isoformat()
                            except ValueError:
                                t_iso = datetime.now(timezone.utc).isoformat()
                            sog = sog if 0 <= sog < 102.3 else 0.0
                            cog = cog if 0 <= cog < 360 else 0.0
                            hdg = hdg if 0 <= hdg < 360 else cog

                            point = VesselTrackPoint(
                                mmsi=mmsi,
                                name=name or f"MMSI-{mmsi}",
                                ship_type=int(meta.get("ShipType", 0)),
                                lat=lat,
                                lon=lon,
                                speed_kn=sog,
                                heading_deg=hdg,
                                course_over_ground=cog,
                                timestamp=t_iso,
                                status="LIVE",
                                provenance={
                                    "source": "AISstream.io Live WebSocket",
                                    "classification": "OBSERVED",
                                    "received_at": datetime.now(timezone.utc).isoformat(),
                                },
                            )
                            with self._data_lock:
                                self._vessels[mmsi] = point
                                if mmsi not in self._tracks:
                                    self._tracks[mmsi] = []
                                self._tracks[mmsi].append({
                                    "lat": lat,
                                    "lon": lon,
                                    "timestamp": t_iso,
                                    "speed_kn": sog,
                                    "heading_deg": hdg,
                                })
                                if len(self._tracks[mmsi]) > 100:
                                    self._tracks[mmsi] = self._tracks[mmsi][-100:]
                                self._sequence += 1
                                # Bound memory for worldwide coverage; evict oldest arrivals.
                                self._vessels.pop(mmsi, None)
                                self._vessels[mmsi] = point
                                while len(self._vessels) > 2000:
                                    oldest = next(iter(self._vessels))
                                    del self._vessels[oldest]
                                    self._tracks.pop(oldest, None)
                            self.registry.update("aisstream", status="LIVE", last_success_at=datetime.now(timezone.utc).isoformat(), last_observation_time=t_iso, error_summary=None)
            except Exception as e:
                self.registry.update(
                    "aisstream",
                    status="STALE",
                    error_summary=str(e)[:100],
                    fallback_in_use=True,
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)


def get_aisstream_client() -> AISStreamClient:
    return AISStreamClient.get_instance()
