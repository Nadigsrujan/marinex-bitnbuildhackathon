# MARINEX — Autonomous 3D Maritime Digital Twin & Operations Command
## Complete System Documentation & Technical Reference Manual

---

## 1. Executive Summary

**MARINEX** is an operational-grade, real-data-backed 3D Maritime Digital Twin and decision-support command system for the **Galápagos Marine Reserve (GMR)** and the broader Eastern Tropical Pacific corridor. 

The platform integrates multi-modal satellite observations, real-time AIS transponder streams, operational hydrodynamic forecasting models, and coastal plastic survey datasets to power four coordinated autonomous intelligence engines:

1. **SENTINEL (Vessel Threat Intelligence & Dark Ship Detection)**: Ingests real-time AIS transponder positions and satellite SAR swaths to evaluate dark vessel activity, transponder gaps, speed anomalies, and illegal incursions into Marine Protected Areas (MPAs).
2. **NAVIGATOR (Current- & Wave-Aware Eco-Routing Engine)**: Uses multi-objective A* graph search over live HYCOM surface current vectors and NOAA GFS-Wave fields to compute fuel-optimal, security-aware maritime transit corridors.
3. **CLEANER (Plastic Litter Drift Advection & Autonomous USV Dispatch)**: Anchors coastal plastic survey transects (EIDC 2023 data), calculates forward Lagrangian drift trajectories (+3h, +6h, +12h) using live current vectors, and solves the multi-vehicle routing problem for autonomous cleanup vessels.
4. **SUPERVISOR (Deterministic Orchestrator & Auditability Engine)**: Coordinates the sub-engines into a unified, transparent operational decision with complete mathematical provenance and zero non-deterministic LLM hallucinations in numerical pathways.

---

## 2. System Architecture

```
                    REAL-WORLD SCIENTIFIC & OPERATIONAL PROVIDERS
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │  AISStream   │   │  HYCOM NRT   │   │ NOAA ERDDAP  │   │ NOAA NOMADS  │   │  GEBCO 2024  │
  │ Real-time AIS│   │ Ocean Flow   │   │ VIIRS Chl/SST│   │  GFS-Waves   │   │  Bathymetry  │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         │                  │                  │                  │                  │
         ▼                  ▼                  ▼                  ▼                  ▼
  ┌──────────────────────────────────────────────────────────────────────────────────────────┐
  │                       MARINEX ADAPTER LAYER (data_sources/)                              │
  │   - Circuit Breakers  - Bounded Timeouts  - Offline Snapshot Fallbacks  - TTL Caching    │
  └────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                               │
                                               ▼
  ┌──────────────────────────────────────────────────────────────────────────────────────────┐
  │                         DATA REGISTRY & CANONICAL DIGITAL TWIN                           │
  │                  (Health Registry, Provenance Metadata, Coordinate Transforms)           │
  └───────┬────────────────────────────────────┼────────────────────────────────────┬────────┘
          │                                    │                                    │
          ▼                                    ▼                                    ▼
  ┌───────────────┐                    ┌───────────────┐                    ┌───────────────┐
  │   SENTINEL    │                    │   NAVIGATOR   │                    │    CLEANER    │
  │ AIS gap/speed │                    │ Multi-obj A*  │                    │ Real EIDC lit.│
  │ Suspicion/SAR │                    │ Current/Wave  │                    │ Drift & USVs  │
  └───────┬───────┘                    └───────┬───────┘                    └───────┬───────┘
          │                                    │                                    │
          └────────────────────────────────────┼────────────────────────────────────┘
                                               ▼
                               ┌───────────────────────────────┐
                               │          SUPERVISOR           │
                               │ Deterministic Orchestrator    │
                               │ Audit Trace & DAG Graph Engine│
                               └───────────────┬───────────────┘
                                               │
                                               ▼
                               ┌───────────────────────────────┐
                               │    FASTAPI UNIFIED ROUTERS    │
                               │  /sources, /environment, etc. │
                               └───────────────┬───────────────┘
                                               │ (REST JSON API)
                                               ▼
                               ┌───────────────────────────────┐
                               │   3D WEBGL COMMAND CENTER     │
                               │   (Deck.gl + React + Next.js) │
                               └───────────────────────────────┘
```

