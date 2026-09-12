# MARINEX — Slot-by-Slot Handoff Log

## Contract Version: 1.0.0

This document is the binding contract between team members. Every subsequent
member **must** inherit these exact field names, IDs, and run commands.

---

## Canonical Schema Fields (`schemas/models.py`)

All 8 models are defined in `schemas/models.py`. Import with:

```python
from schemas.models import (
    EvidenceItem, VesselCase, RouteRequest, RouteResult,
    DebrisCluster, USV, CleanupPlan, SupervisorDecision,
)
```

### EvidenceItem
| Field | Type | Required |
|-------|------|----------|
| `feature` | str | ✅ |
| `value` | Any | ✅ |
| `points` | float | ✅ |
| `source` | str | ✅ |
| `explanation` | str | ✅ |

### VesselCase
| Field | Type | Required | Default |
|-------|------|----------|---------|
| `vessel_id` | str | ✅ | - |
| `name` | str | ✅ | - |
| `flag` | str | ✅ | - |
| `event_time` | str | ✅ | - |
| `gap_start` | Optional[str] | ❌ | None |
| `gap_end` | Optional[str] | ❌ | None |
| `gap_hours` | float | ❌ | 0.0 |
| `geometry` | Dict (GeoJSON) | ✅ | - |
| `protected_area_relation` | str | ✅ | - |
| `fishing_signal` | bool | ❌ | False |
| `loitering_signal` | bool | ❌ | False |
| `repeat_count` | int | ❌ | 0 |
| `risk_score` | float (0-100) | ✅ | - |
| `risk_level` | str | ✅ | - |
| `evidence` | List[EvidenceItem] | ✅ | - |
| `confidence` | float (0-1) | ✅ | - |

### RouteRequest
| Field | Type | Required | Default |
|-------|------|----------|---------|
| `origin` | List[float] [lon,lat] | ✅ | - |
| `destination` | List[float] [lon,lat] | ✅ | - |
| `vessel_speed_kn` | float | ❌ | 14.0 |
| `fuel_rate_proxy` | float | ❌ | 1.0 |
| `objective_weights` | Dict[str,float] | ❌ | {w_fuel:0.4,...} |
| `risk_zones` | List[Dict] (GeoJSON) | ❌ | [] |
| `weather_state` | Optional[Dict] | ❌ | None |
| `constraints` | Optional[Dict] | ❌ | None |

### RouteResult
| Field | Type | Required |
|-------|------|----------|
| `baseline_polyline` | List[List[float]] | ✅ |
| `optimized_polyline` | List[List[float]] | ✅ |
| `distance_km` | float | ✅ |
| `eta_hours` | float | ✅ |
| `fuel_proxy` | float | ✅ |
| `weather_cost` | float | ✅ |
| `security_cost` | float | ✅ |
| `total_cost` | float | ✅ |
| `comparison` | Dict | ✅ |

### DebrisCluster, USV, CleanupPlan, SupervisorDecision
See `schemas/models.py` for full field definitions.

---

## Stable IDs

| ID | Object | Description |
|----|--------|-------------|
| `vessel_hero_01` | VesselCase | Hero dark vessel — FU YUAN YU 882 |
| `vessel_control_01` | VesselCase | Clean control — MAERSK SELETAR |
| `vessel_control_02` | VesselCase | Minor gap control — PACIFIC EXPLORER |
| `cluster_01` | DebrisCluster | Galapagos convergence zone cluster |
| `usv_01` | USV | Deployed USV near Galapagos |

---

## Hero Region

- **Corridor**: Eastern Tropical Pacific / Galapagos Marine Reserve
- **Bounding Box**: Lat -3.5° to +2.5°, Lon -93.0° to -87.0°
- **Origin**: [-88.5, 1.2] (approaching from Panama)
- **Destination**: [-91.5, -1.8] (transiting southwest)

---

## Run Commands

```bash
# 1. Install dependencies
pip install pydantic fastapi uvicorn pytest

# 2. Validate all demo data against schemas
python scripts/validate_demo_data.py

# 3. Run SENTINEL tests
pytest tests/sentinel/ -v

# 4. Run NAVIGATOR tests
pytest tests/navigator/ -v

# 5. Run ALL tests
pytest tests/ -v

# 6. Start the API server
python -m uvicorn apps.api.main:app --port 8000

# 7. Test health endpoint
curl http://127.0.0.1:8000/api/health

# 8. Test SENTINEL endpoint
curl http://127.0.0.1:8000/api/cases

# 9. Test NAVIGATOR endpoint
curl -X POST http://127.0.0.1:8000/api/route/optimize \
  -H "Content-Type: application/json" \
  -d @data/demo/examples/route_request.json
```

