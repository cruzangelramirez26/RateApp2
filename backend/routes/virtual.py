"""Virtual edit mode routes — the drag-to-rerate feature + in-app reorderer."""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import bisect

import pandas as pd
from pydantic import BaseModel

import database
import spotify
import config
import utils

router = APIRouter(prefix="/virtual", tags=["virtual"])

RATINGS_IN_ORDER = config.RATINGS_IN_ORDER


def _counts_by_rating(ids: list[str]) -> dict:
    counts = {rk: 0 for rk in RATINGS_IN_ORDER}
    df = database.load_all()
    if df.empty:
        return counts
    idx = df.set_index("track_id")
    for tid in ids:
        r = None
        if tid in idx.index and pd.notna(idx.at[tid, "rating"]):
            r = str(idx.at[tid, "rating"]).upper().strip()
        if r not in RATINGS_IN_ORDER:
            r = "C"
        counts[r] += 1
    return counts


def _build_segments(counts: dict, total: int) -> dict:
    seg = {}
    start = 0
    acc = 0
    for rk in RATINGS_IN_ORDER:
        c = int(counts.get(rk, 0))
        acc += c
        end = start + c - 1
        seg[rk] = (start, end) if c > 0 else (start, start - 1)
        start = end + 1
    if acc < total:
        s, _ = seg["C"]
        seg["C"] = (s, total - 1)
    for rk in RATINGS_IN_ORDER:
        s, e = seg[rk]
        s = max(0, min(s, total - 1))
        e = max(-1, min(e, total - 1))
        seg[rk] = (s, e) if e >= s else (s, s - 1)
    return seg


def _segment_for_index(ix: int, segments: dict) -> str:
    for rk in RATINGS_IN_ORDER:
        s, e = segments[rk]
        if s <= ix <= e:
            return rk
    return "C"


def _boundary_lines(segments: dict, ids: list[str], df_idx) -> list[str]:
    lines = []

    def label(tid):
        if df_idx is not None and tid in df_idx.index:
            nm = df_idx.at[tid, "name"] or ""
            ar = df_idx.at[tid, "artist"] or ""
            return f"{nm} — {ar}"
        return tid

    for i in range(len(RATINGS_IN_ORDER) - 1):
        upper = RATINGS_IN_ORDER[i]
        lower = RATINGS_IN_ORDER[i + 1]
        su, eu = segments[upper]
        sl, el = segments[lower]
        up_txt = (
            f"última {upper} = {label(ids[eu])}"
            if eu >= su and 0 <= eu < len(ids)
            else f"última {upper} = (vacío)"
        )
        lo_txt = (
            f"primera {lower} = {label(ids[sl])}"
            if sl <= el and 0 <= sl < len(ids)
            else f"primera {lower} = (vacío)"
        )
        lines.append({"pair": f"{upper}/{lower}", "upper": up_txt, "lower": lo_txt})
    return lines


def _lis_indices(seq: list[int]) -> list[int]:
    if not seq:
        return []
    tails = []
    prev = [-1] * len(seq)
    for i, x in enumerate(seq):
        j = bisect.bisect_left([tails[k][0] for k in range(len(tails))], x)
        if j == len(tails):
            tails.append((x, i))
        else:
            tails[j] = (x, i)
        prev[i] = tails[j - 1][1] if j > 0 else -1
    k = tails[-1][1]
    out = []
    while k != -1:
        out.append(k)
        k = prev[k]
    out.reverse()
    return out


# ─── Estado Virtual (MySQL, no archivo) ──────────────────────────────────────

@router.get("/status")
def virtual_status():
    st = database.get_virtual_state()
    return {
        "active": bool(st.get("editing")),
        "cuatri": st.get("cuatri"),
        "playlist_id": st.get("playlist_id"),
        "counts": st.get("counts"),
    }


