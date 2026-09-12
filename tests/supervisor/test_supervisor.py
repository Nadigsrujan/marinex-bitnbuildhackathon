"""SUPERVISOR + CLEANER integration tests.

Validates the complete cross-agent chain produces correct canonical
objects with all required fields.
"""
import pytest

from schemas.models import CleanupPlan, SupervisorDecision
from cleaner.service import CleanerService
from supervisor.service import SupervisorService
from supervisor.state import SharedState


# ── CLEANER Assignment Tests ──────────────────────────────────────────

class TestCleanerAssignment:

    def test_optimize_cleanup_returns_cleanup_plan(self):
        """optimize_cleanup() must return a valid CleanupPlan."""
        svc = CleanerService()
        plan = svc.optimize_cleanup()
        assert isinstance(plan, CleanupPlan)
        assert plan.total_distance_km > 0
        assert plan.estimated_collection_kg > 0
        assert 0 <= plan.capacity_utilization <= 1.0
        assert plan.completion_time_hours > 0

    def test_assignments_reference_valid_ids(self):
        """Each assignment must reference a known USV and cluster."""
        svc = CleanerService()
        clusters = svc.get_clusters()
        usvs = svc.get_usvs()
        plan = svc.optimize_cleanup(clusters=clusters, usvs=usvs)

        cluster_ids = {c.cluster_id for c in clusters}
        usv_ids = {u.usv_id for u in usvs}

        for a in plan.assignments:
            assert a["usv_id"] in usv_ids, f"Unknown USV: {a['usv_id']}"
            assert a["cluster_id"] in cluster_ids, f"Unknown cluster: {a['cluster_id']}"

    def test_no_overallocation(self):
        """No USV should be assigned more mass than its capacity."""
        svc = CleanerService()
        usvs = svc.get_usvs()
        plan = svc.optimize_cleanup()

        usv_caps = {u.usv_id: u.capacity_kg for u in usvs}
        usv_loads: dict = {u.usv_id: 0.0 for u in usvs}

        for a in plan.assignments:
            usv_loads[a["usv_id"]] += a["estimated_collection_kg"]

        for uid, load in usv_loads.items():
            assert load <= usv_caps[uid] + 0.01, (
                f"USV {uid} overallocated: {load} > {usv_caps[uid]}"
            )

    def test_route_sequences_nonempty(self):
        """Route sequences should contain at least the USV base location."""
        svc = CleanerService()
        plan = svc.optimize_cleanup()
        assert len(plan.route_sequences) > 0
        for route in plan.route_sequences:
            assert len(route) >= 2  # base + at least one cluster


# ── SUPERVISOR Orchestration Tests ────────────────────────────────────

class TestSupervisorOrchestration:

    def test_run_hero_produces_valid_decision(self):
        """Full cross-agent chain must return a valid SupervisorDecision."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert isinstance(decision, SupervisorDecision)

    def test_all_agents_called(self):
        """SENTINEL, NAVIGATOR, and CLEANER must all be called."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert "SENTINEL" in decision.agents_called
        assert "NAVIGATOR" in decision.agents_called
        assert "CLEANER" in decision.agents_called

    def test_tool_outputs_present(self):
        """Tool outputs must contain keys for all three agents."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert "sentinel" in decision.tool_outputs
        assert "navigator" in decision.tool_outputs
        assert "cleaner" in decision.tool_outputs

    def test_trace_has_all_steps(self):
        """The trace must contain at least 5 steps."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert len(decision.trace) >= 5
        # Each step must have required fields
        for step in decision.trace:
            assert "step" in step
            assert "agent" in step
            assert "tool" in step
            assert "timestamp" in step

    def test_tradeoffs_nonempty(self):
        """At least one tradeoff should be identified."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert len(decision.tradeoffs) >= 1

    def test_recommendation_mentions_vessel(self):
        """Recommendation should reference the hero vessel."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert "FU YUAN YU 882" in decision.recommendation

    def test_confidence_in_range(self):
        """Confidence must be between 0 and 1."""
        svc = SupervisorService()
        decision = svc.run_hero_scenario()
        assert 0.0 <= decision.confidence <= 1.0


# ── Shared State Tests ────────────────────────────────────────────────

class TestSharedState:

    def test_state_updated_after_supervisor_run(self):
        """State should be fully populated after a SUPERVISOR run."""
        svc = SupervisorService()
        svc.run_hero_scenario()
        state = SharedState()
        s = state.get_state()

        assert s["last_updated"] is not None
        assert s["scenario_id"] == "scenario_hero_01"
        assert len(s["sentinel"]["cases"]) > 0
        assert len(s["sentinel"]["risk_zones"]) > 0
        assert s["navigator"]["route_result"] is not None
        assert len(s["cleaner"]["clusters"]) > 0
        assert s["cleaner"]["cleanup_plan"] is not None
        assert s["supervisor"]["last_decision"] is not None
