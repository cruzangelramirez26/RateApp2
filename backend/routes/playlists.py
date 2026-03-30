"""Playlist management routes."""
from fastapi import APIRouter
from typing import Optional

import spotify
import config

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.get("/mine")
def get_my_playlists():
    """Return all user playlists from Spotify."""
    sp = spotify.get_client()
    pls = spotify.get_user_playlists(sp)
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "image": (p.get("images") or [{}])[0].get("url"),
            "track_count": (p.get("tracks") or {}).get("total", 0),
        }
        for p in pls
    ]


@router.get("/distribution")
def get_distribution_playlists():
    """Return the configured distribution playlist IDs."""
    return {
        "calificar": config.CALIFICAR_PLAYLIST_ID,
        **config.DISTRIBUTION_PLAYLISTS,
    }


@router.post("/order/{playlist_id}")
def order_playlist(playlist_id: str, min_rating_order: Optional[int] = None):
    """Trigger a reorder on any playlist."""
    from routes.tracks import _order_playlist
    sp = spotify.get_client()
    _order_playlist(sp, playlist_id, min_rating_order=min_rating_order)
    return {"ok": True}
