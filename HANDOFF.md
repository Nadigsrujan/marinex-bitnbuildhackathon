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