---

## 3. Scientific Data Ingestion Layer (`data_sources/`)

MARINEX implements the **Adapter Pattern** with strict fail-soft mechanisms across all external data feeds:

| Provider File | Source / Institution | Data Product | Update Frequency | Provenance Badge | Fallback Mechanism |
|---|---|---|---|:---:|---|
| `aisstream.py` | AISstream.io | Real-time global AIS WebSocket | Continuous | `LIVE` | Bundled historical Galápagos transponder logs (`CACHED`) |
| `hycom.py` | HYCOM Consortium / NOAA | GOFS 3.1 3D Ocean Surface Currents ($u, v$) | 3-hourly | `NRT` | Island wake flow vector physics model (`FALLBACK`) |
| `noaa_erddap.py` | NOAA CoastWatch | VIIRS Chlorophyll-a & MUR SST | Daily | `OBSERVED` | Climatological regional bio-physical raster (`CACHED`) |
| `noaa_wave.py` | NOAA NCEP / NOMADS | GFS-Wave Regional Wave Height & Period | 6-hourly | `FORECAST` | Regional wind-wave empirical dispersion model (`FALLBACK`) |
| `gebco.py` | GEBCO / UNESCO-IOC | 15 arc-second Seafloor Bathymetry | Static Ref | `REFERENCE` | Pre-calculated 0.05° Galápagos submarine grid (`REFERENCE`) |
| `cdse_sar.py` | Copernicus Data Space (ESA) | Sentinel-1 SAR Scenes & Swaths | 6–12 days | `OBSERVED` | Archived Galápagos SAR radar contact targets (`CACHED`) |
| `debris_galapagos.py` | EIDC / UK NERC | Santa Cruz Island 2023 Plastic Surveys | Field Survey | `OBSERVED` | Calibrated coastal pollution pressure anchors (`OBSERVED`) |
| `health_registry.py` | MARINEX Internal | Feed Health, Latency & Provenance Registry | Real-time | `DERIVED` | In-memory telemetry bus with millisecond timers |

---

## 4. Domain Engines Deep Dive

### 4.1. SENTINEL — Vessel Threat Intelligence & Dark Ship Detection
- **Objective**: Identify unauthorized vessels exhibiting evasive behaviors around protected maritime corridors.
- **Core Algorithms**:
  - **AIS Gap Detection**: Evaluates transponder silence intervals ($\Delta t \ge 2.0\text{h}$) against expected reporting rates.
  - **MPA Boundary Incursion**: Ray-casting point-in-polygon intersection against official Galápagos Marine Reserve (GMR) GIS polygons.
  - **Environmental Context Correlation**: Correlates dark gap periods with high chlorophyll-a ($>0.5\,\text{mg/m}^3$) and optimal SST ($19\text{–}24^\circ\text{C}$) zones indicative of pelagic fishing grounds.
  - **Risk Scoring Engine**: Deterministic weighted formula:
    $$\text{Score} = w_{\text{gap}}\cdot S_{\text{gap}} + w_{\text{mpa}}\cdot S_{\text{mpa}} + w_{\text{speed}}\cdot S_{\text{speed}} + w_{\text{env}}\cdot S_{\text{env}}$$
    where $\sum w_i = 100\%$. Outputs classifications: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

