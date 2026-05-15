"""Track rating and listing routes."""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional
import pandas as pd

import database
import spotify
import config
import utils
from models import RateRequest, TrackOut, StatsOut, AplusApplyRequest, MigrateRequest

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


@router.get("/now-playing")
def get_now_playing():
    """Return the track currently playing or paused on Spotify, with DB rating."""
    sp = spotify.get_client()
    result = sp.current_user_playing_track()
    if not result:
        return {"is_playing": False, "track": None}

    is_playing = result.get("is_playing", False)
    item = result.get("item") or {}
    tid = item.get("id")
    if not tid:
        return {"is_playing": False, "track": None}

    artists = item.get("artists") or [{}]
    images = (item.get("album") or {}).get("images") or []

    df = database.load_all()
    rating = None
    if not df.empty:
        row = df[df["track_id"] == tid]
        if not row.empty:
            val = str(row.iloc[0].get("rating", "")).strip()
            rating = val if val and val.lower() != "nan" else None

    return {
        "is_playing": is_playing,
        "track": {
            "id": tid,
            "name": item.get("name", ""),
            "artist": artists[0].get("name", ""),
            "album": (item.get("album") or {}).get("name", ""),
            "image": images[0].get("url") if images else None,
            "spotify_url": (item.get("external_urls") or {}).get("spotify"),
            "rating": rating,
        },
    }


@router.post("/player/pause")
def player_pause():
    sp = spotify.get_client()
    try:
        sp.pause_playback()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/player/play")
def player_play():
    sp = spotify.get_client()
    try:
        sp.start_playback()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/player/next")
def player_next():
    sp = spotify.get_client()
    try:
        sp.next_track()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/player/previous")
def player_previous():
    sp = spotify.get_client()
    try:
        sp.previous_track()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.get("/recent")
def get_recent_tracks(limit: int = Query(50, ge=1, le=200)):
    """Return recently rated tracks enriched with album art from Spotify."""
    rows = database.get_recent(limit)
    if rows:
        try:
            sp = spotify.get_client()
            ids = [r["track_id"] for r in rows if r.get("track_id")]
            image_map = {}
            for chunk in utils.chunk_list(ids, 50):
                result = sp.tracks(chunk)
                for t in (result.get("tracks") or []):
                    if t:
                        images = (t.get("album") or {}).get("images") or []
                        image_map[t["id"]] = images[0].get("url") if images else None
            for r in rows:
                r["image"] = image_map.get(r.get("track_id"))
                r["spotify_url"] = f"https://open.spotify.com/track/{r.get('track_id')}"
        except Exception:
            for r in rows:
                r.setdefault("image", None)
    return rows


@router.get("/recently-played")
def get_recently_played():
    """Return up to 50 recently played tracks from Spotify, enriched with DB ratings."""
    sp = spotify.get_client()
    result = sp.current_user_recently_played(limit=50)
    items = (result or {}).get("items") or []

    seen = {}
    for item in items:
        t = item.get("track") or {}
        tid = t.get("id")
        if not tid or tid in seen:
            continue
        artists = t.get("artists") or [{}]
        images = (t.get("album") or {}).get("images") or []
        seen[tid] = {
            "track_id": tid,
            "id": tid,
            "name": t.get("name", ""),
            "artist": artists[0].get("name", ""),
            "album": (t.get("album") or {}).get("name", ""),
            "image": images[0].get("url") if images else None,
            "spotify_url": (t.get("external_urls") or {}).get("spotify"),
            "played_at": item.get("played_at"),
            "rating": None,
        }

    tracks = list(seen.values())

    if tracks:
        df = database.load_all()
        if not df.empty:
            for tr in tracks:
                row = df[df["track_id"] == tr["track_id"]]
                if not row.empty:
                    val = str(row.iloc[0].get("rating", "")).strip()
                    tr["rating"] = val if val and val.lower() != "nan" else None

    return tracks


@router.get("/search")
def search_tracks(q: str = Query(..., min_length=1), limit: int = Query(50, ge=1, le=200)):
    """Search tracks in the database by name or artist."""
    rows = database.search_tracks(q, limit)
    return rows


