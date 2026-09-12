"""
NAVIGATOR — Copernicus Ocean Current Environment Sampler
==========================================================
Loads a local cached ocean current grid from
data/demo/navigator_environment.json and provides u (zonal/eastward)
and v (meridional/northward) velocity vector sampling at any coordinate.

Works 100% offline from the cached environment fixture.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from core.config import DEMO_DIR
from core.logging import get_logger

logger = get_logger("navigator.environment")


class OceanEnvironment:
    """
    Sampler for ocean surface current vectors (u, v).

    The environment grid is a sparse set of known (lon, lat) → (u, v)
    data points.  Sampling at an arbitrary coordinate finds the nearest
    grid point and returns its current vector.
    """

    ENV_PATH = DEMO_DIR / "navigator_environment.json"

    def __init__(self, env_path: Optional[Path] = None):
        self._path = env_path or self.ENV_PATH
        self._grid: list = []
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            logger.warning("Environment grid not found: %s", self._path)
            return
        with open(self._path, "r") as f:
            data = json.load(f)
        self._grid = data.get("grid", [])
        logger.info(
            "Loaded %d environment grid points from %s",
            len(self._grid),
            self._path,
        )

    def sample(self, lon: float, lat: float) -> Tuple[float, float]:
        """
        Return (u, v) current vector at the given coordinate.

        u: zonal (eastward) velocity in m/s
        v: meridional (northward) velocity in m/s

        Falls back to (0.0, 0.0) if no grid data is available.
        """
        if not self._grid:
            return (0.0, 0.0)

        best_u, best_v = 0.0, 0.0
        best_dist = float("inf")

        for point in self._grid:
            p_lon = point["lon"]
            p_lat = point["lat"]
            # Simple Euclidean approximation for nearest-neighbour lookup
            d = math.sqrt((lon - p_lon) ** 2 + (lat - p_lat) ** 2)
            if d < best_dist:
                best_dist = d
                best_u = point.get("u", 0.0)
                best_v = point.get("v", 0.0)

        return (best_u, best_v)

    @property
    def grid_size(self) -> int:
        return len(self._grid)
