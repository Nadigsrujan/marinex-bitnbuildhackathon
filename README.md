# MARINEX — Autonomous 3D Maritime Digital Twin & Ocean Response Command

> **A real-data-backed 3D maritime operations digital twin integrating vessel threat intelligence (SENTINEL), current/wave-aware route optimization (NAVIGATOR), real Galapagos litter tracking and USV cleanup (CLEANER), and bounded deterministic orchestration (SUPERVISOR).**

---

## 🌊 System Architecture & Core Concept

```
                   REAL DATA FEEDS (HYCOM, NOAA, AISSTREAM, EIDC, GEBCO)
                                          │
                                          ▼
                      ┌──────────────────────────────────────┐
                      │    MARINEX SHARED DIGITAL TWIN       │
                      └───────────────────┬──────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
    ┌───────────────┐             ┌───────────────┐             ┌───────────────┐
    │   SENTINEL    │             │   NAVIGATOR   │             │    CLEANER    │
    │ Vessel Intel  │             │ Current/Wave  │             │ Real Litter & │
    │ AIS & Threat  │             │ Routing Engine│             │ USV Missions  │
    └───────┬───────┘             └───────┬───────┘             └───────┬───────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          ▼
                      ┌──────────────────────────────────────┐
                      │             SUPERVISOR               │
                      │  Deterministic Multi-Agent Orchestr. │
                      │  Public Execution & Lineage Trace    │
                      └───────────────────┬──────────────────┘
                                          ▼
                      ┌──────────────────────────────────────┐
                      │       3D WEBGL COMMAND CENTER        │
                      │   (Deck.gl 3D Twin + Tactical 2D)    │
                      └──────────────────────────────────────┘
```

---

## 📊 WHAT IS REAL vs. DERIVED vs. SIMULATED

| Domain | Entity | Classification | Source / Provider | Provenance Description |
|---|---|---|---|---|
| **Environment** | Ocean Current Vectors ($u, v$, speed, dir) | `NRT` / `OBSERVED` | HYCOM NRT / NOAA CoastWatch ERDDAP | Real-time / near-real-time oceanic hydrodynamic surface currents subset for Galapagos. |
| **Environment** | Sea Surface Temperature & Chlorophyll-a | `OBSERVED` | NOAA CoastWatch VIIRS Satellite | Real satellite-derived bio-physical marine observation grids. |
| **Environment** | Significant Wave Height & Period | `FORECAST` | NOAA NOMADS GFS-Wave / GRIB2 | Operational regional wave forecast model. |
| **Topography** | Seafloor Bathymetry & 3D Terrain | `REFERENCE` | GEBCO 2024 Grid / Satellite Basemap | Regional high-resolution seafloor topography. |
| **Protected Areas**| Galapagos Marine Reserve (GMR) | `REFERENCE` | Official GIS Boundary Polygon | Exact legal boundary polygons with no-take zones. |
| **Vessels** | AIS Positions & Tracks | `LIVE` / `HISTORICAL` | AISstream.io WebSocket / Cache | Real-time or recorded AIS transponder telemetry. |
| **Threat Intel** | Risk Zones & Suspicion Scores | `DERIVED` | SENTINEL Deterministic Evaluator | Mathematically derived from AIS gap duration, MPA proximity, and speed anomaly. |
| **Routing** | Multi-Objective Optimized Corridor | `DERIVED` | NAVIGATOR A* Ocean Engine | Calculated by projecting real HYCOM currents & wave exposure on graph edges. |
| **Marine Litter** | Santa Cruz Coastal Litter Surveys | `OBSERVED` | EIDC / NERC 2023 Galapagos Dataset | Real surveyed coastal plastic transects used as pollution-pressure anchors. |
| **Debris Drift** | Offshore Drift Advection (NOW $\to$ +12h) | `DERIVED` | MARINEX Time-stepped Advection | Deterministic Lagrangian particle advection driven by live HYCOM currents. |
| **USV Fleet** | Autonomous Surface Vessels | `SIMULATED` | MARINEX Autonomous Fleet Model | Realistic autonomous USV specifications (battery, payload capacity, operational range). |
| **USV Missions** | Debris Interception & Assignment | `DERIVED` | CLEANER Feasibility Engine | Multi-constraint optimization matching USVs to predicted moving intercept points. |

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ (Node 20+ recommended)
- npm or yarn

