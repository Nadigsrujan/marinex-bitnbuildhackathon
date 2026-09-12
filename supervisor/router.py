"""SUPERVISOR — FastAPI Router.

Exposes bounded orchestration and shared state endpoints:
    POST  /api/supervisor/run  — Execute full cross-agent chain
    GET   /api/state           — Return current shared system state
"""
from fastapi import APIRouter

from supervisor.service import SupervisorService
from supervisor.state import SharedState

router = APIRouter()
_service = SupervisorService()
_state = SharedState()


@router.post("/supervisor/run")
async def run_supervisor():
    """
    Execute the full MARINEX cross-agent chain:
    SENTINEL → NAVIGATOR → CLEANER → SupervisorDecision.

    Returns a structured decision with tool trace, tradeoffs,
    and recommendation.
    """
    decision = _service.run_hero_scenario()
    return decision.model_dump()


@router.get("/state")
async def get_state():
    """
    Return the current shared system state.

    Updated after each SUPERVISOR run with outputs from all agents.
    """
    return _state.get_state()
