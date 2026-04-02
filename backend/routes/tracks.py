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


PLAYLIST_IDS = {
    "3333":    "1kGf7O4l7tWfhWBEMuwyNx",
    "perla":   "41CXGh7OcFkplIo6BF44OJ",
    "galeria": "4BrxCvMSNdQSOEQbRXh7WN",
    "latte":   "3DltKEaaDVOchGxfIQlPu9",
    "miel":    "5pFFpx2dYnfUdOKW4WBN3y",
}

PLAYLIST_ALIASES = {
    "3333":    ["3333", "<3333>"],
    "perla":   ["perla"],
    "galeria": ["galeria", "galería", "anual", "galería anual", "galeria anual", "26", "'26"],
    "latte":   ["latte"],
    "miel":    ["miel"],
}

def _resolve_playlist_key(q: str):
    q_lower = q.strip().lower()
    for key, aliases in PLAYLIST_ALIASES.items():
        if any(a in q_lower or q_lower in a for a in aliases):
            return key
    return None


@router.get("/library")
def library_search(q: str = ""):
    if not q.strip():
        return []

    playlist_key = _resolve_playlist_key(q)

    if playlist_key:
        playlist_id = PLAYLIST_IDS[playlist_key]
        sp = spotify.get_client()
        tracks_spotify = []
        results = sp.playlist_tracks(playlist_id, limit=100)
        while results:
            for item in results['items']:
                if not item or not item.get('track'):
                    continue
                t = item['track']
                if not t.get('id'):
                    continue
                tracks_spotify.append({
                    "id": t['id'],
                    "name": t['name'],
                    "artist": t['artists'][0]['name'] if t.get('artists') else "",
                    "album": t['album']['name'] if t.get('album') else "",
                    "image": t['album']['images'][0]['url'] if t.get('album') and t['album'].get('images') else None,
                    "added_at": item.get('added_at'),
                    "spotify_position": len(tracks_spotify),
                })
            if results.get('next'):
                results = sp.next(results)
            else:
                break

        if not tracks_spotify:
            return []

        ids = [t['id'] for t in tracks_spotify]
        conn = database._get_conn()
        cur = conn.cursor(dictionary=True)
        placeholders = ', '.join(['%s'] * len(ids))
        cur.execute(
            f"SELECT track_id, rating, manual_order FROM tracks WHERE track_id IN ({placeholders})",
            ids
        )
        db_rows = {r['track_id']: r for r in cur.fetchall()}
        cur.close()
        conn.close()

        return [
            {
                "id": t['id'],
                "name": t['name'],
                "artist": t['artist'],
                "album": t['album'],
                "image": t.get('image'),
                "rating": db_rows.get(t['id'], {}).get('rating'),
                "added_at": t['added_at'],
                "manual_order": db_rows.get(t['id'], {}).get('manual_order', t['spotify_position']),
                "spotify_position": t['spotify_position'],
            }
            for t in tracks_spotify
        ]

    else:
        q_lower = q.strip().lower()
        like = f"%{q_lower}%"
        conn = database._get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT track_id as id, name, artist, album, rating,
                   added_at, manual_order
            FROM tracks
            WHERE LOWER(name) LIKE %s OR LOWER(artist) LIKE %s
            ORDER BY added_at DESC
            LIMIT 200
        """, (like, like))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r["id"], "name": r["name"] or "",
                "artist": r["artist"] or "", "album": r.get("album") or "",
                "image": None, "rating": r.get("rating"),
                "added_at": str(r["added_at"]) if r.get("added_at") else None,
                "manual_order": r.get("manual_order", 0),
                "spotify_position": r.get("manual_order", 0),
            }
            for r in rows
        ]


# ── A+ Instantáneos (cutoff persistente en DB) ───────────────

@router.get("/aplus/status")
def aplus_status():
    cutoff = database.get_setting('aplus_cutoff')
    if not cutoff:
        cutoff = datetime.now(timezone.utc).isoformat()
        database.set_setting('aplus_cutoff', cutoff)
    return {"active": True, "cutoff": cutoff}


@router.post("/aplus/activate")
def aplus_activate():
    cutoff = datetime.now(timezone.utc).isoformat()
    database.set_setting('aplus_cutoff', cutoff)
    return {"active": True, "cutoff": cutoff}


@router.get("/aplus/scan")
def aplus_scan():
    cutoff = database.get_setting('aplus_cutoff')
    if not cutoff:
        cutoff = datetime.now(timezone.utc).isoformat()
        database.set_setting('aplus_cutoff', cutoff)
        return {"candidates": [], "cutoff": cutoff}

    sp = spotify.get_client()
    cutoff_dt = datetime.fromisoformat(cutoff.replace('Z', '+00:00'))
    candidates = []
    results = sp.current_user_saved_tracks(limit=50)
    while results:
        for item in results['items']:
            added_dt = datetime.fromisoformat(item['added_at'].replace('Z', '+00:00'))
            if added_dt > cutoff_dt:
                t = item['track']
                candidates.append({
                    "id": t['id'], "name": t['name'],
                    "artist": t['artists'][0]['name'],
                    "album": t['album']['name'],
                    "image": t['album']['images'][0]['url'] if t['album']['images'] else None,
                    "added_at": item['added_at'],
                })
        if results.get('next'):
            results = sp.next(results)
        else:
            break
    return {"candidates": candidates, "cutoff": cutoff}


@router.post("/aplus/apply")
def aplus_apply(body: dict):
    track_ids = body.get("track_ids", [])
    if not track_ids:
        return {"applied": 0}
    sp = spotify.get_client()
    applied = 0
    for tid in track_ids:
        try:
            t = sp.track(tid)
            database.save_track({
                "track_id": tid, "name": t['name'],
                "artist": t['artists'][0]['name'],
                "album": t['album']['name'], "rating": "A+",
            })
            applied += 1
        except Exception:
            pass
    new_cutoff = datetime.now(timezone.utc).isoformat()
    database.set_setting('aplus_cutoff', new_cutoff)
    return {"applied": applied, "new_cutoff": new_cutoff}