@router.get("/stats")
def get_stats():
    """Return rating distribution stats plus extended metrics."""
    raw = database.get_stats()
    total = sum(raw.values())
    top_set_keys = {"B+", "A", "A+"}
    top_set_count = sum(raw.get(k, 0) for k in top_set_keys)
    non_d_total = sum(v for k, v in raw.items() if k not in ("D", ""))
    top_set_pct = round(top_set_count / non_d_total * 100) if non_d_total else 0
    extended = database.get_stats_extended()
    return {
        "total": total,
        "by_rating": raw,
        "top_set_count": top_set_count,
        "top_set_pct": top_set_pct,
        "top_artists": extended["top_artists"],
        "by_cuatri": extended["by_cuatri"],
    }


_CUATRI_MONTH_RANGES = {"perla": (1, 4), "miel": (5, 8), "latte": (9, 12)}


def _belongs_to_current_cuatri(track_data: dict, cuatri: str) -> bool:
    """True if track naturally belongs to the given cuatrimestre by added_at (ignores override)."""
    added_at = track_data.get("added_at")
    if not added_at:
        return False
    try:
        dt = pd.to_datetime(added_at, errors="coerce")
        if pd.isna(dt):
            return False
        now = utils.now_utc()
        start_m, end_m = _CUATRI_MONTH_RANGES[cuatri]
        target_year = now.year if now.month >= start_m else now.year - 1
        return int(dt.year) == target_year and start_m <= int(dt.month) <= end_m
    except Exception:
        return False


@router.post("/rate")
def rate_track(req: RateRequest, soft: bool = False):
    """Rate a track. soft=True saves to DB only without touching Spotify playlists."""
    sp = spotify.get_client()
    tid = req.track_id
    new_rating = req.rating.strip().upper()

    old_track = database.get_track(tid)
    old_rating = str(old_track.get("rating", "")).strip().upper() if old_track else None

    now_str = utils.now_utc_str()
    current_cuatri = utils.get_cuatrimestre(utils.now_utc())
    cuatri_id = config.DISTRIBUTION_PLAYLISTS.get(current_cuatri)
    mmg_id = config.DISTRIBUTION_PLAYLISTS["mis_me_gusta"]
    anual_id = config.DISTRIBUTION_PLAYLISTS["anual"]

    # Preserve original added_at on re-rate (upsert only sets it on INSERT)
    database.upsert_track(tid, req.name, req.artist, req.album, now_str, new_rating)

    if soft:
        return {"ok": True, "rating": new_rating}

    if new_rating == "D":
        for pl_id in [cuatri_id, mmg_id, anual_id]:
            if pl_id:
                try:
                    spotify.remove_from_playlist(sp, pl_id, [tid])
                except Exception:
                    pass
        try:
            spotify.unsave_tracks(sp, [tid])
        except Exception:
            pass
        return {"ok": True, "rating": "D"}

    if new_rating in config.TOP_SET:
        # Add to current cuatrimestre
        if cuatri_id:
            try:
                existing = set(spotify.get_playlist_track_ids(sp, cuatri_id))
                if tid not in existing:
                    spotify.add_to_playlist(sp, cuatri_id, [tid])
            except Exception:
                pass
        # If track is historical, set override so rebuild lo incluye en el cuatri actual
        if old_track:
            override = old_track.get("cuatrimestre_override")
            if not _belongs_to_current_cuatri(old_track, current_cuatri) and override != current_cuatri:
                try:
                    database.set_cuatrimestre_override([tid], current_cuatri)
                except Exception:
                    pass
        # Add to MMG + Anual
        for pl_id in [mmg_id, anual_id]:
            try:
                existing = set(spotify.get_playlist_track_ids(sp, pl_id))
                if tid not in existing:
                    spotify.add_to_playlist(sp, pl_id, [tid])
            except Exception:
                pass
        # Like
        try:
            spotify.save_tracks(sp, [tid])
        except Exception:
            pass
    else:
        # B, C+, C — sale de MMG + Anual + unlike solo si venía de TOP_SET
        if old_rating in config.TOP_SET:
            for pl_id in [mmg_id, anual_id]:
                try:
                    spotify.remove_from_playlist(sp, pl_id, [tid])
                except Exception:
                    pass
            try:
                spotify.unsave_tracks(sp, [tid])
            except Exception:
                pass

        if new_rating in {"B", "C+"}:
            # B y C+ van al cuatrimestre actual (si la canción es del cuatrimestre actual)
            is_current_track = (
                old_track is None
                or _belongs_to_current_cuatri(old_track, current_cuatri)
                or old_track.get("cuatrimestre_override") == current_cuatri
            )
            if is_current_track and cuatri_id:
                try:
                    existing = set(spotify.get_playlist_track_ids(sp, cuatri_id))
                    if tid not in existing:
                        spotify.add_to_playlist(sp, cuatri_id, [tid])
                except Exception:
                    pass
        else:
            # C — no va al cuatrimestre; si ya estaba, se elimina
            if cuatri_id:
                try:
                    spotify.remove_from_playlist(sp, cuatri_id, [tid])
                except Exception:
                    pass

    # Auto-reorder (min_rating_order=2 = C+; excluye C y D del cuatrimestre)
    if cuatri_id:
        _order_playlist(sp, cuatri_id, min_rating_order=2)
    if new_rating in config.TOP_SET or (old_rating and old_rating in config.TOP_SET):
        _order_playlist(sp, anual_id, min_rating_order=config.RATING_ORDER["B+"])

    return {"ok": True, "rating": new_rating}


