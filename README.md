# MARINEX — Autonomous 3D Maritime Digital Twin & Ocean Response Command

An autonomous, real-data-backed 3D maritime digital twin and multi-agent operations command center integrating dark vessel threat intelligence (SENTINEL), multi-objective current-aware route optimization (NAVIGATOR), Lagrangian marine debris drift advection and USV swarm cleanup (CLEANER), and deterministic multi-agent orchestration with audit trails (SUPERVISOR).

---

## 1. System Overview & Architecture

MARINEX unifies satellite Earth observation, hydrodynamic numerical modeling, live global AIS vessel streams, and autonomous agent decision-making into an interactive 3D WebGL operational digital twin.

```
                   REAL DATA FEEDS (AISSTREAM, OPEN-METEO, NOAA, GEBCO, GFW)
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
                       │  Execution Lineage & Audit Trace     │
                       └───────────────────┬──────────────────┘
                                           ▼
                       ┌──────────────────────────────────────┐
                       │      CESIUM 3D COMMAND CENTER        │
                       │    Global Fleet & Corridor Matrix    │
                       └──────────────────────────────────────┘
```

---

## 2. Core Autonomous Multi-Agent Capabilities

### SENTINEL — Vessel Threat Intelligence & Anomaly Detection
- **Dark Vessel Tracking**: Detects suspicious AIS transponder shutdowns, transmission gaps, and loitering behaviors near sensitive waters.
- **Multi-Feature Risk Engine**: Calculates normalized risk scores ($0-100$) derived from gap duration, MPA proximity, speed anomalies, and fishing indicators.
- **Electronic Interference & Spoofing Analysis**: Flags GNSS position discrepancies and non-compliant traffic separation deviations.

### NAVIGATOR — Multi-Objective Hydrodynamic Routing Engine
- **Current-Aligned Optimization**: Incorporates real-time oceanic surface currents (HYCOM / Open-Meteo) and significant wave height models (NOAA GFS-Wave).
- **Pareto-Optimal Frontier**: Balances competing transit objectives including fuel consumption, time-of-arrival (ETA), weather hazard exposure, and threat zone avoidance.
- **Dynamic Objective Weighting**: Live UI slider controls allow operators to adjust weights ($w_{fuel}$, $w_{time}$, $w_{weather}$, $w_{security}$) with real-time recalculation.

### CLEANER — Lagrangian Drift Simulation & USV Swarm Fleet Planner
- **Time-Stepped Particle Advection**: Simulates offshore debris transport from $0.0\text{h}$ to $+12.0\text{h}$ using local current vectors and Lagrangian dispersion ensembles.
- **Autonomous USV Swarm Dispatch**: Matches autonomous surface vessels (USVs) to predicted moving debris centroids based on payload capacity, range, and battery reserves.
- **Interactive Drift Animation Controls**: Floating dock providing Play/Pause simulation, $0.0\text{h}-12.0\text{h}$ time scrubber slider, $0.5\text{x}-5.0\text{x}$ speed multipliers, and camera zoom focus.

### SUPERVISOR — Deterministic Bounded Orchestration
- **Consensus & Arbitration**: Evaluates outputs across SENTINEL, NAVIGATOR, and CLEANER to eliminate routing conflicts and validate operational safety.
- **Execution Trace & Replay**: Complete step-by-step timeline of agent tool calls, input states, duration metrics, and deterministic state transitions.

---

## 3. Global Multi-Region Maritime Corridor Matrix

MARINEX provides full multi-region digital twin intelligence across six major global maritime corridors:

