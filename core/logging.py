"""
MARINEX Structured Logging
Provides a consistent logger factory for all modules.
"""
import logging
import sys
from core.config import LOG_LEVEL


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger with structured formatting."""
    logger = logging.getLogger(f"marinex.{name}")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))
    return logger