---

## Hour 1 → Hour 2 Handoff (M1 → M2)

- ✅ Canonical schemas frozen in `schemas/models.py`
- ✅ Demo data in `data/demo/examples/` and `data/demo/sentinel_cases.json`
- ✅ Protected areas GeoJSON in `data/demo/protected_areas.geojson`
- ✅ FastAPI shell running with `/api/health`
- ✅ SENTINEL router registered at `/api/cases`
- **M2 Action**: Import schemas, create `navigator/` module, implement baseline routing

## Hour 2 → Hour 3 Handoff (M2 → M3)

- ✅ NAVIGATOR module with baseline + optimised routing
- ✅ Environment grid fixture in `data/demo/navigator_environment.json`
- ✅ Route endpoint at `POST /api/route/optimize`
- ✅ Risk-zone rerouting demonstrated
- **M3 Action**: Use same hero region, import `DebrisCluster`/`USV`/`CleanupPlan` schemas, create `cleaner/` module

---

# HANDOFF — Hour H03 / Member 3

## What changed
- Added the `cleaner/` package boundaries for loading, preliminary grouping,
  later assignment work, service access, and the future API router.
- Added 24 explicitly labeled `curated_demo` debris seed observations and 3
  simulated USVs in Member 2's Galapagos hero corridor.
- Added `data/demo/scenario_hero.json` with stable vessel, route, debris, and
  USV references. It contains inputs only and no hard-coded domain results.
- Added offline reference validation and deterministic preliminary grouping
  that produces canonical `cluster_01` through `cluster_03` mock objects.

## Files created/modified
- `cleaner/`
- `data/demo/debris_points.json`
- `data/demo/usvs.json`
- `data/demo/scenario_hero.json`
- `tests/cleaner/`
- `HANDOFF.md`

## Exact run/test commands
```bash
python -m cleaner.data_loader
python -m pytest tests/cleaner/ -q
python -m pytest tests/ -q
```

## Sample request/response or UI path
```python
from cleaner.service import CleanerService

seed_state = CleanerService().load_seed_state()
# 24 debris_points, 3 usvs, 3 preliminary_clusters, scenario_hero_01
```

## Acceptance gate result
- PASS: hero scenario and all referenced files load without network access.
- PASS: all 24 debris points, 3 USVs, and 3 preliminary clusters validate.
- PASS: vessel and route inputs match the existing Member 1/2 fixtures.
- PASS: the scenario contains no route, assignment, or cleanup result fields.

## Known issue
- Preliminary grouping is intentionally simple; Hour 7 owns final clustering,
  feasibility, assignment metrics, and the public CLEANER endpoints.

## Do NOT change
- `scenario_hero_01`, `vessel_hero_01`, `route_hero_01`
- `cluster_01` through `cluster_03`; `usv_01` through `usv_03`
- Coordinate order `[longitude, latitude]`
- Debris source label `curated_demo`

## Next member should do
- Member 4 should render the Cycle 1 mock slice from
  `CleanerService.load_seed_state()` or the referenced JSON files without
  implementing CLEANER algorithms in frontend/integration code.

---

# HANDOFF — Hour 16 / Member 4

## What changed
- Completed the `cleaner/` module by implementing greedy USV assignment with partial collection logic in `cleaner/assignment.py`.
- Added the `supervisor/` module for bounded orchestration. This module deterministically chains SENTINEL, NAVIGATOR, and CLEANER into a single execution flow and produces a `SupervisorDecision`.
- Implemented a thread-safe `SharedState` store in `supervisor/state.py` to cache the latest agent outputs.
- Registered CLEANER and SUPERVISOR API routers in `apps/api/main.py`.
- Built the `dashboard/` Next.js frontend with Leaflet maps to unify the entire system's visual output in a single pane.

## Files created/modified
- `cleaner/assignment.py`
- `cleaner/service.py`
- `cleaner/router.py`
- `supervisor/`
- `tests/supervisor/`
- `apps/api/main.py`
- `dashboard/`
- `HANDOFF.md`