@router.get("/liked-all")
def get_liked_all(limit: int = Query(500, ge=1, le=1000), offset: int = Query(0, ge=0)):
    """Return liked songs enriched with DB ratings, cuatrimestre, and added_at."""
    sp = spotify.get_client()
    liked = spotify.get_all_liked_tracks(sp, limit=limit, start_offset=offset)

    df = database.load_all()
    db_map: dict = {}
    if not df.empty:
        for _, r in df.iterrows():
            tid = r["track_id"]
            added_at_val = r.get("added_at")
            try:
                db_added_at = str(added_at_val) if added_at_val is not None and not pd.isna(added_at_val) else None
            except Exception:
                db_added_at = None
            db_map[tid] = {
                "rating": str(r.get("rating", "")).strip().upper() or None,
                "cuatrimestre_override": r.get("cuatrimestre_override") or None,
                "db_added_at": db_added_at,
            }

    for t in liked:
        t["track_id"] = t["id"]
        db_data = db_map.get(t["id"], {})
        t["rating"] = db_data.get("rating")
        t["cuatrimestre_override"] = db_data.get("cuatrimestre_override")
        t["db_added_at"] = db_data.get("db_added_at")

    return liked


@router.get("/playlist/{playlist_id}")
def get_playlist_tracks_with_ratings(playlist_id: str):
    """Return tracks from a Spotify playlist enriched with DB ratings and rated_at."""
    sp = spotify.get_client()
    items = spotify.get_playlist_tracks(sp, playlist_id)

    df = database.load_all()
    ratings_map = {}
    rated_at_map = {}
    if not df.empty:
        for _, r in df.iterrows():
            tid = r["track_id"]
            ratings_map[tid] = str(r.get("rating", "")).strip().upper()
            rated_at_map[tid] = r.get("added_at")

    tracks = []
    for it in items:
        t = it.get("track") or {}
        tid = t.get("id")
        if not tid:
            continue
        artists = t.get("artists") or [{}]
        rated_at = rated_at_map.get(tid)
        tracks.append({
            "id": tid,
            "name": t.get("name", ""),
            "artist": artists[0].get("name", ""),
            "album": (t.get("album") or {}).get("name", ""),
            "added_at": it.get("added_at"),
            "rated_at": str(rated_at) if rated_at else None,
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

def _load_cutoff():
    val = database.get_config("aplus_cutoff")
    if not val:
        return None
    return pd.to_datetime(val, utc=True)


def _save_cutoff(dt_str: str):
    database.set_config("aplus_cutoff", dt_str)


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
def aplus_apply(req: AplusApplyRequest):
    """
    Apply A+ to the selected candidates: save to DB, add to cuatri + anual, reorder.
    Only applies tracks whose IDs are in req.track_ids.
    The cutoff is never updated here — it stays fixed forever.
    """
    if not req.track_ids:
        return {"applied": 0, "message": "No se seleccionaron canciones."}

    cutoff = _load_cutoff()
    if cutoff is None:
        raise HTTPException(400, "A+ detection not activated yet. Call /aplus/scan first.")

    sp = spotify.get_client()
    liked = spotify.get_liked_tracks_since(sp, cutoff)

    df = database.load_all()
    existing_ids = set(df["track_id"]) if not df.empty else set()

    selected_set = set(req.track_ids)
    candidates = [
        t for t in liked
        if t.get("id") and t["id"] not in existing_ids and t["id"] in selected_set
    ]

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

    # Auto-reorder (cutoff is NOT updated)
    if cuatri_id:
        _order_playlist(sp, cuatri_id, min_rating_order=1)
    _order_playlist(sp, anual_id, min_rating_order=config.RATING_ORDER["B+"])

    return {"applied": applied, "message": f"Se aplicaron {applied} canciones como A+."}


# ─── Migración de cuatrimestre ───────────────────────────────────

_CUATRI_DISPLAY = {"perla": "Perla", "miel": "Miel", "latte": "Latte"}


@router.get("/migrate/candidates")
def get_migrate_candidates():
    """Return tracks from the previous cuatrimestre that haven't been migrated yet."""
    current_cuatri = utils.get_cuatrimestre(utils.now_utc())
    prev_cuatri = utils.CUATRIMESTRE_PREV.get(current_cuatri)

    if prev_cuatri is None:
        return {"candidates": [], "from_cuatri": None, "to_cuatri": current_cuatri}

    from_year = utils.now_utc().year
    candidates = database.get_migration_candidates(prev_cuatri, from_year)

    # Enrich with album art (smallest thumbnail) via Spotify
    if candidates:
        try:
            sp = spotify.get_client()
            ids = [c["track_id"] for c in candidates]
            image_map = {}
            for chunk in utils.chunk_list(ids, 50):
                result = sp.tracks(chunk)
                for t in (result.get("tracks") or []):
                    if t:
                        images = (t.get("album") or {}).get("images") or []
                        image_map[t["id"]] = images[-1].get("url") if images else None
            for c in candidates:
                c["image"] = image_map.get(c["track_id"])
        except Exception:
            for c in candidates:
                c.setdefault("image", None)

    # Serialize datetimes
    for c in candidates:
        if c.get("added_at") and hasattr(c["added_at"], "isoformat"):
            c["added_at"] = c["added_at"].isoformat()

    return {
        "candidates": candidates,
        "from_cuatri": prev_cuatri,
        "to_cuatri": current_cuatri,
    }


@router.post("/test-like/{track_id}")
def test_like(track_id: str):
    """TEST ONLY — add a track to Liked Songs and confirm."""
    sp = spotify.get_client()
    spotify.save_tracks(sp, [track_id])
    saved = spotify.are_tracks_saved(sp, [track_id])
    return {"track_id": track_id, "is_liked": saved.get(track_id)}


@router.post("/test-unlike/{track_id}")
def test_unlike(track_id: str):
    """TEST ONLY — remove a track from Liked Songs and confirm."""
    sp = spotify.get_client()
    spotify.unsave_tracks(sp, [track_id])
    saved = spotify.are_tracks_saved(sp, [track_id])
    return {"track_id": track_id, "is_liked": saved.get(track_id)}


@router.post("/migrate")
def migrate_tracks(req: MigrateRequest):
    """Migrate selected tracks to to_cuatrimestre: set override, add to Spotify playlist, reorder."""
    if not req.track_ids:
        return {"migrated": 0, "message": "No se seleccionaron canciones."}

    to_cuatri = req.to_cuatrimestre
    cuatri_id = config.DISTRIBUTION_PLAYLISTS.get(to_cuatri)
    if not cuatri_id:
        raise HTTPException(400, f"No hay playlist configurada para '{to_cuatri}'.")

    sp = spotify.get_client()

    database.set_cuatrimestre_override(req.track_ids, to_cuatri)

    existing = set(spotify.get_playlist_track_ids(sp, cuatri_id))
    to_add = [tid for tid in req.track_ids if tid not in existing]
    for chunk in utils.chunk_list(to_add, 100):
        try:
            spotify.add_to_playlist(sp, cuatri_id, chunk)
        except Exception:
            pass

    _order_playlist(sp, cuatri_id, min_rating_order=1)

    label = _CUATRI_DISPLAY.get(to_cuatri, to_cuatri.capitalize())
    return {
        "migrated": len(req.track_ids),
        "message": f"{len(req.track_ids)} canciones migradas a {label}.",
    }
