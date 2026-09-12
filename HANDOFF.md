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