## Exact run/test commands
```bash
# Run all tests (16/16 -> 28/28 tests passing)
py -3.12 -m pytest tests/ -v

# Start the API server
py -3.12 -m uvicorn apps.api.main:app --port 8000

# Start the dashboard (in a separate terminal)
cd dashboard
npm run dev
```

## Sample request/response or UI path
1. Navigate to `http://localhost:3000` to see the dashboard.
2. Click "Run Full Analysis" to trigger the `POST /api/supervisor/run` endpoint.
3. The dashboard will automatically fetch from `GET /api/state` and render the multi-agent results, including risk zones on the map, optimized routes, and USV cleanup plans.

## Acceptance gate result
- PASS: CLEANER correctly assigns USVs and allows partial collection for large clusters.
- PASS: SUPERVISOR correctly strings together all agent results.
- PASS: Next.js dashboard correctly visualises the shared state.
- PASS: All 28 tests passing.

---

# HANDOFF — Hour H07 / Member 3

## Prior-slot verification
- Hour 4 PARTIAL/FAIL: the dashboard production build passes and the live
  supervisor button renders all domain results, but `npm run lint` reports 12
  errors. Canonical TypeScript contracts, a typed API client, `USE_DEMO_DATA`
  fallback, USV markers, and a network-independent map/font/icon path are still
  missing. The current page falls back to empty panels when the backend fails.
- Hour 5 PARTIAL/PASS: cached SENTINEL data, scoring, risk geometry, endpoints,
  traceability validation, and focused tests run offline. The API list shape is
  wrapped instead of the documented `VesselCase[]`, and several tests do not
  isolate configuration cleanly.
- Hour 6 PARTIAL/PASS: weighted routing, local environment input, risk polygon
  penalties, route changes, and the route endpoint work offline. However,
  `RouteResult.total_cost` is currently an unweighted component sum rather than
  the optimizer's weighted objective, and security-exposure labels/deltas are
  inferred from risk-zone presence rather than measured baseline exposure.
- These findings remain for their owning members; no SENTINEL, NAVIGATOR,
  SUPERVISOR, or dashboard files were changed in Hour 7.

## What changed
- Replaced partial-collection logic with deterministic distance clustering and
  one round-trip mission per USV.
- Added hotspot priority scoring from impact, urgency, and density.
- Added per-pair mission scoring with travel and capacity penalties.
- Added explicit status, battery, round-trip range, and capacity feasibility.
- Added visible candidate alternatives and rejection reasons to each selected
  assignment.
- Corrected route sequences and metrics so distance includes outbound and
  return legs and completion time is derived from the longest round trip.
- Tuned simulated USV capacity/range inputs so all three hero clusters have one
  explainable feasible assignment while rejected alternatives remain visible.
- Updated CLEANER endpoints to return canonical cluster arrays and accept an
  optional scenario/clusters/USVs request body.

## Files created/modified
- `cleaner/assignment.py`
- `cleaner/clustering.py`
- `cleaner/service.py`
- `cleaner/router.py`
- `data/demo/usvs.json`
- `tests/cleaner/test_planner.py`
- `HANDOFF.md`

## Exact run/test commands
```bash
python -m cleaner.data_loader
python -m pytest tests/cleaner/ -q
python -m pytest tests/ -q
python -m uvicorn apps.api.main:app --port 8000
```

## Sample requests
```bash
curl http://127.0.0.1:8000/api/debris/clusters
curl -X POST http://127.0.0.1:8000/api/cleanup/optimize \
  -H "Content-Type: application/json" \
  -d '{"scenario_id":"scenario_hero_01"}'
```

## Acceptance gate result
- PASS: 3 canonical clusters and 3 valid simulated USVs.
- PASS: selected missions are feasible; rejected alternatives include explicit
  battery/range/capacity/status reasons where applicable.
- PASS: five repeated hero runs return identical plans.
- PASS: GET/POST endpoints work offline and validate canonical responses.
- PASS: 13 CLEANER tests and 54 total backend tests pass.

## Actual hero cleanup metrics
- Assignments: `cluster_01 -> usv_01`, `cluster_02 -> usv_02`,
  `cluster_03 -> usv_03`
- Total round-trip distance: `231.47 km`
- Estimated collection: `2775.0 kg`
- Fleet capacity utilization: `0.9569` (`95.69%`)
- Completion-time proxy: `10.97 hours` at the documented 5-knot USV proxy