### 4.2. NAVIGATOR — Environmental & Security Eco-Routing Engine
- **Objective**: Compute multi-objective maritime transit corridors minimizing fuel consumption and travel time while detouring around active risk volumes.
- **Core Algorithms**:
  - **Graph Representation**: Discretized navigable maritime grid over the Eastern Tropical Pacific.
  - **Current & Wave Cost Projection**: Modifies edge traversal cost based on angle between vessel heading vector $\vec{v}_{\text{ship}}$ and current velocity $\vec{v}_{\text{current}}$:
    $$\Delta v = \|\vec{v}_{\text{current}}\|\cos(\theta)$$
    - Tail currents reduce fuel consumption and ETA.
    - Head currents penalize speed and increase fuel burn.
    - Wave heights ($>2.5\text{m}$) add quadratic wave-resistance penalties.
  - **Multi-Objective Cost Function**:
    $$J(\text{route}) = w_{\text{fuel}}\cdot C_{\text{fuel}} + w_{\text{time}}\cdot C_{\text{time}} + w_{\text{sec}}\cdot C_{\text{security}} + w_{\text{mpa}}\cdot C_{\text{mpa}}$$
  - **A\* Optimization**: Finds the Pareto-optimal path with real-time dynamic re-weighting via UI sliders.

### 4.3. CLEANER — Debris Drift Forecasting & Autonomous Fleet Dispatch
- **Objective**: Intercept moving marine debris clusters before they impact sensitive coastal nesting habitats.
- **Core Algorithms**:
  - **Field Anchors**: Ingests real 2023 Santa Cruz Island EIDC micro/macro-plastic survey transects.
  - **Lagrangian Drift Advection**: Time-stepped forward numerical integration driven by live HYCOM surface current vectors:
    $$\vec{x}(t + \Delta t) = \vec{x}(t) + \left(\vec{v}_{\text{current}} + \alpha \vec{v}_{\text{wind}}\right)\Delta t$$
    Generates forecasted cluster locations at $t+3\text{h}$, $t+6\text{h}$, and $t+12\text{h}$.
  - **Fleet Feasibility & Dispatch Engine**: Solves the constrained Vehicle Routing Problem (VRP) for autonomous surface vessels (USVs), respecting battery endurance, cruising speed, and payload capacity.

### 4.4. SUPERVISOR — Deterministic Orchestrator & Traceability Bus
- **Objective**: Aggregate outputs across SENTINEL, NAVIGATOR, and CLEANER into a cohesive, auditable command decision.
- **Core Capabilities**:
  - **Execution DAG**: Traces every sensor feed to intermediate transformations and final actions.
  - **Trade-off Calculation**: Formulates explicit operational trade-offs (e.g., fuel penalty vs. security buffer).
  - **Deterministic Guarantee**: 100% reproducible execution paths with structured JSON logging.

---

## 5. Unified REST API Endpoints

### Data Feeds & Digital Twin
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Smoke-test health check and active provider inventory |
| `GET` | `/api/sources/status` | Unified health, latency, and provenance registry for all 8 providers |
| `GET` | `/api/sources/{id}` | Telemetry and config diagnostics for a specific provider |
| `GET` | `/api/environment/current-grid` | HYCOM surface current vector field ($u, v$, speed, direction) |
| `GET` | `/api/environment/waves` | NOAA GFS-Wave significant wave height, direction, and period |
| `GET` | `/api/environment/sst` | NOAA CoastWatch MUR Sea Surface Temperature raster |
| `GET` | `/api/environment/chlorophyll` | NOAA CoastWatch VIIRS Chlorophyll-a concentration grid |
| `GET` | `/api/environment/bathymetry/region`| GEBCO 2024 regional seafloor bathymetry elevation grid |
| `GET` | `/api/environment/summary` | Aggregated regional metocean conditions |
| `GET` | `/api/vessels/live` | Real-time normalized AIS tracks and contacts in AOI |
| `GET` | `/api/vessels/{mmsi}/track` | Historical AIS telemetry trajectory for a given vessel |
| `GET` | `/api/sar/scenes` | Copernicus Sentinel-1 SAR acquisition metadata and footprints |

