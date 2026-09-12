"""
MARINEX API — Unified FastAPI Entry Point
==========================================
Registers domain routers for SENTINEL, NAVIGATOR, CLEANER, SUPERVISOR,
SOURCES, ENVIRONMENT, VESSELS, and SAR.
Provides health & digital twin state endpoints.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import USE_DEMO_DATA


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Trigger background ingest workers for configured live streaming sources."""
    try:
        from data_sources.aisstream import AISStreamClient
        client = AISStreamClient.get_instance()
        client.start_ingestion_background()
    except Exception:
        pass
    yield


app = FastAPI(
    title="MARINEX — Autonomous Maritime Intelligence & 3D Digital Twin",
    version="1.0.0",
    description="Unified API for SENTINEL vessel intelligence, NAVIGATOR route optimization, CLEANER debris interception, SUPERVISOR orchestration, and Real-World Ocean Data Feeds.",
    lifespan=lifespan,
)

# -- CORS (permissive for demo; tighten for production) --
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- Health Endpoint --
@app.get("/api/health", tags=["system"])
async def health():
    """Smoke-test endpoint — confirms the server is running."""
    return {
        "status": "ok",
        "mode": "demo" if USE_DEMO_DATA else "live",
        "version": "1.0.0",
        "agents": ["SENTINEL", "NAVIGATOR", "CLEANER", "SUPERVISOR"],
        "providers": ["HYCOM", "NOAA_ERDDAP", "NOAA_WAVE", "AISSTREAM", "GEBCO", "EIDC_LITTER", "CDSE_SAR"],
    }


# -- Domain Router Registration --
def _register_routers() -> None:
    try:
        from sentinel.router import router as sentinel_router
        app.include_router(sentinel_router, prefix="/api", tags=["sentinel"])
    except ImportError:
        pass

    try:
        from navigator.router import router as navigator_router
        app.include_router(navigator_router, prefix="/api", tags=["navigator"])
    except ImportError:
        pass

    try:
        from cleaner.router import router as cleaner_router
        app.include_router(cleaner_router, prefix="/api", tags=["cleaner"])
    except ImportError:
        pass

    try:
        from apps.api.routers.supervisor import router as supervisor_router
        app.include_router(supervisor_router, prefix="/api/supervisor", tags=["supervisor"])
    except ImportError:
        pass

    try:
        from apps.api.routers.sources import router as sources_router
        app.include_router(sources_router, prefix="/api/sources", tags=["sources"])
    except ImportError:
        pass

    try:
        from apps.api.routers.environment import router as env_router
        app.include_router(env_router, prefix="/api/environment", tags=["environment"])
    except ImportError:
        pass

    try:
        from apps.api.routers.vessels import router as vessels_router
        app.include_router(vessels_router, prefix="/api/vessels", tags=["vessels"])
    except ImportError:
        pass

    try:
        from apps.api.routers.sar import router as sar_router
        app.include_router(sar_router, prefix="/api/sar", tags=["sar"])
    except ImportError:
        pass


_register_routers()

from apps.api.dashboard import router as dashboard_router
app.include_router(dashboard_router, prefix="/api", tags=["dashboard"])


