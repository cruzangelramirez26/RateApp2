"""
Spotify API wrapper — handles OAuth and all playlist operations.
Uses a file-based token cache so auth persists across restarts.
"""
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import pandas as pd
import config

SCOPE = (
    "playlist-read-private playlist-modify-public playlist-modify-private "
    "user-library-read"
)

_auth_manager = None
_client = None


def get_auth_manager() -> SpotifyOAuth:
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = SpotifyOAuth(
            client_id=config.SPOTIPY_CLIENT_ID,
            client_secret=config.SPOTIPY_CLIENT_SECRET,
            redirect_uri=config.SPOTIPY_REDIRECT_URI,
            scope=SCOPE,
            cache_path=".spotify_cache",
            open_browser=False,
        )
    return _auth_manager


def get_client() -> spotipy.Spotify:
    """Return an authenticated Spotify client."""
    global _client
    am = get_auth_manager()
    token_info = am.cache_handler.get_cached_token()
    if token_info and am.is_token_expired(token_info):
        token_info = am.refresh_access_token(token_info["refresh_token"])
    if token_info:
        _client = spotipy.Spotify(auth=token_info["access_token"])
        return _client
    raise RuntimeError("Not authenticated — visit /auth/login first")


def is_authenticated() -> bool:
    try:
        get_client()
        return True
    except Exception:
        return False


# ─── Playlist operations ──────────────────────────────────────────

def get_playlist_tracks(sp: spotipy.Spotify, playlist_id: str) -> list[dict]:
    """Return all items from a playlist (handles pagination)."""
    tracks = []
    results = sp.playlist_tracks(playlist_id)
    tracks.extend(results["items"])
    while results.get("next"):
        results = sp.next(results)
        tracks.extend(results["items"])
    return tracks


def get_playlist_track_ids(sp: spotipy.Spotify, playlist_id: str) -> list[str]:
    """Return just the track IDs in playlist order."""
    items = get_playlist_tracks(sp, playlist_id)
    out = []
    for it in items:
        t = it.get("track") or {}
        tid = t.get("id")
        if tid:
            out.append(tid)
    return out


def replace_playlist(sp: spotipy.Spotify, playlist_id: str, track_ids: list[str]):
    """Replace entire playlist contents (handles >100 tracks)."""
    if not track_ids:
        sp.playlist_replace_items(playlist_id, [])
        return
    sp.playlist_replace_items(playlist_id, track_ids[:100])
    for i in range(100, len(track_ids), 100):
        sp.playlist_add_items(playlist_id, track_ids[i : i + 100])


def add_to_playlist(sp: spotipy.Spotify, playlist_id: str, track_ids: list[str]):
    """Add tracks to a playlist (handles >100)."""
    for i in range(0, len(track_ids), 100):
        sp.playlist_add_items(playlist_id, track_ids[i : i + 100])


def remove_from_playlist(sp: spotipy.Spotify, playlist_id: str, track_ids: list[str]):
    """Remove tracks from a playlist (handles >100)."""
    for i in range(0, len(track_ids), 100):
        sp.playlist_remove_all_occurrences_of_items(
            playlist_id, track_ids[i : i + 100]
        )


def get_user_playlists(sp: spotipy.Spotify) -> list[dict]:
    """Return all user playlists."""
    playlists = []
    results = sp.current_user_playlists(limit=50)
    playlists.extend(results["items"])
    while results.get("next"):
        results = sp.next(results)
        playlists.extend(results["items"])
    return playlists


def get_liked_tracks_since(sp: spotipy.Spotify, cutoff_dt) -> list[dict]:
    """Return liked songs added after cutoff_dt (newest first, stops early)."""
    tracks = []
    offset = 0
    while True:
        results = sp.current_user_saved_tracks(limit=50, offset=offset)
        items = results.get("items", [])
        if not items:
            break
        for it in items:
            added_at = it.get("added_at")
            track = it.get("track")
            if not added_at or not track:
                continue
            added_dt = pd.to_datetime(added_at, utc=True, errors="coerce")
            if added_dt is None or pd.isna(added_dt):
                continue
            if added_dt <= cutoff_dt:
                return tracks
            tracks.append({
                "id": track.get("id"),
                "name": track.get("name", ""),
                "artist": (track.get("artists") or [{}])[0].get("name", ""),
                "album": (track.get("album") or {}).get("name", ""),
                "added_at": added_at,
            })
        if results.get("next") is None:
            break
        offset += 50
    return tracks


def get_snapshot_id(sp: spotipy.Spotify, playlist_id: str) -> str | None:
    try:
        meta = sp.playlist(playlist_id, fields="snapshot_id")
        return meta.get("snapshot_id")
    except Exception:
        return None