### Domain Intelligence
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cases` | SENTINEL dark vessel investigation case queue |
| `GET` | `/api/cases/{case_id}` | Detailed case dossier with AIS gap telemetry and environmental evidence |
| `GET` | `/api/risk-zones` | 3D risk volume geometries and threat classifications |
| `POST` | `/api/route/optimize` | NAVIGATOR multi-objective environmental route optimizer |
| `GET` | `/api/debris/clusters` | CLEANER debris cluster priors and EIDC survey transects |
| `GET` | `/api/debris/drift` | Time-stepped plastic debris drift advection trajectories |
| `POST` | `/api/cleanup/optimize` | CLEANER USV fleet dispatch and trajectory optimizer |
| `POST` | `/api/supervisor/run` | SUPERVISOR deterministic end-to-end orchestration cycle |

---

## 6. 3D WebGL Digital Twin Features (`dashboard/`)

- **Dominating 3D Viewport**: Occupies 70% of the screen area, rendering high-performance WebGL layers via Deck.gl.
- **Layers Rendered**:
  1. *Animated Current Streamlines*: Real-time velocity-colored hydrodynamic flow particles.
  2. *Wave Direction Grid*: 3D vector cones indicating wave propagation and height.
  3. *Chlorophyll & SST Heat Surfaces*: Satellite bio-physical raster overlays.
  4. *GEBCO 3D Bathymetry*: Extruded submarine floor topography.
  5. *3D MPA Boundary Walls*: Glowing vertical extruded barriers around the Galápagos Marine Reserve.
  6. *3D Risk Volumes*: Semi-transparent threat cylinders over suspicious activity zones.
  7. *Directional Vessels & AIS Gap Trails*: Color-coded transponder status indicators.
  8. *Copernicus SAR Footprints*: Radar acquisition swath polygons.
  9. *Debris Drift Forecast*: Time-stepped advection paths (+3h, +6h, +12h).
  10. *USV Sweep Routes*: Autonomous vessel search patterns and debris intercept corridors.
  11. *Baseline vs. Optimized Corridors*: Visual delta route comparisons with waypoint waymarkers.
- **Camera Presets & Cinematic Tour**:
  - `OVERVIEW` (Tactical regional view)
  - `THREAT` (Hero dark vessel focus)
  - `ROUTE` (Eco-routing corridor focus)
  - `ENVIRONMENT` (Hydrodynamic and bathymetric focus)
  - `CLEANUP` (Coastal debris and USV mission focus)
  - *Automated Tour Mode*: Hands-free smooth camera transitions across all 5 operational focus areas.
- **Operational HUD Panels**:
  - *Interactive Objective Weight Sliders*: Real-time adjustment of Fuel, Time, Security, and MPA penalty weights.
  - *Data Lineage DAG*: Visual node-and-edge graph mapping providers $\to$ models $\to$ decisions.
  - *Source Health Drawer*: Real-time feed status, latency, and fallback diagnostics.
  - *Decision Explanation Waterfall*: Step-by-step mathematical reasoning and trade-off metrics.

---

## 7. Verification & Automated Test Suite

The test suite covers **107 unit and integration tests** across 6 core packages:

```bash
python -m pytest tests/ -v
================= 107 passed, 100 warnings in 98.59s =================
```

### Test Breakdown:
- `tests/data_sources/test_adapters.py`: 13 tests verifying HYCOM, NOAA ERDDAP, NOAA Waves, AISStream, GEBCO, CDSE SAR, EIDC 2023, Health Registry, and API endpoints.
- `tests/cleaner/`: 15 tests covering Lagrangian drift forecasting, VRP optimization, and fleet dispatch.
- `tests/navigator/`: 25 tests verifying A* routing determinism, wave/current cost models, edge penalties, and coordinate validation.
- `tests/sentinel/`: 26 tests covering AIS gap analysis, MPA boundary crossings, GFW enrichment, and environmental evidence correlation.
- `tests/supervisor/`: 18 tests verifying multi-agent orchestration, trace generation, confidence bounds, and decision consistency.
- `tests/integration/`: 10 end-to-end multi-agent cycle tests.

---

## 8. Operator Quick Start & Execution Guide

### Starting the Backend
```bash
# From workspace root
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```

### Starting the Frontend
```bash
cd dashboard
npm run dev
```

Open **`http://localhost:3000`** in any WebGL2-compatible browser (Chrome, Edge, Firefox).