| Region | Category | Coordinates | Bathymetric Depth | Operational Focus |
|---|---|---|---|---|
| **Galapagos Sanctuary** | Marine Sanctuary | 0.829° S, 90.982° W | 2,840m | UNESCO protected area, IUU fishing buffer, Cromwell undercurrent advection. |
| **Malacca Strait** | Global Chokepoint | 2.500° N, 102.500° E | 85m | High-density TSS channel, Singapore global container corridor, collision mitigation. |
| **Strait of Hormuz** | Energy Transit | 26.300° N, 56.300° E | 120m | Persian Gulf energy passage, GNSS electronic interference & dark spoofing surveillance. |
| **Panama Canal Approaches** | Canal Approach | 8.800° N, 79.500° W | 65m | Trans-oceanic gateway convergence, anchorage waiting queue optimization, biosecurity. |
| **Red Sea & Bab-el-Mandeb** | Security Corridor | 12.800° N, 43.300° E | 1,400m | Volcanic rift trench, asymmetric threat dynamic corridor rerouting. |
| **Great Barrier Reef** | Coral Bio-Reserve | 18.200° S, 147.500° E | 1,150m | UNESCO Coral Sea park, mandatory eco-speed enforcement, USV reef sweep. |

---

## 4. Data Provenance & Reality Matrix

| Domain | Entity | Classification | Source / Provider | Description |
|---|---|---|---|---|
| **Environment** | Ocean Current Vectors ($u, v$, speed, dir) | `NRT` / `OBSERVED` | Open-Meteo Marine / HYCOM | Real-time surface hydrodynamic current vector fields. |
| **Environment** | Significant Wave Height & Period | `FORECAST` | NOAA NOMADS GFS-Wave | Operational regional wave forecast grids. |
| **Environment** | Sea Surface Temperature | `OBSERVED` | NOAA CoastWatch VIIRS | Satellite-derived bio-physical marine observation. |
| **Topography** | Seafloor Bathymetry & 3D Terrain | `REFERENCE` | GEBCO 2024 Grid / Carto Basemap | High-resolution seafloor elevation and coastline morphology. |
| **Protected Areas**| Marine Reserves & TSS Boundaries | `REFERENCE` | Protected Planet WDPA / GIS | Official marine protected area and separation scheme boundaries. |
| **Vessels** | Live AIS Fleet Telemetry | `LIVE` / `STREAM` | AISstream.io WebSocket | Real-time global vessel contacts (2,000+ live positions). |
| **Threat Intel** | Risk Zones & Vessel Cases | `DERIVED` | SENTINEL Evaluator | Derived from AIS gap duration, speed profile, and MPA proximity. |
| **Routing** | Multi-Objective Optimized Route | `DERIVED` | NAVIGATOR A* Engine | Multi-objective corridor minimizing fuel, ETA, and risk exposure. |
| **Marine Debris** | Coastal Plastic Prior Clusters | `OBSERVED` | EIDC / NERC Survey Dataset | Surveyed coastal plastic transects used as baseline pollution anchors. |
| **Debris Drift** | Offshore Lagrangian Advection | `DERIVED` | MARINEX Advection Ensemble | Time-stepped dispersion driven by hydrodynamic current vectors. |
| **USV Fleet** | Autonomous Surface Vessels | `SIMULATED` | MARINEX Fleet Specifications | Autonomous USV operational profiles (battery, payload, range). |
| **USV Missions** | Debris Intercept & Dispatch | `DERIVED` | CLEANER Planner | Constraint-satisfaction assignment matching USVs to moving debris. |

---

## 5. Technology Stack

- **Backend Architecture**:
  - Python 3.10+ / FastAPI / Uvicorn ASGI Server
  - Asyncio WebSocket ingestion pipeline for live global AIS streaming
  - Deterministic algorithms: A* graph search, Lagrangian advection, constraint optimization
  - Pytest test suite with 110 automated unit and integration tests

- **Frontend Application**:
  - Next.js 16 (App Router) / React 19 / TypeScript / Turbopack
  - CesiumJS 3D WebGL Globe with hardware-accelerated particle animation
  - Stitch Design System: `Plus Jakarta Sans` typography, `JetBrains Mono` telemetry, Sand/Linen aesthetic palette
  - Zero emojis across the entire UI and documentation

- **External Integrations**:
  - AISstream.io (Live global AIS WebSocket stream)
  - Open-Meteo Marine API (Near-real-time oceanic currents and waves)
  - NOAA CoastWatch & NOMADS (Satellite SST and GFS-Wave forecasts)
  - Global Fishing Watch (GFW vessel identity and event registry)
  - Copernicus CDSE (Sentinel-1 SAR acquisition metadata)
  - Protected Planet WDPA (World Database on Protected Areas)