@router.post("/start")
def virtual_start():
    """Freeze boundaries for the current cuatrimestre playlist."""
    sp = spotify.get_client()
    cuatri = utils.get_cuatrimestre(utils.now_utc())
    pl_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    if not pl_id:
        raise HTTPException(400, f"No playlist for cuatri {cuatri}")

    curr_ids = utils.dedupe_preserve_order(spotify.get_playlist_track_ids(sp, pl_id))
    if not curr_ids:
        raise HTTPException(400, f"{cuatri.upper()} playlist is empty")

    counts = _counts_by_rating(curr_ids)
    snap = spotify.get_snapshot_id(sp, pl_id)

    state = {
        "editing": True,
        "playlist_id": pl_id,
        "cuatri": cuatri,
        "prev_order": curr_ids,
        "counts": counts,
        "snapshot_id": snap,
    }
    database.set_virtual_state(state)

    segments = _build_segments(counts, len(curr_ids))
    df = database.load_all()
    df_idx = df.set_index("track_id") if not df.empty else None
    boundaries = _boundary_lines(segments, curr_ids, df_idx)

    return {
        "cuatri": cuatri,
        "playlist_id": pl_id,
        "track_count": len(curr_ids),
        "boundaries": boundaries,
    }


@router.post("/simulate")
def virtual_simulate():
    """Detect which songs crossed segment boundaries."""
    st = database.get_virtual_state()
    if not st.get("editing"):
        raise HTTPException(400, "Virtual edit mode is not active")

    sp = spotify.get_client()
    cuatri = utils.get_cuatrimestre(utils.now_utc())
    pl_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)

    if st.get("playlist_id") != pl_id:
        raise HTTPException(400, "Active session doesn't match current cuatrimestre")

    prev = st.get("prev_order", [])
    prev_pos = {tid: i for i, tid in enumerate(prev)}
    curr = utils.dedupe_preserve_order(spotify.get_playlist_track_ids(sp, pl_id))

    seq = []
    seq_map = []
    for i, tid in enumerate(curr):
        if tid in prev_pos:
            seq.append(prev_pos[tid])
            seq_map.append((i, tid))
    lis_idx = _lis_indices(seq)
    unchanged = {seq_map[i][1] for i in lis_idx}
    moved = [tid for tid in curr if tid not in unchanged or tid not in prev_pos]

    counts = st.get("counts", {rk: 0 for rk in RATINGS_IN_ORDER})
    segments = _build_segments(counts, len(curr))

    df = database.load_all()
    df_idx = df.set_index("track_id") if not df.empty else None

    changes = []
    id_to_ix = {tid: i for i, tid in enumerate(curr)}
    for tid in moved:
        ix = id_to_ix[tid]
        target = _segment_for_index(ix, segments)
        old_r = None
        name = artist = ""
        if df_idx is not None and tid in df_idx.index:
            row = df_idx.loc[tid]
            old_r = str(row.get("rating", "")).upper().strip() or None
            name = row.get("name", "")
            artist = row.get("artist", "")
        if (old_r or "") != target:
            changes.append({
                "tid": tid,
                "name": name,
                "artist": artist,
                "old": old_r or "—",
                "new": target,
            })

    boundaries = _boundary_lines(segments, curr, df_idx)

    return {
        "playlist_id": pl_id,
        "cuatri": cuatri,
        "moved_count": len(moved),
        "changes": changes,
        "summary": f"Movidas: {len(moved)} · Cambios de calificación: {len(changes)}",
        "boundaries": boundaries,
        "curr_order": curr,
        "segments": segments,
    }