### 2. Backend Setup
```bash
# From repository root:
pip install -r requirements.txt

# (Optional) Copy and configure environment variables
cp .env.example .env

# Run full test suite (all 94+ unit & integration tests)
python -m pytest tests/ -v

# Start the FastAPI backend server (Port 8000)
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Dashboard Setup
```bash
cd dashboard

# Install dependencies
npm install

# Build check
npm run build

# Start Next.js development server (Port 3000)
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 📡 API Endpoints

### Data Sources & Digital Twin Core
- `GET /api/sources/status` — Unified provider health, latency, and provenance registry.
- `GET /api/environment/current-grid` — Real HYCOM / NOAA current vector field.
- `GET /api/environment/waves` — Real NOAA GFS-Wave regional height & direction grid.
- `GET /api/environment/sst` — NOAA CoastWatch Sea Surface Temperature raster data.
- `GET /api/environment/chlorophyll` — NOAA CoastWatch VIIRS Chlorophyll-a concentration.
- `GET /api/vessels/live` — Normalized real-time AIS tracks and contacts in AOI.
- `GET /api/debris/drift` — Time-stepped debris drift advection trajectories.
- `GET /api/bathymetry/region` — GEBCO regional bathymetry depth grid.
- `GET /api/sar/scenes` — Copernicus Sentinel-1 SAR acquisition metadata & footprints.
- `GET /api/realtime/snapshot` — Current Ocean Pulse contacts, tracks, freshness, uncertainty, alerts, and provider state.
- `GET /api/realtime/stream` — Browser-native Server-Sent Events stream (2-second heartbeat).

### Domain Modules
- `GET /api/cases` — SENTINEL dark vessel investigation queue.
- `GET /api/risk-zones` — Real-time computed risk volume geometries.
- `POST /api/route/optimize` — NAVIGATOR multi-objective environmental route optimizer.
- `GET /api/debris/clusters` — CLEANER debris cluster priors & EIDC observations.
- `POST /api/cleanup/optimize` — CLEANER USV fleet dispatch & feasibility assignment.
- `POST /api/supervisor/run` — SUPERVISOR deterministic end-to-end orchestration.

---

## 🔑 Environment Variables Configuration (`.env`)

```env
# MARINEX Mode
USE_DEMO_DATA=false

# Real-Time AIS Telemetry (Optional - falls back gracefully to cached AIS)
AISSTREAM_API_KEY=your_aisstream_api_key_here

# Global Fishing Watch (Optional - identity enrichment)
GFW_API_TOKEN=your_gfw_token_here

# Copernicus Data Space Ecosystem - Sentinel-1 SAR (Optional)
CDSE_CLIENT_ID=your_cdse_client_id
CDSE_CLIENT_SECRET=your_cdse_client_secret

# 3D Mapping & Basemaps (Defaults to free & open CartoCDN Dark Matter vector basemap — no token required)
```

---

## 🛡️ Robust Failover & Offline Guarantees

MARINEX is engineered to **never crash during an evaluation or hackathon demo**:
1. **Bounded Retries & Fallbacks**: Every upstream network call has bounded timeouts.
2. **Graceful Degradation**: If HYCOM or NOAA are unreachable, cached near-real-time snapshots are served with transparent `CACHED` status badges.
3. **No Unconfigured Crashes**: Missing API keys trigger `UNCONFIGURED` status and seamless fallback without blocking the 3D twin.
4. **Deterministic Reproducibility**: All domain algorithms run 100% deterministically offline without LLM hallucination.
