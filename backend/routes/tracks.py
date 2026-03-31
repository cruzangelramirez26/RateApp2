"""Track rating and listing routes."""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional
import pandas as pd

import database
import spotify
import config
import utils
from models import RateRequest, TrackOut, StatsOut

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("/pending")
def get_pending_tracks():
    """
    Return tracks from <3333> playlist that haven't been rated yet.
    Preserves Spotify playlist order.
    """
    sp = spotify.get_client()
    items = spotify.get_playlist_tracks(sp, config.CALIFICAR_PLAYLIST_ID)
    
    df = database.load_all()
    rated_ids = set()
    ratings_map = {}
    if not df.empty:
        for _, r in df.iterrows():
            tid = r["track_id"]
            rat = str(r.get("rating", "")).strip().upper()
            if rat:
                rated_ids.add(tid)
                ratings_map[tid] = rat

    tracks = []
    for it in items:
        t = it.get("track") or {}
        tid = t.get("id")
        if not tid:
            continue
        artists = t.get("artists") or [{}]
        tracks.append({
            "id": tid,
            "name": t.get("name", ""),
            "artist": artists[0].get("name", ""),
            "album": (t.get("album") or {}).get("name", ""),
            "added_at": it.get("added_at"),
            "rating": ratings_map.get(tid),
            "in_db": tid in rated_ids,
            "image": ((t.get("album") or {}).get("images") or [{}])[0].get("url"),
            "spotify_url": (t.get("external_urls") or {}).get("spotify"),
        })
    return tracks


@router.get("/recent")
def get_recent_tracks(limit: int = Query(50, ge=1, le=200)):
    """Return recently rated tracks from the database."""
    rows = database.get_recent(limit)
    return rows


@router.get("/search")
def search_tracks(q: str = Query(..., min_length=1), limit: int = Query(50, ge=1, le=200)):
    """Search tracks in the database by name or artist."""
    rows = database.search_tracks(q, limit)
    return rows


@router.get("/stats")
def get_stats():
    """Return rating distribution stats."""
    raw = database.get_stats()
    total = sum(raw.values())
    return {"total": total, "by_rating": raw}


@router.post("/rate")
def rate_track(req: RateRequest):
    """
    Rate a track. Handles:
    - Saving to DB
    - Adding/removing from cuatri, MMG, Anual playlists
    - Auto-reordering affected playlists
    """
    sp = spotify.get_client()
    tid = req.track_id
    new_rating = req.rating.strip().upper()
    
    # Get old rating
    old_track = database.get_track(tid)
    old_rating = None
    if old_track:
        old_rating = str(old_track.get("rating", "")).strip().upper() or None

    now_str = utils.now_utc_str()

    if new_rating == "D":
        database.upsert_track(tid, req.name, req.artist, req.album, now_str, "D")
        cuatri = utils.get_cuatrimestre(utils.now_utc())
        to_remove = [
            config.DISTRIBUTION_PLAYLISTS.get(cuatri),
            config.DISTRIBUTION_PLAYLISTS["mis_me_gusta"],
            config.DISTRIBUTION_PLAYLISTS["anual"],
        ]
        for pl_id in to_remove:
            if pl_id:
                try:
                    spotify.remove_from_playlist(sp, pl_id, [tid])
                except Exception:
                    pass
        return {"ok": True, "rating": "D"}

    # Save with current timestamp
    database.upsert_track(tid, req.name, req.artist, req.album, now_str, new_rating)

    # Add to cuatrimestre playlist
    cuatri = utils.get_cuatrimestre(utils.now_utc())
    cuatri_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    if cuatri_id:
        existing = set(spotify.get_playlist_track_ids(sp, cuatri_id))
        if tid not in existing:
            try:
                spotify.add_to_playlist(sp, cuatri_id, [tid])
            except Exception:
                pass

    # Handle MMG + Anual
    mmg_id = config.DISTRIBUTION_PLAYLISTS["mis_me_gusta"]
    anual_id = config.DISTRIBUTION_PLAYLISTS["anual"]

    if new_rating in config.TOP_SET:
        for pl_id in [mmg_id, anual_id]:
            try:
                existing = set(spotify.get_playlist_track_ids(sp, pl_id))
                if tid not in existing:
                    spotify.add_to_playlist(sp, pl_id, [tid])
            except Exception:
                pass
    else:
        # Remove from MMG + Anual if was in TOP_SET before
        if old_rating and old_rating in config.TOP_SET:
            for pl_id in [mmg_id, anual_id]:
                try:
                    spotify.remove_from_playlist(sp, pl_id, [tid])
                except Exception:
                    pass

    # Auto-reorder cuatrimestre
    if cuatri_id:
        _order_playlist(sp, cuatri_id, min_rating_order=1)

    # Reorder Anual if TOP_SET involved
    if new_rating in config.TOP_SET or (old_rating and old_rating in config.TOP_SET):
        _order_playlist(sp, anual_id, min_rating_order=config.RATING_ORDER["B+"])

    return {"ok": True, "rating": new_rating}


@router.get("/playlist/{playlist_id}")
def get_playlist_tracks_with_ratings(playlist_id: str):
    """Return tracks from a Spotify playlist enriched with DB ratings."""
    sp = spotify.get_client()
    items = spotify.get_playlist_tracks(sp, playlist_id)
    
    df = database.load_all()
    ratings_map = {}
    if not df.empty:
        for _, r in df.iterrows():
            ratings_map[r["track_id"]] = str(r.get("rating", "")).strip().upper()

    tracks = []
    for it in items:
        t = it.get("track") or {}
        tid = t.get("id")
        if not tid:
            continue
        artists = t.get("artists") or [{}]
        tracks.append({
            "id": tid,
            "name": t.get("name", ""),
            "artist": artists[0].get("name", ""),
            "album": (t.get("album") or {}).get("name", ""),
            "added_at": it.get("added_at"),
            "rating": ratings_map.get(tid),
            "image": ((t.get("album") or {}).get("images") or [{}])[0].get("url"),
            "spotify_url": (t.get("external_urls") or {}).get("spotify"),
        })
    return tracks