@router.post("/apply")
def virtual_apply(reorder: bool = False):
    """Apply the simulated changes."""
    st = database.get_virtual_state()
    if not st.get("editing"):
        raise HTTPException(400, "Virtual edit mode is not active")

    sim = virtual_simulate()
    changes = sim["changes"]
    segments = sim["segments"]
    curr = sim["curr_order"]

    sp = spotify.get_client()

    ids_by_block = {rk: [] for rk in RATINGS_IN_ORDER}
    for ix, tid in enumerate(curr):
        rk = _segment_for_index(ix, segments)
        ids_by_block[rk].append(tid)

    to_remove = {"mis_me_gusta": set(), "anual": set()}
    to_add = {"mis_me_gusta": set(), "anual": set()}

    df = database.load_all()
    df_idx = df.set_index("track_id") if not df.empty else None

    for ch in changes:
        tid = ch["tid"]
        new_r = ch["new"]
        old_r = ch["old"] if ch["old"] != "—" else None
        name = ch.get("name", "")
        artist = ch.get("artist", "")
        album = ""

        if df_idx is not None and tid in df_idx.index:
            row = df_idx.loc[tid]
            if not name:
                name = row.get("name", "")
            if not artist:
                artist = row.get("artist", "")
            album = row.get("album", "")

        was_top = bool(old_r and old_r in config.TOP_SET)
        now_top = bool(new_r in config.TOP_SET)

        if was_top and not now_top:
            to_remove["mis_me_gusta"].add(tid)
            to_remove["anual"].add(tid)
        elif now_top and not was_top:
            to_add["mis_me_gusta"].add(tid)
            to_add["anual"].add(tid)

        database.upsert_track(tid, name, artist, album, utils.now_utc_str(), new_r)

    for k, ids in to_remove.items():
        if ids:
            spotify.remove_from_playlist(sp, config.DISTRIBUTION_PLAYLISTS[k], list(ids))
    for k, ids in to_add.items():
        if ids:
            spotify.add_to_playlist(sp, config.DISTRIBUTION_PLAYLISTS[k], list(ids))

    base_now = pd.Timestamp(utils.now_utc())
    df2 = database.load_all()
    for rk in RATINGS_IN_ORDER:
        block_ids = ids_by_block[rk]
        if not block_ids:
            continue
        n = len(block_ids)
        for i, tid in enumerate(block_ids):
            ts = base_now + pd.Timedelta(seconds=(n - i))
            row = None
            try:
                row = df2[df2["track_id"] == tid].iloc[0]
            except Exception:
                pass
            database.upsert_track(
                tid,
                row.get("name", "") if row is not None else "",
                row.get("artist", "") if row is not None else "",
                row.get("album", "") if row is not None else "",
                ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                rk,
            )

    if reorder:
        from routes.tracks import _order_playlist
        pl_id = sim["playlist_id"]
        _order_playlist(sp, pl_id, min_rating_order=1)

    cuatri = utils.get_cuatrimestre(utils.now_utc())
    pl_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    new_curr = utils.dedupe_preserve_order(spotify.get_playlist_track_ids(sp, pl_id))
    new_state = {
        "editing": True,
        "playlist_id": pl_id,
        "cuatri": cuatri,
        "prev_order": new_curr,
        "counts": _counts_by_rating(new_curr),
        "snapshot_id": spotify.get_snapshot_id(sp, pl_id),
    }
    database.set_virtual_state(new_state)

    return {"ok": True, "changes_applied": len(changes)}


@router.post("/end")
def virtual_end():
    st = database.get_virtual_state()
    st["editing"] = False
    database.set_virtual_state(st)
    return {"ok": True}


# ─── Reordenador in-app ───────────────────────────────────────────────────────

@router.get("/playlist")
def virtual_playlist():
    """Return current cuatrimestre playlist in order with ratings + images."""
    sp = spotify.get_client()
    cuatri = utils.get_cuatrimestre(utils.now_utc())
    pl_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    if not pl_id:
        raise HTTPException(400, f"No playlist for cuatri {cuatri}")

    curr_ids = utils.dedupe_preserve_order(spotify.get_playlist_track_ids(sp, pl_id))
    if not curr_ids:
        return {"cuatri": cuatri, "playlist_id": pl_id, "tracks": []}

    df = database.load_all()
    df_idx = df.set_index("track_id") if not df.empty else None

    sp_meta = {}
    try:
        for i in range(0, len(curr_ids), 50):
            result = sp.tracks(curr_ids[i : i + 50])
            for t in result.get("tracks") or []:
                if not t or not t.get("id"):
                    continue
                images = (t.get("album") or {}).get("images") or []
                sp_meta[t["id"]] = {
                    "name": t.get("name", ""),
                    "artist": (t.get("artists") or [{}])[0].get("name", ""),
                    "album": (t.get("album") or {}).get("name", ""),
                    "image": images[0].get("url") if images else None,
                }
    except Exception:
        pass

    tracks = []
    for tid in curr_ids:
        t = {"tid": tid, "rating": "C", "name": "", "artist": "", "album": "", "image": None}
        if tid in sp_meta:
            t.update(sp_meta[tid])
        if df_idx is not None and tid in df_idx.index:
            row = df_idx.loc[tid]
            r = str(row.get("rating", "") or "").upper().strip()
            if r:
                t["rating"] = r
        tracks.append(t)

    return {"cuatri": cuatri, "playlist_id": pl_id, "tracks": tracks}


