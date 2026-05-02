"""Playlist management routes."""
from fastapi import APIRouter, HTTPException
from typing import Optional
import pandas as pd

import spotify
import config
import database

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


_MONTH_RANGES = {"perla": (1, 4), "miel": (5, 8), "latte": (9, 12)}
_CUATRI_DISPLAY = {"perla": "Perla", "miel": "Miel", "latte": "Latte"}


@router.post("/rebuild/{cuatri}")
def rebuild_playlist(cuatri: str):
    """
    Rebuild a cuatrimestre playlist from DB records (source of truth).
    Restores tracks missing from Spotify due to truncation or errors.
    Perla is treated as frozen/historical — all its period tracks are kept regardless of migration.
    """
    if cuatri not in _MONTH_RANGES:
        raise HTTPException(400, "cuatri debe ser perla, miel o latte")

    playlist_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    if not playlist_id:
        raise HTTPException(400, f"No hay playlist configurada para '{cuatri}'")

    df = database.load_all()
    if df.empty:
        return {"ok": True, "count": 0, "message": "No hay canciones en la base de datos."}

    start_m, end_m = _MONTH_RANGES[cuatri]
    df["added_at_dt"] = pd.to_datetime(df["added_at"], errors="coerce")
    df["rating_str"] = df["rating"].astype(str).str.upper().str.strip()
    df["month"] = df["added_at_dt"].dt.month.fillna(0).astype(int)
    df["rating_order"] = df["rating_str"].map(config.RATING_ORDER)

    mask_natural = (df["month"] >= start_m) & (df["month"] <= end_m)

    if cuatri == "perla":
        # Perla is frozen — all its period tracks stay regardless of cuatrimestre_override
        mask = mask_natural
    else:
        has_col = "cuatrimestre_override" in df.columns
        if has_col:
            mask_natural_not_moved = mask_natural & (
                df["cuatrimestre_override"].isna() | (df["cuatrimestre_override"] == cuatri)
            )
            mask_migrated_in = df["cuatrimestre_override"] == cuatri
            mask = mask_natural_not_moved | mask_migrated_in
        else:
            mask = mask_natural

    df_cuatri = df[
        mask & (df["rating_str"] != "D") & (df["rating_str"] != "")
    ].copy()
    df_cuatri = df_cuatri.sort_values(
        ["rating_order", "added_at_dt"],
        ascending=[False, False],
        na_position="last",
    )

    track_ids = df_cuatri["track_id"].dropna().drop_duplicates().tolist()

    sp = spotify.get_client()
    spotify.replace_playlist(sp, playlist_id, track_ids)

    label = _CUATRI_DISPLAY.get(cuatri, cuatri.capitalize())
    return {
        "ok": True,
        "count": len(track_ids),
        "message": f"{label} reconstruida con {len(track_ids)} canciones.",
    }
