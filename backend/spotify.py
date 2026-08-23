"""
Spotify API wrapper — handles OAuth and all playlist operations.
The OAuth token lives in MySQL (table `config`), not on disk: Render's
filesystem is ephemeral and a file cache dies on every redeploy.
"""
import json
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from spotipy.cache_handler import CacheHandler
import pandas as pd
import config
import database

SCOPE = (
    "playlist-read-private playlist-modify-public playlist-modify-private "
    "user-library-read user-library-modify user-read-currently-playing "
    "user-modify-playback-state user-read-playback-state "
    "user-read-recently-played"
)

TOKEN_KEY = "spotify_token"


class MySQLCacheHandler(CacheHandler):
    """Store the OAuth token in the `config` table instead of a file.

    Same pattern already used by `aplus_cutoff` and the virtual-mode state:
    anything written to disk on Render disappears on the next redeploy, and
    losing the token means re-authenticating from the app every time.

    Keeps an in-process copy so the hot path doesn't hit TiDB on every
    request — the DB is only read when this process has no token yet.
    """

    def __init__(self):
        self._memo = None

    def get_cached_token(self):
        if self._memo is not None:
            return self._memo
        try:
            raw = database.get_config(TOKEN_KEY)
        except Exception as e:
            print(f"[spotify] no se pudo leer el token de MySQL: {e}")
            return None
        if not raw:
            return None
        try:
            self._memo = json.loads(raw)
        except ValueError as e:
            print(f"[spotify] token ilegible en MySQL, se ignora: {e}")
            return None
        return self._memo

    def save_token_to_cache(self, token_info):
        self._memo = token_info
        try:
            database.set_config(TOKEN_KEY, json.dumps(token_info))
        except Exception as e:
            # A proposito no se relanza: el token en memoria sigue sirviendo
            # para esta instancia, asi que un fallo de escritura no tumba una
            # peticion que de otro modo funcionaba. Lo unico que se pierde es
            # que el token sobreviva al reinicio — el comportamiento viejo.
            print(f"[spotify] no se pudo guardar el token en MySQL: {e}")

    def clear(self):
        """Forget the token, in memory and in the DB."""
        self._memo = None
        try:
            database.delete_config(TOKEN_KEY)
        except Exception as e:
            print(f"[spotify] no se pudo borrar el token de MySQL: {e}")


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
            cache_handler=MySQLCacheHandler(),
            open_browser=False,
        )
    return _auth_manager


def get_client() -> spotipy.Spotify:
    """Return an authenticated Spotify client."""
    global _client
    am = get_auth_manager()
    # validate_token refresca si expiro Y descarta el token si le faltan
    # scopes. Lo segundo importa ahora que el token sobrevive a los
    # redeploys: antes, agregar un scope se arreglaba solo porque el cache
    # en disco se borraba; ahora hay que forzar el re-login a proposito.
    token_info = am.validate_token(am.cache_handler.get_cached_token())
    if token_info:
        _client = spotipy.Spotify(auth=token_info["access_token"])
        return _client
    raise RuntimeError("Not authenticated — visit /auth/login first")


def clear_token():
    """Drop the stored token (logout)."""
    global _client
    get_auth_manager().cache_handler.clear()
    _client = None


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


def get_all_liked_tracks(sp: spotipy.Spotify, limit: int = 500, start_offset: int = 0) -> list[dict]:
    """Return up to `limit` most recent liked songs with full metadata, starting at start_offset."""
    tracks = []
    offset = start_offset
    while len(tracks) < limit:
        results = sp.current_user_saved_tracks(limit=50, offset=offset)
        items = results.get("items", [])
        if not items:
            break
        for it in items:
            track = it.get("track")
            if not track:
                continue
            images = (track.get("album") or {}).get("images") or []
            tracks.append({
                "id": track.get("id"),
                "name": track.get("name", ""),
                "artist": (track.get("artists") or [{}])[0].get("name", ""),
                "album": (track.get("album") or {}).get("name", ""),
                "added_at": it.get("added_at"),
                "image": images[0].get("url") if images else None,
                "spotify_url": (track.get("external_urls") or {}).get("spotify"),
            })
            if len(tracks) >= limit:
                break
        if results.get("next") is None:
            break
        offset += 50
    return tracks


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


# ─── Liked songs (Me Gusta nativo) ───────────────────────────────

def save_tracks(sp: spotipy.Spotify, track_ids: list[str]):
    """Add tracks to the user's Liked Songs library."""
    for i in range(0, len(track_ids), 50):
        sp.current_user_saved_tracks_add(track_ids[i : i + 50])


def unsave_tracks(sp: spotipy.Spotify, track_ids: list[str]):
    """Remove tracks from the user's Liked Songs library."""
    for i in range(0, len(track_ids), 50):
        sp.current_user_saved_tracks_delete(track_ids[i : i + 50])


def are_tracks_saved(sp: spotipy.Spotify, track_ids: list[str]) -> dict[str, bool]:
    """Return {track_id: is_liked} for the given IDs."""
    result = {}
    for i in range(0, len(track_ids), 50):
        chunk = track_ids[i : i + 50]
        saved = sp.current_user_saved_tracks_contains(chunk)
        for tid, is_saved in zip(chunk, saved):
            result[tid] = is_saved
    return result
