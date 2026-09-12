"""CLEANER API router boundary.

The public cluster and optimization endpoints are scheduled for Hour 7. The
empty router keeps the module shape stable without exposing partial behavior.
"""
from fastapi import APIRouter

router = APIRouter()