class ReorderItem(BaseModel):
    tid: str
    rating: str
    name: str = ""
    artist: str = ""
    album: str = ""


@router.post("/reorder")
def virtual_reorder(items: list[ReorderItem]):
    """Apply in-app reorder: update DB ratings and sync Spotify playlists."""
    if not items:
        raise HTTPException(400, "Empty item list")

    sp = spotify.get_client()
    cuatri = utils.get_cuatrimestre(utils.now_utc())
    pl_id = config.DISTRIBUTION_PLAYLISTS.get(cuatri)
    if not pl_id:
        raise HTTPException(400, f"No playlist for cuatri {cuatri}")

    df = database.load_all()
    df_idx = df.set_index("track_id") if not df.empty else None

    to_remove_mmg: set = set()
    to_add_mmg: set = set()
    to_remove_anual: set = set()
    to_add_anual: set = set()
    to_save_liked: list = []
    to_unsave_liked: list = []
    changes = 0

    for item in items:
        tid = item.tid
        new_r = item.rating.upper()
        old_r = None
        name, artist, album = item.name, item.artist, item.album

        if df_idx is not None and tid in df_idx.index:
            row = df_idx.loc[tid]
            old_r = str(row.get("rating", "") or "").upper().strip() or None
            if not name:
                name = row.get("name", "")
            if not artist:
                artist = row.get("artist", "")
            if not album:
                album = row.get("album", "")

        if old_r == new_r:
            continue
        changes += 1

        was_top = bool(old_r and old_r in config.TOP_SET)
        now_top = new_r in config.TOP_SET

        if was_top and not now_top:
            to_remove_mmg.add(tid)
            to_remove_anual.add(tid)
            to_unsave_liked.append(tid)
        elif now_top and not was_top:
            to_add_mmg.add(tid)
            to_add_anual.add(tid)
            to_save_liked.append(tid)

        database.upsert_track(tid, name, artist, album, utils.now_utc_str(), new_r)

    # Liked songs sync
    if to_save_liked:
        try:
            already_saved = spotify.are_tracks_saved(sp, to_save_liked)
            new_likes = [t for t in to_save_liked if not already_saved.get(t)]
            if new_likes:
                spotify.save_tracks(sp, new_likes)
        except Exception:
            pass
    if to_unsave_liked:
        try:
            spotify.unsave_tracks(sp, to_unsave_liked)
        except Exception:
            pass

    # Playlist batch ops
    if to_remove_mmg:
        try:
            spotify.remove_from_playlist(sp, config.DISTRIBUTION_PLAYLISTS["mis_me_gusta"], list(to_remove_mmg))
        except Exception:
            pass
    if to_add_mmg:
        try:
            spotify.add_to_playlist(sp, config.DISTRIBUTION_PLAYLISTS["mis_me_gusta"], list(to_add_mmg))
        except Exception:
            pass
    if to_remove_anual:
        try:
            spotify.remove_from_playlist(sp, config.DISTRIBUTION_PLAYLISTS["anual"], list(to_remove_anual))
        except Exception:
            pass
    if to_add_anual:
        try:
            spotify.add_to_playlist(sp, config.DISTRIBUTION_PLAYLISTS["anual"], list(to_add_anual))
        except Exception:
            pass

    # Replace cuatrimestre playlist with new order (A+, A, B+, B, C+ — no C, no D)
    in_cuatri = set(config.RATINGS_IN_ORDER) - {"C"}
    new_ids = [item.tid for item in items if item.rating.upper() in in_cuatri]
    try:
        spotify.replace_playlist(sp, pl_id, new_ids)
    except Exception as e:
        raise HTTPException(500, f"Error reordering playlist: {e}")

    return {"ok": True, "changes_applied": changes}
