"""
MARINEX API — Unified FastAPI Entry Point
==========================================
Registers domain routers for SENTINEL, NAVIGATOR, CLEANER, and SUPERVISOR.
Provides a health endpoint for smoke-testing.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import USE_DEMO_DATA

app = FastAPI(
    title="MARINEX — Autonomous Maritime Intelligence & Ocean Response",
    version="0.2.0",
    description="Unified API for SENTINEL risk detection, NAVIGATOR route optimisation, CLEANER debris response, and SUPERVISOR orchestration.",
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
        "version": "0.2.0",
        "agents": ["SENTINEL", "NAVIGATOR", "CLEANER", "SUPERVISOR"],
    }


# -- Domain Router Registration --
# Lazy imports prevent circular dependency and allow modules to be
# developed independently.
def _register_routers() -> None:
    try:
        from sentinel.router import router as sentinel_router
        app.include_router(sentinel_router, prefix="/api", tags=["sentinel"])
    except ImportError:
        pass  # SENTINEL not yet implemented — skip

    try:
        from navigator.router import router as navigator_router
        app.include_router(navigator_router, prefix="/api", tags=["navigator"])
    except ImportError:
        pass  # NAVIGATOR not yet implemented — skip

    try:
        from cleaner.router import router as cleaner_router
        app.include_router(cleaner_router, prefix="/api", tags=["cleaner"])
    except ImportError:
        pass  # CLEANER not yet implemented — skip

    try:
        from supervisor.router import router as supervisor_router
        app.include_router(supervisor_router, prefix="/api", tags=["supervisor"])
    except ImportError:
        pass  # SUPERVISOR not yet implemented — skip


_register_routers()

# Cycle A complete domain view, independent of Cycle B orchestration state.
from apps.api.dashboard import router as dashboard_router
app.include_router(dashboard_router, prefix="/api", tags=["dashboard"])
