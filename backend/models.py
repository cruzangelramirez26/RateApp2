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
    # Fecha con la que se registra la cancion cuando es NUEVA en la DB.
    # Existe por el backfill (Mejoras.txt seccion 8): al catalogar los ~1,500
    # Me Gusta viejos hay que fecharlos con su primera escucha real, no con
    # hoy. Sin esto, una cancion de 2021 entraria como si fuera de este
    # cuatrimestre y acabaria en Latte 2026 y en la Galeria Anual — encima
    # arriba de todo, porque el bloque de novedades la veria recien llegada.
    #
    # Solo aplica al INSERT: upsert_track nunca pisa added_at al re-calificar,
    # asi que la fecha original se conserva para siempre.
    # Formato: "YYYY-MM-DD HH:MM:SS".
    added_at: Optional[str] = None


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


class MigrateRequest(BaseModel):
    track_ids: list[str]
    to_cuatrimestre: str


class PlayContextRequest(BaseModel):
    """Reproducir un track DENTRO del contexto de una playlist."""
    track_id: str
    playlist_id: Optional[str] = None   # default: <3333>
    shuffle_off: bool = True            # apaga shuffle para respetar el orden
