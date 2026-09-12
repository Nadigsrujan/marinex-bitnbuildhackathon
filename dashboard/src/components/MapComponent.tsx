"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  LayerGroup,
  LayersControl,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Coordinate, DashboardState, VesselGeometry } from "@/lib/types";

const ll = ([lon, lat]: Coordinate): Coordinate => [lat, lon];
function position(g: VesselGeometry): Coordinate | undefined {
  return g.type === "Point"
    ? g.coordinates
    : g.type === "LineString"
      ? g.coordinates[0]
      : g.coordinates[0]?.[0];
}
function Selection({
  state,
  selected,
}: {
  state: DashboardState;
  selected?: string;
}) {
  const map = useMap();
  useEffect(() => {
    const c = state.sentinel.cases.find((c) => c.vessel_id === selected);
    const p = c && position(c.geometry);
    if (p) map.panTo(ll(p), { animate: false });
  }, [map, selected, state]);
  return null;
}
export default function MapComponent({
  state,
  selectedCase,
  onSelectCase,
}: {
  state: DashboardState;
  selectedCase?: string;
  onSelectCase?: (id: string) => void;
}) {
  const route = state.navigator.route_result,
    plan = state.cleaner.cleanup_plan;
  const samples = state.environment?.samples ?? [];
  return (
    <MapContainer
      center={[-0.5, -90.5]}
      zoom={7}
      scrollWheelZoom
      style={{
        height: "100%",
        width: "100%",
        background: "#0b2331",
        zIndex: 0,
      }}
    >
      <Selection state={state} selected={selectedCase} />
      <LayersControl position="topright">
        <LayersControl.Overlay name="Online street basemap (optional)">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Coordinate grid">
          <LayerGroup>
            {[-93, -92, -91, -90, -89, -88, -87].map((lon) => (
              <Polyline
                key={lon}
                positions={[
                  [-3.5, lon],
                  [2.5, lon],
                ]}
                pathOptions={{ color: "#284653", weight: 1 }}
              >
                <Tooltip sticky>{lon}° longitude</Tooltip>
              </Polyline>
            ))}
            {[-3, -2, -1, 0, 1, 2].map((lat) => (
              <Polyline
                key={lat}
                positions={[
                  [lat, -93],
                  [lat, -87],
                ]}
                pathOptions={{ color: "#284653", weight: 1 }}
              >
                <Tooltip sticky>{lat}° latitude</Tooltip>
              </Polyline>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Protected areas · reference demo">
          <LayerGroup>
            {state.sentinel.protected_areas?.map((area, i) => (
              <Polygon
                key={i}
                positions={area.geometry.coordinates.map((r) => r.map(ll))}
                pathOptions={{ color: "#a78bfa", weight: 1, fillOpacity: 0.08 }}
              >
                <Popup>
                  <strong>{area.properties.name}</strong>
                  <p>REFERENCE / DEMO GEOMETRY</p>
                  {area.properties.source}
                  <p>Official lineage and retrieval time unverified.</p>
                </Popup>
              </Polygon>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Security risk · derived">
          <LayerGroup>
            {state.sentinel.risk_zones.map((z, i) => (
              <Polygon
                key={i}
                positions={z.coordinates.map((r) => r.map(ll))}
                pathOptions={{
                  color: "#fb7185",
                  weight: 1.5,
                  fillOpacity: 0.16,
                }}
              >
                <Popup>DERIVED · SENTINEL investigation risk geometry</Popup>
              </Polygon>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Vessels / tracks">
          <LayerGroup>
            {state.sentinel.cases.map((v) => {
              const p = position(v.geometry);
              return p ? (
                <LayerGroup key={v.vessel_id}>
                  {v.geometry.type === "LineString" && (
                    <Polyline
                      positions={v.geometry.coordinates.map(ll)}
                      pathOptions={{ color: "#fb7185", weight: 2 }}
                    />
                  )}
                  <CircleMarker
                    center={ll(p)}
                    radius={v.vessel_id === selectedCase ? 9 : 6}
                    pathOptions={{
                      color:
                        v.vessel_id === selectedCase ? "#ffffff" : "#fb7185",
                      fillColor: "#fb7185",
                      fillOpacity: 1,
                    }}
                    eventHandlers={{ click: () => onSelectCase?.(v.vessel_id) }}
                  >
                    <Tooltip>
                      {v.name} · {v.risk_score}/100
                    </Tooltip>
                    <Popup>
                      <strong>{v.name}</strong>
                      <p>
                        {v.provenance?.source_mode?.toUpperCase() ??
                          "UNVERIFIED"}{" "}
                        INPUT · DERIVED PRIORITY
                      </p>
                      <p>{v.event_time ?? "Timestamp unavailable"}</p>
                      <p>{v.provenance?.notes}</p>
                    </Popup>
                  </CircleMarker>
                </LayerGroup>
              ) : null;
            })}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay
          checked
          name="AIS gaps / event markers (when supplied)"
        >
          <LayerGroup>
            {state.sentinel.cases.map((v) => (
              <LayerGroup key={v.vessel_id}>
                {v.gap_geometry && (
                  <Polyline
                    positions={v.gap_geometry.coordinates.map(ll)}
                    pathOptions={{ color: "#fb923c", dashArray: "4 7" }}
                  >
                    <Popup>
                      AIS gap · {v.gap_start} → {v.gap_end}
                    </Popup>
                  </Polyline>
                )}
                {v.event_timeline?.map(
                  (event, i) =>
                    event.geometry && (
                      <CircleMarker
                        key={i}
                        center={ll(event.geometry.coordinates)}
                        radius={5}
                      >
                        <Popup>
                          {event.type} · {event.timestamp}
                        </Popup>
                      </CircleMarker>
                    ),
                )}
              </LayerGroup>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Baseline route · derived">
          <LayerGroup>
            {route && (
              <Polyline
                positions={route.baseline_polyline.map(ll)}
                pathOptions={{ color: "#cbd5e1", weight: 3, dashArray: "6 9" }}
              >
                <Popup>
                  DERIVED · Baseline distance{" "}
                  {route.comparison.baseline_distance_km} km
                </Popup>
              </Polyline>
            )}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Optimized route · derived">
          <LayerGroup>
            {route && (
              <Polyline
                positions={route.optimized_polyline.map(ll)}
                pathOptions={{ color: "#38bdf8", weight: 4 }}
              >
                <Popup>
                  DERIVED · {route.reroute_reason}
                  <p>
                    {route.distance_km} km · ETA proxy {route.eta_hours} h
                  </p>
                </Popup>
              </Polyline>
            )}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Marine currents · forecast">
          <LayerGroup>
            {samples.map((s, i) => {
              const angle = ((s.current_direction_deg ?? 0) * Math.PI) / 180;
              // Glyph length is deliberately fixed for readability, not a trajectory.
              const dx = Math.sin(angle) * 0.07,
                dy = Math.cos(angle) * 0.07;
              const end: Coordinate = [s.lon + dx, s.lat + dy];
              return (
                <LayerGroup key={i}>
                  <Polyline
                    positions={[ll([s.lon, s.lat]), ll(end)]}
                    pathOptions={{ color: "#67e8f9", weight: 2 }}
                  />
                  <Polyline
                    positions={[
                      ll([
                        end[0] - dx * 0.4 + dy * 0.3,
                        end[1] - dy * 0.4 - dx * 0.3,
                      ]),
                      ll(end),
                      ll([
                        end[0] - dx * 0.4 - dy * 0.3,
                        end[1] - dy * 0.4 + dx * 0.3,
                      ]),
                    ]}
                    pathOptions={{ color: "#67e8f9", weight: 2 }}
                  />
                  <CircleMarker
                    center={ll([s.lon, s.lat])}
                    radius={3}
                    pathOptions={{ color: "#67e8f9" }}
                  >
                    <Popup>
                      FORECAST · {s.source}
                      <p>
                        {s.current_speed_ms?.toFixed(3)} m/s ·{" "}
                        {s.current_direction_deg}°
                      </p>
                      <p>Valid: {s.time} · cached</p>
                      <p>
                        Single-site field approximation. Retrieved{" "}
                        {s.provenance?.retrieved_at ?? "time unavailable"}.
                      </p>
                    </Popup>
                  </CircleMarker>
                </LayerGroup>
              );
            })}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay name="Wave / SST context · forecast">
          <LayerGroup>
            {samples.map((s, i) => (
              <CircleMarker
                key={i}
                center={ll([s.lon, s.lat])}
                radius={12}
                pathOptions={{ color: "#818cf8", weight: 1, fillOpacity: 0.15 }}
              >
                <Popup>
                  FORECAST · {s.source}
                  <p>
                    Wave {s.wave_height_m ?? "—"} m / {s.wave_period_s ?? "—"} s
                  </p>
                  <p>
                    SST {s.sst_c ?? "—"} °C · valid {s.time}
                  </p>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay name="Debris observations · simulated">
          <LayerGroup>
            {state.cleaner.clusters.flatMap((c) =>
              c.source_points.map((p, i) => (
                <CircleMarker
                  key={`${c.cluster_id}-${i}`}
                  center={ll(p)}
                  radius={2}
                  pathOptions={{ color: "#fbbf24" }}
                >
                  <Popup>SIMULATED · curated offshore input</Popup>
                </CircleMarker>
              )),
            )}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay
          checked
          name="Debris clusters · simulated inputs"
        >
          <LayerGroup>
            {state.cleaner.clusters.map((c) => (
              <CircleMarker
                key={c.cluster_id}
                center={ll(c.centroid)}
                radius={8}
                pathOptions={{ color: "#fbbf24", fillOpacity: 0.7 }}
              >
                <Tooltip>
                  {c.cluster_id} · {c.estimated_mass_kg} kg
                </Tooltip>
                <Popup>
                  SIMULATED INPUT · {c.cluster_id}
                  <p>
                    {c.estimated_mass_kg} kg · {c.source}
                  </p>
                  <p>{c.provenance?.notes}</p>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay
          checked
          name="Debris drift +2 / +6 / +12h · derived"
        >
          <LayerGroup>
            {state.cleaner.clusters.map((c) => (
              <LayerGroup key={c.cluster_id}>
                <Polyline
                  positions={[
                    ll(c.centroid),
                    ...(c.predicted_positions ?? []).map((p) => ll(p.position)),
                  ]}
                  pathOptions={{
                    color: "#fbbf24",
                    weight: 2,
                    dashArray: "3 6",
                  }}
                />
                {c.predicted_positions?.map((p) => (
                  <CircleMarker
                    key={p.horizon_hours}
                    center={ll(p.position)}
                    radius={5}
                    pathOptions={{ color: "#fbbf24", fillOpacity: 0.12 }}
                  >
                    <Tooltip>
                      +{p.horizon_hours}h · {c.cluster_id}
                    </Tooltip>
                    <Popup>
                      DERIVED · +{p.horizon_hours}h
                      <p>
                        Source: {p.source} · input {p.input_time}
                      </p>
                      <p>Valid {p.valid_time ?? "unknown"}</p>
                    </Popup>
                  </CircleMarker>
                ))}
              </LayerGroup>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="USV fleet · simulated">
          <LayerGroup>
            {state.cleaner.usvs?.map((u) => (
              <CircleMarker
                key={u.usv_id}
                center={ll(u.location)}
                radius={7}
                pathOptions={{
                  color: u.status === "idle" ? "#34d399" : "#94a3b8",
                  fillOpacity: 1,
                }}
              >
                <Tooltip>
                  {u.usv_id} · {u.status}
                </Tooltip>
                <Popup>
                  SIMULATED · {u.usv_id}
                  <p>
                    Battery {u.battery_pct}% · Range {u.remaining_range_km} km
                  </p>
                  <p>
                    Capacity {u.capacity_kg} kg · {u.speed_kn ?? 5} kn
                  </p>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Mission / intercept · derived">
          <LayerGroup>
            {plan?.route_sequences.map((r, i) => (
              <Polyline
                key={i}
                positions={r.map(ll)}
                pathOptions={{ color: "#34d399", weight: 2 }}
              >
                <Popup>
                  DERIVED · simulated USV round trip · no land-avoidance model
                </Popup>
              </Polyline>
            ))}
            {plan?.intercept_points?.map((p) => (
              <CircleMarker
                key={`${p.cluster_id}-${p.usv_id}`}
                center={ll(p.position)}
                radius={9}
                pathOptions={{ color: "#34d399", fillOpacity: 0, weight: 2 }}
              >
                <Tooltip>Intercept · {p.usv_id}</Tooltip>
                <Popup>
                  DERIVED · {p.usv_id} → {p.cluster_id}
                  <p>Intercept +{p.horizon_hours.toFixed(3)} h</p>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
      </LayersControl>
    </MapContainer>
  );
}
