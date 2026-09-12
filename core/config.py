"""
MARINEX Core Configuration
Centralizes all settings from environment variables with safe defaults.
"""
import os
from pathlib import Path


def _load_local_env() -> None:
    """Load an ignored project .env without overriding process settings."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_local_env()

# -- Project Paths --
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DEMO_DIR = DATA_DIR / "demo"
CACHE_DIR = DATA_DIR / "cache"
EXAMPLES_DIR = DEMO_DIR / "examples"

# -- Mode --
USE_DEMO_DATA: bool = os.getenv("USE_DEMO_DATA", "true").lower() in ("true", "1", "yes")

# -- GFW (Global Fishing Watch) --
GFW_API_TOKEN: str = os.getenv("GFW_API_TOKEN", "")
GFW_BASE_URL: str = "https://gateway.api.globalfishingwatch.org/v3"
GFW_TIMEOUT_S: int = int(os.getenv("GFW_TIMEOUT_S", "30"))

# -- Copernicus Marine Service --
COPERNICUS_USER: str = os.getenv("COPERNICUS_USER", "")
COPERNICUS_PASSWORD: str = os.getenv("COPERNICUS_PASSWORD", "")
COPERNICUS_BASE_URL: str = "https://data.marine.copernicus.eu"
COPERNICUS_TIMEOUT_S: int = int(os.getenv("COPERNICUS_TIMEOUT_S", "60"))
COPERNICUS_CACHE_TTL_S: int = int(os.getenv("COPERNICUS_CACHE_TTL_S", "3600"))

# -- Server --
API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("API_PORT", "8000"))
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

# -- Hero Region Constants (Galapagos / Eastern Tropical Pacific) --
HERO_BBOX = {
    "lat_min": -3.5,
    "lat_max": 2.5,
    "lon_min": -93.0,
    "lon_max": -87.0,
}
HERO_ORIGIN = [-88.5, 1.2]       # [lon, lat] approaching from Panama
HERO_DESTINATION = [-91.5, -1.8]  # [lon, lat] transiting southwest
