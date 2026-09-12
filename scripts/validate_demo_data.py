#!/usr/bin/env python3
"""
MARINEX — Schema Validation Script
====================================
Validates all canonical JSON examples and demo fixtures against
Pydantic models.  Run as:

    python scripts/validate_demo_data.py

Exits with code 0 on full success, non-zero on any failure.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from schemas.models import (
    EvidenceItem,
    VesselCase,
    RouteRequest,
    RouteResult,
    DebrisCluster,
    USV,
    CleanupPlan,
    SupervisorDecision,
)

EXAMPLES_DIR = PROJECT_ROOT / "data" / "demo" / "examples"
DEMO_DIR = PROJECT_ROOT / "data" / "demo"

# Mapping of JSON file basename → Pydantic model class
EXAMPLE_MAP = {
    "evidence_item.json": EvidenceItem,
    "vessel_case.json": VesselCase,
    "route_request.json": RouteRequest,
    "route_result.json": RouteResult,
    "debris_cluster.json": DebrisCluster,
    "usv.json": USV,
    "cleanup_plan.json": CleanupPlan,
    "supervisor_decision.json": SupervisorDecision,
}

# Additional fixture files → model/type
FIXTURES = [
    (DEMO_DIR / "sentinel_cases.json", VesselCase, True),  # is_list
]


def validate_single(path: Path, model_cls, label: str) -> bool:
    """Validate a single JSON file against a Pydantic model."""
    try:
        with open(path, "r") as f:
            data = json.load(f)
        model_cls(**data)
        print(f"  ✅  {label}")
        return True
    except Exception as e:
        print(f"  ❌  {label}: {e}")
        return False


def validate_list(path: Path, model_cls, label: str) -> bool:
    """Validate a JSON array of objects against a Pydantic model."""
    try:
        with open(path, "r") as f:
            data = json.load(f)
        if not isinstance(data, list):
            print(f"  ❌  {label}: expected a JSON array, got {type(data).__name__}")
            return False
        ok = True
        for i, item in enumerate(data):
            try:
                model_cls(**item)
            except Exception as e:
                print(f"  ❌  {label}[{i}]: {e}")
                ok = False
        if ok:
            print(f"  ✅  {label} ({len(data)} items)")
        return ok
    except Exception as e:
        print(f"  ❌  {label}: {e}")
        return False


def main() -> int:
    print("=" * 60)
    print("MARINEX Schema Validation")
    print("=" * 60)
    all_ok = True

    # 1. Canonical examples
    print("\n📋 Canonical Examples (data/demo/examples/):")
    for filename, model_cls in EXAMPLE_MAP.items():
        path = EXAMPLES_DIR / filename
        if not path.exists():
            print(f"  ❌  {filename}: FILE NOT FOUND")
            all_ok = False
            continue
        if not validate_single(path, model_cls, filename):
            all_ok = False

    # 2. Fixture files
    print("\n📋 Demo Fixtures:")
    for path, model_cls, is_list in FIXTURES:
        label = str(path.relative_to(PROJECT_ROOT))
        if not path.exists():
            print(f"  ❌  {label}: FILE NOT FOUND")
            all_ok = False
            continue
        if is_list:
            if not validate_list(path, model_cls, label):
                all_ok = False
        else:
            if not validate_single(path, model_cls, label):
                all_ok = False

    # 3. Summary
    print("\n" + "=" * 60)
    if all_ok:
        print("✅  ALL VALIDATIONS PASSED")
    else:
        print("❌  SOME VALIDATIONS FAILED")
    print("=" * 60)

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