---

## 6. Quick Start Guide

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher (Node 20+ recommended)
- npm or yarn

### 1. Repository Setup
```bash
git clone https://github.com/Nadigsrujan/marinex-bitnbuildhackathon.git
cd marinex-bitnbuildhackathon
```

### 2. Backend Installation & Execution
```bash
# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# (Optional) Set up your environment variables
cp .env.example .env

# Run the complete test suite (110 passing tests)
pytest

# Start the FastAPI backend server on port 8000
python -m uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Installation & Execution
```bash
# In a separate terminal, navigate to dashboard directory
cd dashboard

# Install npm dependencies
npm install

# Verify production build
npm run build

# Start Next.js development server on port 3000
npm run dev
```

Open **`http://localhost:3000`** in your browser to access the MARINEX Command Center.

---

## 7. Environment Variables Configuration (`.env`)

```env
# Operating Mode (false = live feeds with fallback; true = verified offline snapshot)
USE_DEMO_DATA=false

# Real-Time Global AIS Ingestion (AISstream.io WebSocket)
AISSTREAM_API_KEY=your_aisstream_api_key_here

# Global Fishing Watch (Vessel identity enrichment)
GFW_API_TOKEN=your_gfw_token_here

# Copernicus Data Space Ecosystem - Sentinel-1 SAR (Optional)
CDSE_CLIENT_ID=your_cdse_client_id
CDSE_CLIENT_SECRET=your_cdse_client_secret

# Open-Meteo Marine (Default free endpoint — no key required)
```

---

## 8. API Reference

### Real-Time Telemetry & Digital Twin Stream
- `GET /api/realtime/snapshot` — Current Ocean Pulse snapshot, contacts, freshness, uncertainty metrics, and active provider health.
- `GET /api/realtime/stream` — Browser-native Server-Sent Events (SSE) stream (2-second heartbeat).
- `GET /api/sources/status` — Unified provider health, latency benchmarks, and data provenance registry.

### Environmental & Physical Oceanography
- `GET /api/environment/current-grid` — Hydrodynamic current vector field ($u, v$ components, speed, direction).
- `GET /api/environment/waves` — Regional significant wave height, peak period, and swell direction.
- `GET /api/environment/sst` — Sea Surface Temperature grid.
- `GET /api/bathymetry/region` — Seafloor depth profile and regional bathymetry.
- `GET /api/sar/scenes` — Copernicus Sentinel-1 SAR acquisition metadata and footprints.

### Multi-Agent Intelligence & Optimization
- `GET /api/cases` — SENTINEL dark vessel investigation queue and risk scoring.
- `GET /api/risk-zones` — Computed spatial risk volume polygons.
- `POST /api/route/optimize` — NAVIGATOR multi-objective Pareto route optimizer.
- `GET /api/debris/clusters` — CLEANER debris concentration cluster priors.
- `GET /api/debris/drift` — Time-stepped Lagrangian drift advection trajectories ($0.0\text{h}-12.0\text{h}$).
- `POST /api/cleanup/optimize` — CLEANER autonomous USV fleet dispatch and mission assignment.
- `POST /api/supervisor/run` — SUPERVISOR deterministic end-to-end multi-agent execution pipeline.

---

## 9. Verification & Test Suite

MARINEX includes an automated test suite verifying all domain logic, API adapters, and digital twin workflows:

```bash
# Run all backend unit and integration tests
pytest -v

# Results: 110 passed in 1.4s
```

Frontend compilation and type safety:
```bash
cd dashboard
npm run build

# Results: Compiled successfully, 0 TypeScript errors
```

---

## 10. Failover & Reliability Guarantees

1. **Deterministic Offline Fallbacks**: Every network integration contains bounded timeouts and falls back seamlessly to cached near-real-time observations if upstream APIs are unreachable.
2. **Transparent Data Lineage**: Every visual element in the UI includes transparent provenance metadata indicating whether data is `LIVE`, `OBSERVED`, `DERIVED`, or `SIMULATED`.
3. **Graceful Degradation**: Missing optional API keys will never crash or block the 3D digital twin.