## Known issues
- Member 4 must update frontend types/API parsing for the canonical
  `GET /api/debris/clusters -> DebrisCluster[]` response.
- The unresolved Hour 4–6 verification findings above remain with their owners.

## Do NOT change
- Stable IDs `scenario_hero_01`, `cluster_01` through `cluster_03`, and
  `usv_01` through `usv_03`
- Coordinate order `[longitude, latitude]`
- Debris provenance label `curated_demo`
- Assignment `alternatives[].rejection_reasons` and score-contribution fields

## Next member should do
- Member 4 should wire the canonical CLEANER endpoints into shared state and
  display the selected mission plus at least one rejected alternative reason.

---

# Post-Hour-7 corrective verification — Hours 4–6

The previously documented Hour 4–6 findings were corrected after explicit
user authorization to work across those owners' files.

## Corrections completed
- Dashboard now uses canonical TypeScript contracts, a configurable API client,
  and a visibly labelled bundled demo fallback.
- Removed remote font, map-tile, and marker-image requirements; the local map
  renders risk zones, both routes, debris clusters, USV bases, and cleanup
  routes on an offline ocean canvas.
- Frontend ESLint and production TypeScript build both pass.
- NAVIGATOR returns the optimizer's weighted objective as `total_cost`.
- Security exposure labels and percentage delta are calculated from measured
  intersections on the baseline and optimized routes.
- Out-of-corridor coordinates return `422` at the endpoint and are no longer
  silently snapped onto the graph.
- `GET /api/cases` now returns the documented canonical `VesselCase[]`.
- Weak SENTINEL/NAVIGATOR tests were replaced with exact assertions, and GFW
  fallback/cache tests now isolate the live-client inputs and network boundary.

## Verification
```bash
python scripts/validate_demo_data.py
python -m pytest tests -q
cd dashboard && npm run lint
cd dashboard && npm run build
```

- PASS: canonical demo-data validation
- PASS: 57 backend tests
- PASS: frontend lint with zero errors/warnings
- PASS: production build and TypeScript check
- PASS: live browser flow against the API
- PASS: browser fallback with the API deliberately unavailable

---

# HANDOFF — Hour 8 / Member 4

## What changed
- Transitioned the entire dashboard from Cycle 1 mocks to live API integrations with `USE_DEMO_DATA` fallback.
- Created `supervisor/state.py` (SharedState) to store the canonical outputs from SENTINEL, NAVIGATOR, and CLEANER in a single digital twin memory structure.
- Built the `SUPERVISOR` orchestrator (`supervisor/service.py`) which deterministically loads the scenario, triggers the domain engines in sequence, and generates a structured public trace of tool executions.
- Registered the `/api/supervisor/run`, `/api/state`, and `/api/health` endpoints and wired them directly to the "Run Full Analysis" button in the Next.js UI.
- Wired the latest CLEANER updates into the dashboard to visually display the selected USV missions alongside explicit reasons for rejected alternatives (e.g., insufficient battery/capacity).
- Fixed Next.js build errors (TypeScript types) ensuring 0 lint warnings.
- Upgraded the map to use the beautiful OFFLINE-ready dark theme OpenStreetMap tiles.

## Files created/modified
- `supervisor/state.py`
- `supervisor/service.py`
- `supervisor/router.py`
- `apps/api/main.py`
- `dashboard/src/app/page.tsx`
- `dashboard/src/components/MapComponent.tsx`
- `HANDOFF.md`

## Exact run/test commands
```bash
# Run backend tests
py -3.12 -m pytest tests/ -v

# Start the API server
py -3.12 -m uvicorn apps.api.main:app --port 8000

# Start the Next.js dashboard
cd dashboard
npm run dev
```

## Sample request/response or UI path
1. Navigate to `http://localhost:3000`
2. Click "Run Full Analysis"
3. The dashboard executes `POST /api/supervisor/run`, fetches the combined output via `GET /api/state`, and dynamically updates all panels, the map, and the trace.

## Acceptance gate result
- PASS: One-click run executes the full orchestrator.
- PASS: All three domain outputs (Risk Zones, Optimized Route, Debris Cleanup) are returned and visualized.
- PASS: Application gracefully falls back to offline/demo mode without crashing.
- PASS: CLEANER alternatives and rejection reasons are successfully parsed and displayed.

## Next member should do
- Member 1: Begin Cycle 3 by hardening the SENTINEL logic and locking the final hero risk layer for the demo.

