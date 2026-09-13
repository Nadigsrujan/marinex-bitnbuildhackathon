# MARINEX Transformation Plan

## Product thesis

MARINEX should become a time-aware marine research and response operating system, not a dashboard that merely draws several datasets. Its differentiator is a shared, replayable digital-twin state in which every observation, forecast, estimate, and decision carries time, uncertainty, and provenance.

## Audit summary

- The four domain engines are real deterministic code with strong tests, but most hero inputs are curated or cached.
- AISStream already has a background WebSocket worker; the browser previously had no push channel and could not show rolling contacts.
- Several HYCOM/NOAA adapters currently generate plausible analytical fields rather than retrieving the named upstream products. Their provenance must remain explicit until true provider ingestion replaces them.
- Debris motion uses a single-vector deterministic forecast and fleet assignment uses a greedy heuristic. Both are excellent demo baselines but not research-grade uncertainty or optimization.
- The Deck.gl map has useful layers but lacked a common time control, contact freshness, and a clear distinction between observed and estimated position.
- The Supervisor is auditable but request-driven. It should ultimately react to typed events such as AIS gaps, new SAR scenes, forecast changes, and mission constraint violations.

## Target architecture

1. **Ingest plane**: persistent AIS, Open-Meteo/CMEMS, Earth-observation, and research-data adapters write canonical time-stamped events.
2. **Twin state**: append-only observations plus materialized current state; PostGIS/TimescaleDB for tracks and rasters, Redis Streams for low-latency fan-out.
3. **Fusion plane**: correlate AIS, SAR contacts, protected areas, forecast fields, and debris particles with explicit confidence and uncertainty.
4. **Decision plane**: Sentinel, Navigator, Cleaner, and Supervisor consume the same event envelope and publish versioned decisions.
5. **Experience plane**: a WebGL space-time canvas with NOW/forecast/replay modes, uncertainty geometry, layer provenance, alerts, and explainable what-if controls.

## Delivery phases

### Phase 1 — Ocean Pulse foundation (implemented in this change)

- Server-Sent Events stream plus REST snapshot.
- Thread-safe rolling AIS reads and monotonic ingest cursor.
- Separate observed fix, cached fix, and dead-reckoned estimate contracts.
- Track and uncertainty rendering in Deck.gl.
- Live heartbeat/status strip and NOW to +12h twin-time scrubber.
- Token-free MapLibre basemap path.
- Optional Open-Meteo customer key support; free prototype access remains keyless.

### Phase 2 — Real environmental cube

- Replace procedural HYCOM/NOAA layers with scheduled, bounded regional subsets.
- Store `valid_time`, `run_time`, `retrieved_at`, spatial resolution, provider, and cache status on every cell.
- Query Open-Meteo Marine for forecast waves, SST, and currents in one batched regional sampling job.
- Add wind forcing from Open-Meteo Weather and expose a synchronized forecast timeline.

### Phase 3 — Dark-vessel sensor fusion

- Subscribe to live AIS and detect gaps using vessel-specific expected reporting intervals.
- Pull Sentinel-1 catalogue scenes; run a bounded CFAR/segmentation worker on cropped AOI imagery.
- Associate radar contacts to AIS using spatial-temporal gating and publish unmatched-contact probability surfaces.
- Add alert acknowledgment, investigation ownership, evidence export, and immutable audit events.

### Phase 4 — Probabilistic ocean research tools

- Replace single-line debris drift with an ensemble particle cloud using current, wave/Stokes drift, windage, and diffusion.
- Visualize 50/80/95% arrival probability contours and sensitive-shoreline impact windows.
- Allow researchers to upload a CSV/GeoJSON observation set and compare model runs.
- Track model version, forcing datasets, parameters, and reproducibility seed.

### Phase 5 — Mission optimization and field operations

- Replace greedy assignment with OR-Tools MILP/CP-SAT for battery, payload, time windows, weather limits, and cooperative collection.
- Add USV telemetry adapters using MQTT and a simulator that shares the exact production schema.
- Replan only when a material event occurs and show the before/after decision delta.
- Add role-based command approval; MARINEX remains decision support until field-control certification exists.

## Hackathon demonstration narrative

1. Start at NOW with Ocean Pulse receiving AIS and environmental heartbeats.
2. A contact ages near the reserve; Sentinel raises an explainable investigation priority.
3. A SAR pass adds an unmatched radar contact and expands the uncertainty volume.
4. Supervisor publishes one versioned decision; Navigator reroutes and shows the cost delta.
5. Move the twin-time scrubber to +6h: probabilistic debris impact shifts toward a sensitive shoreline.
6. Cleaner replans the USV intercept and displays accepted and rejected assignments.
7. Open lineage to prove which observations and model versions produced every action.

## Success metrics

- AIS event-to-screen latency under 3 seconds.
- Every visual entity has classification, observed/valid/retrieval times, source, and uncertainty.
- Zero false `LIVE` labels for cached or synthetic data.
- Deterministic replay of a complete incident from stored events.
- Route and cleanup replanning under 2 seconds for the demo AOI.
- All upstream failures degrade to a visibly labeled cached state without breaking the command view.

## Configuration

- Existing `.env` keys are loaded server-side and remain gitignored.
- `AISSTREAM_API_KEY` enables the live AIS WebSocket worker.
- `OPEN_METEO_API_KEY` is optional. The public Marine API needs no key for evaluation/prototyping; a paid key switches MARINEX to the customer endpoint.
- Never place provider secrets in `dashboard/.env.local` under a `NEXT_PUBLIC_` name because those values are shipped to the browser.