def _order_playlist(sp, playlist_id: str, min_rating_order: Optional[int] = None):
    """
    Reorder a playlist: rating desc, then date desc. Excludes D.
    Unrated tracks go to the end.
    """
    current_ids = spotify.get_playlist_track_ids(sp, playlist_id)
    if not current_ids:
        return

    df = database.load_all()
    if df.empty:
        return

    df["rating_str"] = df["rating"].astype(str).str.upper().str.strip()
    rating_map = dict(zip(df["track_id"], df["rating_str"]))

    df_in = df[df["track_id"].isin(current_ids)].copy()
    df_in = df_in[df_in["rating_str"] != "D"]
    df_in["added_at_dt"] = pd.to_datetime(df_in["added_at"], errors="coerce")
    df_in["rating_order"] = df_in["rating_str"].map(config.RATING_ORDER)

    if min_rating_order is not None:
        df_in = df_in[df_in["rating_order"] >= min_rating_order]

    df_sorted = df_in.sort_values(
        by=["rating_order", "added_at_dt"],
        ascending=[False, False],
        na_position="last",
    )
    rated_ids = df_sorted["track_id"].tolist()
    rated_set = set(rated_ids)

    unrated = [
        tid for tid in current_ids
        if tid not in rated_set
        and rating_map.get(tid, "") not in config.RATING_ORDER
    ]

    final = utils.dedupe_preserve_order(rated_ids + unrated)
    if final:
        spotify.replace_playlist(sp, playlist_id, final)


# ─── A+ Instant Detection ────────────────────────────────────────

import json
import os

CUTOFF_FILE = "a_plus_cutoff.json"


def _load_cutoff():
    if not os.path.exists(CUTOFF_FILE):
        return None
    try:
        with open(CUTOFF_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return pd.to_datetime(data.get("cutoff"), utc=True)
    except Exception:
        return None


def _save_cutoff(dt_str: str):
    with open(CUTOFF_FILE, "w", encoding="utf-8") as f:
        json.dump({"cutoff": dt_str}, f, indent=2)


@router.get("/aplus/status")
def aplus_status():
    """Check if A+ detection is active and return cutoff date."""
    cutoff = _load_cutoff()
    return {
        "active": cutoff is not None,
        "cutoff": str(cutoff) if cutoff else None,
    }


@router.post("/aplus/scan")
def aplus_scan():
    """
    Scan Spotify liked songs for new tracks added after the cutoff.
    Auto-activates with today as cutoff if not set yet.
    """
    cutoff = _load_cutoff()

    # Auto-activate: set cutoff to now and scan immediately
    if cutoff is None:
        now_str = utils.now_utc_str()
        _save_cutoff(now_str)
        cutoff = pd.to_datetime(now_str, utc=True)
        # First time: return empty since cutoff is now
        return {
            "activated": True,
            "message": "Sistema A+ activado. Cutoff fijado a hoy. Los próximos likes nuevos se detectarán.",
            "candidates": [],
        }

    sp = spotify.get_client()
    liked = spotify.get_liked_tracks_since(sp, cutoff)

    if not liked:
        return {"activated": False, "message": "No hay A+ nuevos.", "candidates": []}

    # Filter out tracks already in DB
    df = database.load_all()
    existing_ids = set(df["track_id"]) if not df.empty else set()

    candidates = []
    for t in liked:
        if t["id"] and t["id"] not in existing_ids:
            candidates.append(t)

    return {
        "activated": False,
        "message": f"Se detectaron {len(candidates)} candidatos A+." if candidates else "No hay A+ nuevos.",
        "candidates": candidates,
    }


@router.post("/aplus/apply")
def aplus_apply():
    """
    Apply A+ to all candidates: save to DB, add to cuatri + anual, reorder.
    """
    cutoff = _load_cutoff()
    if cutoff is None:
        raise HTTPException(400, "A+ detection not activated yet. Call /aplus/scan first.")

    sp = spotify.get_client()
    liked = spotify.get_liked_tracks_since(sp, cutoff)

    df = database.load_all()
    existing_ids = set(df["track_id"]) if not df.empty else set()

    candidates = [t for t in liked if t.get("id") and t["id"] not in existing_ids]

    if not candidates:
        return {"applied": 0, "message": "No hay A+ nuevos para aplicar."}

    cuatri = utils.get_cuatrimestre(utils.now_utc())
    cuatri_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    anual_id = config.DISTRIBUTION_PLAYLISTS["anual"]
    now_str = utils.now_utc_str()

    applied = 0
    for c in candidates:
        database.upsert_track(c["id"], c["name"], c["artist"], c.get("album", ""), now_str, "A+")

        if cuatri_id:
            try:
                spotify.add_to_playlist(sp, cuatri_id, [c["id"]])
            except Exception:
                pass
        try:
            spotify.add_to_playlist(sp, anual_id, [c["id"]])
        except Exception:
            pass

        applied += 1

    # Update cutoff to now
    _save_cutoff(now_str)

    # Auto-reorder
    if cuatri_id:
        _order_playlist(sp, cuatri_id, min_rating_order=1)
    _order_playlist(sp, anual_id, min_rating_order=config.RATING_ORDER["B+"])

    return {"applied": applied, "message": f"Se aplicaron {applied} canciones como A+."}
