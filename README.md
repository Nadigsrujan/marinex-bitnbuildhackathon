# MARINEX — Autonomous Maritime Intelligence & Ocean Response

> **Multi-agent system** for maritime threat detection, optimised routing,
> ocean debris cleanup, and bounded supervisory orchestration.

## Quick Start

```bash
# Install dependencies
pip install pydantic fastapi uvicorn pytest

# Validate all canonical data
python scripts/validate_demo_data.py

# Run full test suite
pytest tests/ -v

# Start API server
python -m uvicorn apps.api.main:app --port 8000
```

## Architecture

| Agent | Owner | Role |
|-------|-------|------|
| **SENTINEL** | Member 1 | Threat detection & explainable risk scoring |
| **NAVIGATOR** | Member 2 | Environmental route optimisation |
| **CLEANER** | Member 3 | Debris clustering & USV mission planning |
| **SUPERVISOR** | Member 4 | Bounded orchestration & unified dashboard |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | System health check |
| `GET` | `/api/cases` | All vessel cases (risk desc) |
| `GET` | `/api/cases/{id}` | Single vessel case |
| `GET` | `/api/risk-zones` | Risk zone polygons for NAVIGATOR |
| `POST` | `/api/route/optimize` | Baseline vs optimised route |

## Hero Corridor

**Eastern Tropical Pacific / Galapagos Marine Reserve**
- Bounding Box: Lat -3.5° to +2.5°, Lon -93.0° to -87.0°
- Origin: [-88.5, 1.2] (Panama approach)
- Destination: [-91.5, -1.8] (southwest transit)

## Project Structure

```
marinex/
├── apps/api/main.py          # FastAPI entry point
├── core/                     # Config & logging
├── schemas/models.py         # 8 canonical Pydantic models
├── sentinel/                 # M1: Threat detection
├── navigator/                # M2: Route optimisation
├── data/demo/                # Demo fixtures & examples
├── tests/                    # Test suites
├── scripts/                  # Utility scripts
├── HANDOFF.md                # Team handoff contract
└── .env.example              # Environment template
```
