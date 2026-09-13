# MARINEX data reality audit

The globe is global; data collection currently covers the Galápagos corridor only.
Configured credentials do not prove successful retrieval or coverage.

| Display / feature | Actual input | Interpretation |
| --- | --- | --- |
| Green AIS markers / trails | AISstream PositionReport messages through data_sources/aisstream.py and /api/realtime stream | Received vessel radio positions. Recent count excludes reports older than 180 seconds. No synthetic starter contacts are injected. Empty feed means no reports received, not no ships. |
| Amber activity markers / investigation cases | GFW historical fishing, loitering and gap events via sentinel/gfw_client.py | Past activity, not current vessel positions. Disk cache may be old; event time is shown when supplied. Risk scores are heuristic and do not establish wrongdoing. |
| Marine values in environment / risk processing | Open-Meteo API and cached marine snapshots | Model forecasts, not buoy measurements. Route fields extrapolate a single location. Some anomaly/chlorophyll defaults remain proxies. Current conditions must not be interpreted as conditions at historical GFW event times. |
| Route comparison | Optimizer with scenario endpoints, cached environmental inputs and derived risk zones | Planning simulation, not recorded ship movement or certified navigation. |
| Purple cleanup targets / drift | Curated demo debris clusters and deterministic current-based projections | Simulated targets, not satellite-observed garbage. Disabled by default on globe. |
| Protected-area outline | Bundled geometry | Approximate/unverified reference boundary, not legal authority. |
| Supervisor action | Explicit demo workflow | Demo orchestration, not live operational decision-making. |
| HYCOM, NOAA SST/chlorophyll/wave and GEBCO layers | Procedural adapters in data_sources | Not verified provider observations; removed from new globe. Legacy panels and endpoints are not evidence of live retrieval. |
| Copernicus / SAR | Scaffold / example scenes | A stored credential does not establish downloaded or processed imagery. Not displayed as real detections on new globe. |

## Keys

No Cesium token is required for the current OpenStreetMap imagery and ellipsoid globe. Real elevation terrain and ion-hosted imagery would require a separate integration with a restricted public Cesium ion token; no token is consumed by this implementation. Do not paste secret server keys into chat or frontend code.

AISSTREAM_API_KEY and GFW_API_TOKEN belong in the ignored repository `.env`. Restart the backend after changes. Open-Meteo's existing public endpoint works without a key; a paid subscription must use its matching customer endpoint configuration.

## Remaining limitations

The global camera does not expand the AIS subscription. GFW disk caching needs freshness/expiry work. Marine risk proxies and older source-health displays require further replacement before this can be described as a fully observation-backed research system. All cleanup masses, mission outcomes and navigation benefits are scenario/model outputs.
