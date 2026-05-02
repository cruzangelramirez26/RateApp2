"""Pydantic models for request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class RateRequest(BaseModel):
    track_id: str
    name: str = ""
    artist: str = ""
    album: str = ""
    rating: str = Field(..., pattern=r"^(A\+|A|B\+|B|C\+|C|D)$")


class BulkRateRequest(BaseModel):
    track_ids: list[str]
    rating: str = Field(..., pattern=r"^(A\+|A|B\+|B|C\+|C|D)$")


class TrackOut(BaseModel):
    track_id: str
    name: str
    artist: str
    album: str
    added_at: Optional[str] = None
    rating: str
    manual_order: int = 0


class PlaylistTrack(BaseModel):
    id: str
    name: str
    artist: str
    album: str
    added_at: Optional[str] = None
    rating: Optional[str] = None
    in_db: bool = False


class StatsOut(BaseModel):
    total: int
    by_rating: dict[str, int]


class VirtualStartResponse(BaseModel):
    cuatri: str
    playlist_id: str
    track_count: int
    boundaries: list[str]


class VirtualSimResult(BaseModel):
    playlist_id: str
    cuatri: str
    moved_count: int
    changes: list[dict]
    summary: str
    boundaries: list[str]


class OrderRequest(BaseModel):
    playlist_id: str
    min_rating_order: Optional[int] = None


class AplusApplyRequest(BaseModel):
    track_ids: list[str]
