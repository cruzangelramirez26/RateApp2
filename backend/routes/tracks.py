"""Track rating and listing routes."""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
import pandas as pd

import database
import spotify
import config
import utils
from models import (
    RateRequest, TrackOut, StatsOut, AplusApplyRequest, MigrateRequest,
    PlayContextRequest, UnlikeRequest, QueuePlaylistRequest,
    SeekRequest,
    LikeRequest,
)

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
            # Los demas artistas, para pintarlos junto al principal. Solo se
            # muestran: `artist` sigue siendo el primero, que es lo que se
            # guarda en MySQL y con lo que se arma match_key.
            "featuring": [a.get("name") for a in artists[1:] if a.get("name")],
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

    # current_playback() pega a /me/player y sigue reportando el track cuando
    # esta en pausa; current_user_playing_track() pega a /me/player/currently-playing,
    # que devuelve 204 vacio en cuanto el dispositivo se vuelve inactivo tras la
    # pausa. Se intenta el primero y se cae al segundo por si acaso.
    result = None
    try:
        result = sp.current_playback()
    except Exception:
        result = None
    if not result or not result.get("item"):
        try:
            result = sp.current_user_playing_track()
        except Exception:
            result = None

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
            rating = _rating_limpio(row.iloc[0].get("rating", "")) or None

    # progress_ms y duration_ms YA venian en la respuesta de Spotify y se
    # tiraban. Son los que hacen posible la barra de progreso, y no cuestan una
    # llamada extra. `progress_ms` puede faltar (algunos dispositivos no lo
    # reportan), asi que el frontend tiene que aguantar None.
    return {
        "is_playing": is_playing,
        "progress_ms": result.get("progress_ms"),
        "duration_ms": item.get("duration_ms"),
        "track": {
            "id": tid,
            "name": item.get("name", ""),
            "artist": ", ".join(a.get("name", "") for a in artists if a.get("name")),
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
    """
    Reanuda la reproduccion. Reintenta con device_id explicito porque Spotify
    rechaza start_playback con NO_ACTIVE_DEVICE cuando la app esta abierta pero
    idle — que es exactamente el estado en el que queda tras un rato en pausa,
    y por lo tanto el caso mas probable de este boton.
    """
    sp = spotify.get_client()
    try:
        sp.start_playback()
        return {"ok": True}
    except Exception as first_error:
        device_id = _resolve_device_id(sp)
        if not device_id:
            raise HTTPException(
                status_code=400,
                detail="No hay ningun dispositivo de Spotify disponible. Abre "
                       "Spotify en alguna parte y vuelve a intentar.",
            )
        try:
            sp.start_playback(device_id=device_id)
        except Exception:
            raise HTTPException(status_code=400, detail=str(first_error))
    return {"ok": True}


def _resolve_device_id(sp) -> Optional[str]:
    """
    Devuelve un device_id usable. Spotify rechaza start_playback con
    NO_ACTIVE_DEVICE cuando la app está abierta pero idle; pasarle el device
    explícitamente lo revive. Prefiere el activo, si no el primero disponible.
    """
    try:
        devices = (sp.devices() or {}).get("devices") or []
    except Exception:
        return None
    if not devices:
        return None
    for d in devices:
        if d.get("is_active"):
            return d.get("id")
    return devices[0].get("id")


@router.post("/player/play-in-context")
def player_play_in_context(req: PlayContextRequest):
    """
    Reproduce un track DENTRO de una playlist (por default <3333>), no aislado.
    Así lo que sigue es la siguiente canción de la playlist y no el radio de
    Spotify. Apaga shuffle antes, salvo que se pida lo contrario.
    Requiere Premium y un dispositivo disponible.
    """
    sp = spotify.get_client()
    playlist_id = req.playlist_id or config.CALIFICAR_PLAYLIST_ID
    context_uri = f"spotify:playlist:{playlist_id}"
    offset = {"uri": f"spotify:track:{req.track_id}"}

    if req.shuffle_off:
        # No es crítico: si falla (sin dispositivo, sin Premium) igual seguimos.
        try:
            sp.shuffle(False)
        except Exception:
            pass

    def _start(device_id=None):
        sp.start_playback(device_id=device_id, context_uri=context_uri, offset=offset)

    try:
        _start()
    except Exception as first_err:
        device_id = _resolve_device_id(sp)
        if not device_id:
            raise HTTPException(
                status_code=400,
                detail="No hay ningún dispositivo de Spotify disponible. "
                       "Abre Spotify en la compu o el celular y vuelve a intentar.",
            )
        try:
            _start(device_id)
        except Exception as second_err:
            raise HTTPException(
                status_code=400,
                detail=f"Spotify rechazó la reproducción: {second_err} "
                       f"(primer intento: {first_err}). "
                       f"Requiere Spotify Premium.",
            )

    # Reintenta apagar shuffle ya con reproducción activa — antes de tener
    # contexto, Spotify a veces ignora el toggle.
    if req.shuffle_off:
        try:
            sp.shuffle(False)
        except Exception:
            pass

    return {"ok": True, "playlist_id": playlist_id, "track_id": req.track_id}


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


@router.post("/player/seek")
def player_seek(req: SeekRequest):
    """Mover la reproduccion dentro de la cancion (la barra de progreso)."""
    if req.position_ms < 0:
        raise HTTPException(status_code=400, detail="La posicion no puede ser negativa.")
    sp = spotify.get_client()
    try:
        sp.seek_track(req.position_ms)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "position_ms": req.position_ms}


@router.get("/saved/{track_id}")
def is_track_saved(track_id: str):
    """Dice si una cancion tiene el corazon de Spotify.

    Va en su propio endpoint y NO dentro de `now-playing` a proposito: el
    reproductor sondea cada pocos segundos, y meterlo ahi le regalaria una
    llamada extra a Spotify a cada vuelta. Asi solo se pregunta cuando cambia
    la cancion, o sea una vez cada tres minutos.
    """
    sp = spotify.get_client()
    try:
        saved = spotify.are_tracks_saved(sp, [track_id])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Spotify no contesto: {e}")
    return {"track_id": track_id, "saved": bool(saved.get(track_id))}


@router.get("/info/{track_id}")
def track_info(track_id: str):
    """Calificacion y portada de UNA cancion, por su id exacto.

    Existe para la notificacion de Android: la app de Spotify del celular le
    avisa el track_id de lo que suena, y preguntarle a `now-playing` no sirve
    porque la API de Spotify puede ir detras del celular (visto el
    2026-09-24: el celular decia "Nadie Como Tu" y la API seguia en "Futuro").
    Con el id exacto no hay desfase posible.

    Una sola query por PK (no `load_all()`), y Spotify es NO-FATAL: sin
    portada, la calificacion igual sale.
    """
    row = database.get_track(track_id)
    rating = _rating_limpio(row.get("rating")) if row else ""
    out = {
        "track_id": track_id,
        "rating": rating or None,
        "name": (row or {}).get("name") or "",
        "artist": (row or {}).get("artist") or "",
        "image": None,
    }
    try:
        t = spotify.get_client().track(track_id)
        # La de ~300 px: la notificacion la pinta a 64dp y la de 640 pesa el triple.
        imgs = sorted(((t.get("album") or {}).get("images") or []), key=lambda i: i.get("width") or 0)
        buena = next((i for i in imgs if (i.get("width") or 0) >= 300), imgs[-1] if imgs else None)
        out["image"] = buena.get("url") if buena else None
        out["name"] = out["name"] or t.get("name", "")
        out["artist"] = out["artist"] or ", ".join(a.get("name", "") for a in t.get("artists") or [])
    except Exception as e:
        print("[track_info] Spotify no dio la portada de %s: %s" % (track_id, e))
    return out


@router.post("/like")
def like_tracks(req: LikeRequest):
    """Pone el corazon nativo de Spotify. Gemelo de /unlike.

    No escribe ninguna calificacion: el corazon y el rating son cosas
    distintas, y solo `rate_track` los mueve juntos.
    """
    ids = [t for t in dict.fromkeys(req.track_ids) if t]
    if not ids:
        return {"ok": True, "saved": 0}
    sp = spotify.get_client()
    try:
        spotify.save_tracks(sp, ids)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Spotify rechazo el like: {e}")
    return {"ok": True, "saved": len(ids)}


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
                    tr["rating"] = _rating_limpio(row.iloc[0].get("rating", "")) or None

    return tracks


# ---------------------------------------------------------------------------
# Historial de escuchas real  (Mejoras.txt seccion 8)
# ---------------------------------------------------------------------------

LISTENING_CURSOR_KEY = "listening_cursor"


def _iso_to_mysql(s: str) -> Optional[str]:
    """'2026-09-02T18:23:45.123Z' -> '2026-09-02 18:23:45' (MySQL DATETIME)."""
    if not s:
        return None
    return s.replace("T", " ").replace("Z", "").split(".")[0][:19]


@router.get("/listening/summary")
def listening_summary():
    """Global listening totals. Does not touch Spotify, only MySQL."""
    return database.get_listening_summary()


@router.post("/listening/capture")
def listening_capture():
    """Pull new plays from Spotify's own history and fold them into the DB.

    THIS IS WHAT MAKES THE HISTORY SELF-SUSTAINING. Spotify keeps the play
    history on their side, so the app does NOT need to be open while Angel
    listens — it only has to wake up now and then and ask. That is what removes
    the need to ever request the privacy export again.

    The hard limit is that /me/player/recently-played only ever returns the last
    50 plays: anything beyond that between two captures is lost for good. Hourly
    would already need 50 songs in one hour (a 72-second average) to lose
    anything, and the keep-awake cron runs every 10 minutes, so the margin is
    enormous.

    Idempotent on purpose. The `after` cursor is passed to Spotify AND the
    result is filtered locally by played_at, because double-counting here is
    silent and permanent — the numbers would drift with no way to tell.

    KNOWN IMPRECISION: recently-played says WHAT was played but not for how
    long, so ms_total is approximated with the track duration. `plays` stays
    exact; only the hours drift slightly high vs the export, which carries the
    real ms_played.
    """
    sp = spotify.get_client()

    # Un cursor ilegible se descarta por completo, y eso NO es paranoia barata:
    # el filtro local compara strings, asi que un valor basura como "basura"
    # resulta ser mayor que cualquier "2026-..." y descartaria toda captura
    # futura, en silencio y para siempre. Si no se puede parsear, se trata como
    # si no hubiera cursor: peor caso, se recapturan reproducciones que el
    # ON DUPLICATE KEY ya sabe absorber.
    raw_cursor = database.get_config(LISTENING_CURSOR_KEY)
    cursor = None
    after_ms = None
    if raw_cursor:
        try:
            dt = datetime.fromisoformat(raw_cursor.replace("Z", "+00:00"))
            after_ms = int(dt.timestamp() * 1000)
            cursor = raw_cursor
        except Exception:
            print("[listening] cursor ilegible en config, se ignora: %r" % raw_cursor)

    try:
        result = sp.current_user_recently_played(limit=50, after=after_ms)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Spotify no respondio: {e}")

    items = (result or {}).get("items") or []

    agg = {}
    eventos = []          # serie temporal, ver database.listening_events
    newest = cursor or ""
    considered = 0
    for item in items:
        played_at = item.get("played_at") or ""
        # Segundo filtro, por si el cursor de Spotify devuelve algo ya visto.
        if cursor and played_at <= cursor:
            continue
        t = item.get("track") or {}
        tid = t.get("id")
        if not tid:
            continue
        considered += 1
        if played_at > newest:
            newest = played_at
        a = agg.get(tid)
        if a is None:
            artists = t.get("artists") or [{}]
            a = agg[tid] = {
                "track_id": tid,
                "name": t.get("name") or "",
                "artist": artists[0].get("name", ""),
                "plays": 0, "skips": 0, "ms_total": 0,
                "first_played": _iso_to_mysql(played_at),
                "last_played": _iso_to_mysql(played_at),
            }
        a["plays"] += 1
        a["ms_total"] += int(t.get("duration_ms") or 0)
        # La misma reproduccion, ademas, como fila propia: es lo unico que
        # permite contestar "cuantas veces en los ultimos 30 dias". El agregado
        # de arriba no puede, porque suma sin guardar cuando.
        eventos.append({
            "track_id": tid,
            "played_at": _iso_to_mysql(played_at),
            "ms_played": int(t.get("duration_ms") or 0),
            "name": a["name"],
            "artist": a["artist"],
        })
        mp = _iso_to_mysql(played_at)
        if mp and (a["first_played"] is None or mp < a["first_played"]):
            a["first_played"] = mp
        if mp and (a["last_played"] is None or mp > a["last_played"]):
            a["last_played"] = mp

    written = database.add_listening_batch(list(agg.values())) if agg else 0
    # Idempotente por PK (track_id, played_at): re-capturar no duplica.
    eventos_escritos = database.add_events_batch(eventos) if eventos else 0
    if newest and newest != cursor:
        database.set_config(LISTENING_CURSOR_KEY, newest)

    return {
        "ok": True,
        "returned_by_spotify": len(items),
        "new_plays": considered,
        "tracks_touched": written,
        "events_written": eventos_escritos,
        "cursor": newest or None,
    }


@router.get("/backfill/queue")
def backfill_queue(limit: int = Query(3000, ge=1, le=5000)):
    """Me Gusta que NUNCA pasaron por RateApp, ordenados por lo que de verdad oyes.

    De los 2,328 Me Gusta de Angel, 1,537 (66%) no tienen calificacion: la app
    esta ciega a dos tercios de lo que escucha. Esta cola es PendingPage pero
    alimentada por escuchas reales en vez de por la playlist <3333>.

    CADA FILA TRAE `suggested_added_at` = la primera vez que se escucho la
    cancion, y el frontend la manda de vuelta al calificar. Sin eso, catalogar
    estas canciones las fecharia hoy, y como 1,520 de las 1,537 son de antes de
    2026 acabarian todas dentro de Latte 2026 y de la Galeria Anual — encima
    ordenadas arriba de todo, porque el bloque de novedades las veria recien
    llegadas. Tambien arruinaria la medicion de A+/A de latte 2026 (seccion 6b),
    que lleva meses esperandose.

    RENDIMIENTO: las escuchas se piden con get_listening_many(), UNA query con
    un solo IN (...). Pedirlas cancion por cancion serian ~1,500 viajes a
    us-east-1 a ~80 ms = dos minutos largos. Es la regla escrita en database.py.
    """
    sp = spotify.get_client()
    liked = spotify.get_all_liked_tracks(sp, limit=limit)

    # Que ya esta calificado. Una sola lectura de la tabla, no una por cancion.
    df = database.load_all()
    rated = {}
    if not df.empty:
        for _, r in df.iterrows():
            rated[r["track_id"]] = _rating_limpio(r.get("rating", ""))

    pendientes = [t for t in liked if not rated.get(t.get("id") or t.get("track_id"), "")]

    # Empareja por nombre+artista, no solo por track_id: Spotify da IDs
    # distintos a la misma cancion y por ahi se perdian ~12,000 reproducciones.
    escuchas = database.get_listening_for(pendientes)

    ahora = utils.now_utc()
    hace_12m = (ahora - timedelta(days=365)).replace(tzinfo=None)

    filas = []
    for t in pendientes:
        tid = t.get("id") or t.get("track_id")
        s = escuchas.get(tid)
        plays = s["plays"] if s else 0
        last = s["last_played"] if s else None
        first = s["first_played"] if s else None

        # "Activa" = la sigues oyendo. El agregado guarda totales, no una serie
        # temporal, asi que no se puede contar plays de los ultimos 12 meses:
        # last_played es el mejor proxy disponible y es el que decide el orden.
        activa = False
        if last:
            try:
                activa = datetime.fromisoformat(last) >= hace_12m
            except Exception:
                activa = False

        filas.append({
            "track_id": tid,
            "name": t.get("name", ""),
            "artist": t.get("artist", ""),
            "album": t.get("album", ""),
            "image": t.get("image"),
            "liked_at": t.get("added_at"),
            "plays": plays,
            "skips": s["skips"] if s else 0,
            "hours": s["hours"] if s else 0.0,
            "sin_datos": s is None,
            "first_played": first,
            "last_played": last,
            "activa": activa,
            # Lo que el frontend devuelve en el POST /rate para fechar bien.
            # Si no hay historial cae a None y rate_track usa "hoy", que para
            # una cancion sin una sola escucha registrada es lo honesto.
            "suggested_added_at": first.replace("T", " ")[:19] if first else None,
        })

    # Primero lo que sigues oyendo, y dentro de eso lo mas escuchado.
    filas.sort(key=lambda f: (f["activa"], f["plays"]), reverse=True)

    return {
        "total_liked": len(liked),
        "total_pending": len(filas),
        "activas": sum(1 for f in filas if f["activa"]),
        "tracks": filas,
    }


# --- Limpieza de Me Gusta: las ABANDONADAS (Mejoras.txt seccion 8) ----------
#
# Angel pidio "las menos escuchadas" y NO EXISTEN: de 2,212 Me Gusta con 6+
# meses, solo 32 tienen 0-2 reproducciones en toda su vida, y la mediana son 22
# escuchas completas. No hay basura por volumen.
#
# Lo que si existe, y es lo que de verdad le molesta, son las ABANDONADAS: 721
# canciones (31% de sus Me Gusta) que escucho mucho hace anios y lleva 12+ meses
# sin poner ni una vez. La metrica correcta es RECENCIA, no volumen.
#
# ABANDONADA != BASURA. Puede ser un clasico personal que no se pone seguido.
# Esto es una lista de CANDIDATAS A REVISAR: la app nunca quita un like sola.

ABANDONO_MESES = 12      # sin escucharla
ABANDONO_MIN_PLAYS = 5   # la escuchaste de verdad en su momento
ABANDONO_MIN_EDAD_D = 365  # el like tiene al menos un anio: lo nuevo no se juzga


@router.get("/abandoned/queue")
def abandoned_queue(
    limit: int = Query(3000, ge=1, le=5000),
    meses: int = Query(ABANDONO_MESES, ge=1, le=120),
    min_plays: int = Query(ABANDONO_MIN_PLAYS, ge=0, le=1000),
):
    """Me Gusta que amabas y ya no escuchas.

    Ordenadas por cuanto las escuchaste ANTES: primero las que mas te gustaron
    y mas abandonaste, que son las que mas dicen sobre como cambio tu gusto.

    RENDIMIENTO: un solo get_listening_many() con un IN (...), nunca una query
    por cancion (ver la regla en database.py).
    """
    sp = spotify.get_client()
    liked = spotify.get_all_liked_tracks(sp, limit=limit)

    df = database.load_all()
    ratings = {}
    if not df.empty:
        for _, r in df.iterrows():
            ratings[r["track_id"]] = _rating_limpio(r.get("rating", ""))

    escuchas = database.get_listening_for(liked)

    ahora = utils.now_utc().replace(tzinfo=None)
    corte_escucha = ahora - timedelta(days=30 * meses)
    corte_like = ahora - timedelta(days=ABANDONO_MIN_EDAD_D)

    filas = []
    for t in liked:
        tid = t.get("id") or t.get("track_id")
        s = escuchas.get(tid)
        if not s or s["plays"] < min_plays:
            continue

        # Un like reciente no se juzga: no ha tenido tiempo de ser abandonado.
        liked_at = t.get("added_at")
        if liked_at:
            try:
                if datetime.fromisoformat(
                        str(liked_at).replace("Z", "+00:00")).replace(
                        tzinfo=None) > corte_like:
                    continue
            except Exception:
                pass

        last = s.get("last_played")
        if not last:
            continue
        try:
            last_dt = datetime.fromisoformat(last)
        except Exception:
            continue
        if last_dt > corte_escucha:
            continue   # la sigues escuchando: no esta abandonada

        filas.append({
            "track_id": tid,
            "name": t.get("name", ""),
            "artist": t.get("artist", ""),
            "album": t.get("album", ""),
            "image": t.get("image"),
            "rating": ratings.get(tid, "") or None,
            "plays": s["plays"],
            "hours": s["hours"],
            "first_played": s.get("first_played"),
            "last_played": last,
            "meses_sin_oir": int((ahora - last_dt).days / 30),
        })

    filas.sort(key=lambda f: -f["plays"])
    return {
        "total": len(filas),
        "criterio": {"meses_sin_oir": meses, "min_plays": min_plays},
        "tracks": filas,
    }


@router.post("/unlike")
def unlike_tracks(req: UnlikeRequest):
    """Quita el like de Spotify a las canciones dadas.

    Es la unica accion destructiva de la limpieza, asi que:
      - la app NUNCA la dispara sola, siempre sale de una seleccion explicita;
      - no escribe ninguna calificacion. Abandonada no es lo mismo que mala, y
        marcarlas D automaticamente seria poner en la DB un juicio que Angel no
        hizo. Si quiere calificarlas, para eso estan los botones de rating.
    """
    ids = [t for t in dict.fromkeys(req.track_ids) if t]
    if not ids:
        return {"ok": True, "removed": 0}
    if len(ids) > 200:
        raise HTTPException(
            status_code=400,
            detail="Maximo 200 canciones por vez. Es a proposito: quitar likes "
                   "no se deshace solo y conviene revisarlo en tandas.",
        )
    sp = spotify.get_client()
    try:
        spotify.unsave_tracks(sp, ids)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Spotify rechazo el unlike: {e}")
    return {"ok": True, "removed": len(ids)}


# --- Escuchar la cola sin ir cancion por cancion ----------------------------

def _rating_limpio(valor) -> str:
    """La calificacion tal como debe verse, o "" si no hay ninguna.

    NO ES PARANOIA. `load_all()` arma un DataFrame, y un rating NULL llega como
    NaN o como None segun el dtype que pandas le infiera a la columna. `str()`
    los vuelve las CADENAS "nan" y "None", que son VERDADERAS, asi que se
    cuelan como si fueran una calificacion de verdad: la UI pinta "None" y el
    filtro de "solo sin calificar" deja de encontrarlas.
    
    Con "nan" ya paso el 2026-05-01 (el filtro `!= "D"` dejaba pasar los NULL)
    y se tapo en seis lugares por separado; "None" era el mismo bug sin tapar,
    y lo atrapo una prueba de la ventana de escuchas el 2026-09-21.
    """
    v = str(valor if valor is not None else "").strip()
    return "" if v.lower() in ("", "nan", "none", "<na>", "null") else v


BACKFILL_PLAYLIST_KEY = "backfill_playlist_id"


@router.post("/backfill/playlist")
def backfill_playlist(
    req: Optional[QueuePlaylistRequest] = None,
    limit: int = Query(50, ge=1, le=100),
    play: bool = Query(True),
    source: str = Query("backfill", pattern="^(backfill|abandoned|cleanup|window)$"),
):
    """Arma una playlist REAL con lo primero de la cola y la reproduce.

    Angel: "no quisiera ir buscando cancion por cancion". Una playlist de verdad
    (en vez de mandarle una lista de uris a start_playback) le deja seguir
    escuchando desde Spotify sin la app abierta.

    Se REUTILIZA la misma playlist siempre — su id vive en `config` — para no
    ir dejando una playlist nueva tirada en su cuenta cada vez. Por eso el
    contenido se reemplaza, no se acumula.

    Tope de `limit` a proposito: pidio explicitamente no acabar con una cola de
    mil canciones.
    """
    sp = spotify.get_client()

    # Camino preferido: el frontend manda EXACTAMENTE el tramo que el usuario
    # esta viendo. Angel: "que hago si quiero escuchar de la 60 a la 100? a
    # fuerza tendria que calificar las 50 primeras?". No: manda esas.
    ids = [t for t in dict.fromkeys(req.track_ids)] if (req and req.track_ids) else []

    if not ids:
        # Sin lista explicita se cae a las primeras N de la cola que se pida.
        # Los argumentos van EXPLICITOS: llamadas de Python a Python no pasan
        # por FastAPI, y los defaults declarados como Query(...) llegarian como
        # el objeto Query en vez de como el numero.
        if source == "abandoned":
            datos = abandoned_queue(limit=3000, meses=ABANDONO_MESES,
                                    min_plays=ABANDONO_MIN_PLAYS)
        elif source == "cleanup":
            datos = cleanup_queue(limit=3000)
        elif source == "window":
            # 30 dias es el default de la pantalla. Argumentos explicitos: una
            # llamada de Python a Python recibe los Query(...) como objeto.
            datos = {"tracks": listening_window(dias=30, limit=limit)["items"]}
        else:
            datos = backfill_queue(limit=3000)
        ids = [t["track_id"] for t in datos["tracks"][:limit]]

    ids = ids[:limit]
    if not ids:
        raise HTTPException(status_code=400, detail="No hay canciones en la cola.")

    NOMBRES = {
        "abandoned": "Abandonadas — revisar",
        "cleanup": "Limpiar Me Gusta — revisar",
        "backfill": "Por calificar — lo que más escuchas",
        "window": "Mis más escuchadas — RateApp",
    }
    nombre = NOMBRES.get(source, NOMBRES["backfill"])
    desc = ("Generada por RateApp. Se reemplaza cada vez que la pides, "
            "así que no la edites a mano.")

    # Una playlist por fuente: si compartieran clave, abrir una vista
    # pisaria la playlist que la otra dejo sonando.
    cfg_key = BACKFILL_PLAYLIST_KEY + ("" if source == "backfill" else "_" + source)
    pl_id = database.get_config(cfg_key)
    if pl_id:
        # Puede haber sido borrada desde Spotify: si ya no existe, se recrea.
        try:
            spotify.replace_playlist(sp, pl_id, ids)
        except Exception:
            pl_id = None
    if not pl_id:
        try:
            me = sp.current_user()
            nueva = sp.user_playlist_create(
                me["id"], nombre, public=False, description=desc)
            pl_id = nueva["id"]
            spotify.replace_playlist(sp, pl_id, ids)
            database.set_config(cfg_key, pl_id)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"No se pudo crear la playlist: {e}")

    started = False
    error_play = None
    if play:
        ctx = f"spotify:playlist:{pl_id}"
        try:
            sp.shuffle(False)
        except Exception:
            pass

        # EL OFFSET NO ES OPCIONAL, y omitirlo fue un bug real: Spotify recuerda
        # la posicion dentro de un contexto, y como aqui SIEMPRE se reutiliza la
        # misma playlist, arrancarla sin offset REANUDA donde se quedo la tanda
        # anterior en vez de empezar por la primera. Sintoma: pedir "escuchar
        # desde la #22" y oir la segunda cancion de la vez pasada.
        # Es el mismo patron que play-in-context ya usaba desde mayo.
        #
        # Se intenta por uri (preciso, y de paso confirma que la playlist ya
        # tiene el contenido nuevo) y se cae a position 0 por si Spotify todavia
        # no propago el reemplazo.
        primera = f"spotify:track:{ids[0]}"

        def _arrancar(device_id=None):
            try:
                sp.start_playback(device_id=device_id, context_uri=ctx,
                                  offset={"uri": primera})
            except Exception:
                sp.start_playback(device_id=device_id, context_uri=ctx,
                                  offset={"position": 0})

        try:
            _arrancar()
            started = True
        except Exception as first:
            dev = _resolve_device_id(sp)
            if dev:
                try:
                    _arrancar(dev)
                    started = True
                except Exception as second:
                    error_play = str(second)
            else:
                error_play = ("No hay ningún dispositivo de Spotify disponible. "
                              "Abre Spotify y vuelve a intentar.")
            if not started and error_play is None:
                error_play = str(first)

    return {
        "ok": True,
        "playlist_id": pl_id,
        "count": len(ids),
        "playing": started,
        "error": error_play,
        "spotify_url": f"https://open.spotify.com/playlist/{pl_id}",
    }


@router.get("/cleanup/queue")
def cleanup_queue(limit: int = Query(3000, ge=1, le=5000)):
    """TODOS los Me Gusta con sus escuchas reales. Sin filtrar, sin ordenar.

    Reemplaza a /abandoned/queue, que filtraba con un criterio fijo. Angel:
    "en realidad yo queria las que tengo en mis me gusta y casi ni escuche, no
    digo solo las que tienen 0 escuchas, sino que tienen demasiado pocas.
    maybe armar mis me gusta por escucha, y de ahi calificar".

    Tenia razon y la medicion anterior estaba mal planteada: se habia mirado el
    umbral 0-2 plays (34 canciones) y de ahi salio el "no existen las menos
    escuchadas". Pero con la mediana en 20 escuchas, **5 escuchas si es casi
    nada**: hay 115 asi, y 405 con 10 o menos (17% de sus Me Gusta).

    Por eso este endpoint NO decide el umbral. Devuelve todo con sus numeros y
    el frontend ordena y corta — el corte lo pone Angel, que es quien sabe.

    Una sola llamada trae las ~2,300 canciones, y el frontend la cachea: asi
    cambiar de orden o de umbral es instantaneo y no se vuelve a esperar.
    """
    sp = spotify.get_client()
    liked = spotify.get_all_liked_tracks(sp, limit=limit)

    df = database.load_all()
    ratings = {}
    if not df.empty:
        for _, r in df.iterrows():
            ratings[r["track_id"]] = _rating_limpio(r.get("rating", ""))

    escuchas = database.get_listening_for(liked)   # UNA query con un solo IN

    ahora = utils.now_utc().replace(tzinfo=None)
    filas = []
    for t in liked:
        tid = t.get("id") or t.get("track_id")
        s = escuchas.get(tid)
        last = s.get("last_played") if s else None
        meses = None
        if last:
            try:
                meses = int((ahora - datetime.fromisoformat(last)).days / 30)
            except Exception:
                meses = None
        first = s.get("first_played") if s else None
        filas.append({
            "track_id": tid,
            "name": t.get("name", ""),
            "artist": t.get("artist", ""),
            "album": t.get("album", ""),
            "image": t.get("image"),
            "liked_at": t.get("added_at"),
            "rating": ratings.get(tid, "") or None,
            "plays": s["plays"] if s else 0,
            "skips": s["skips"] if s else 0,
            "hours": s["hours"] if s else 0.0,
            "first_played": first,
            "last_played": last,
            "meses_sin_oir": meses,
            # DISTINCION IMPORTANTE: "0 escuchas" y "no tengo el dato" no son lo
            # mismo, y confundirlos es peligroso — las sin dato salen arriba en
            # la lista de limpieza, o sea son las primeras candidatas a borrar.
            # Angel reporto justo eso: canciones que si escucha marcadas en 0.
            "sin_datos": s is None,
            "suggested_added_at": first.replace("T", " ")[:19] if first else None,
        })

    # Menos escuchadas primero: es el orden que Angel pidio ver.
    filas.sort(key=lambda f: (f["plays"], -(f["meses_sin_oir"] or 0)))
    return {"total": len(filas), "tracks": filas}


@router.post("/listening/reindex")
def listening_reindex():
    """Recalcula la clave de emparejamiento de toda la tabla.

    Hace falta una vez, despues de agregar match_key. Se hace desde el
    servidor y no re-corriendo el import para no obligar a Angel a manejar la
    contrasena de MySQL otra vez: la tabla ya guarda name y artist, asi que la
    clave se deriva de lo que hay.
    """
    database.ensure_listening_match_key()
    return database.reindex_listening_keys()


@router.get("/listening/window")
def listening_window(dias: int = Query(30, description="0 = historico"),
                     limit: int = Query(100, ge=1, le=1000)):
    """Las mas escuchadas de una ventana de tiempo, listas para pintar.

    ESTO ES LO QUE EL AGREGADO NO PODIA CONTESTAR. `listening_stats` guarda
    totales, asi que una cancion con 200 plays en 2021 y UNA sola vez ayer se
    ve igual de reciente que una que suena 50 veces este mes. Angel lo pidio
    asi el 2026-09-06: "que el mix sea de las canciones favoritas de los
    ultimos 30 dias, el ultimo anio o historico".

    OJO CON EL ORDEN DE RUTAS: esta va ANTES de /listening/{track_id}, si no la
    parametrizada se la come. Ya paso con summary y capture.
    """
    d = None if not dias or int(dias) <= 0 else int(dias)
    items = database.get_top_window(dias=d, limit=int(limit))

    # --- calificacion que ya tenga, para saber que FALTA por calificar -------
    # load_all() es UNA query; sacar el rating de a uno serian ~80 ms por
    # cancion contra us-east-1.
    ratings = {}
    try:
        df = database.load_all()
        if not df.empty:
            for _, r in df.iterrows():
                ratings[r["track_id"]] = _rating_limpio(r.get("rating", ""))
    except Exception:
        ratings = {}

    # --- LA FECHA SUGERIDA SALE DEL AGREGADO, NO DE LA VENTANA --------------
    # `first_played` que devuelve get_top_window es la primera escucha DENTRO de
    # la ventana, o sea a lo mas 30 dias atras. Usarla para calificar fecharia
    # en 2026 una cancion que Angel descubrio en 2019, y entonces
    # `rate_track` la tratatia como NUEVA: se metria al cuatrimestre actual,
    # a la Galeria y a Me Gusta. Es exactamente el desastre que /backfill
    # existe para evitar (ver la entrada del 2026-09-04).
    #
    # La primera escucha DE VERDAD vive en listening_stats, y get_listening_for
    # la resuelve en una query sumando por match_key.
    historico = {}
    try:
        historico = database.get_listening_for(items)
    except Exception:
        historico = {}

    for i, it in enumerate(items, start=1):
        tid = it.get("track_id")
        h = historico.get(tid) or {}
        it["rank"] = i
        it["rating"] = ratings.get(tid, "") or None
        it["plays_total"] = h.get("plays")
        it["primera_escucha"] = h.get("first_played")
        # Si el agregado no tiene fila (no deberia: salen del mismo import),
        # la del evento es lo unico que se sabe, y sigue siendo mejor que hoy.
        it["suggested_added_at"] = h.get("first_played") or it.get("first_played")
        it["spotify_url"] = f"https://open.spotify.com/track/{tid}" if tid else None

    # --- portada, en lotes de 50 y NUNCA fatal ------------------------------
    # Mismo patron que /recent y que los candidatos de migracion. Se toma la
    # imagen mas chica (images[-1], 64 px) porque son miniaturas de lista.
    if items:
        try:
            sp = spotify.get_client()
            ids = [it["track_id"] for it in items if it.get("track_id")]
            imgs = {}
            for chunk in utils.chunk_list(ids, 50):
                res = sp.tracks(chunk)
                for t in (res.get("tracks") or []):
                    if t:
                        album = (t.get("album") or {})
                        ii = album.get("images") or []
                        imgs[t["id"]] = {
                            "image": ii[-1].get("url") if ii else None,
                            "album": album.get("name", ""),
                        }
            for it in items:
                extra = imgs.get(it.get("track_id")) or {}
                it["image"] = extra.get("image")
                it["album"] = extra.get("album", "")
        except Exception:
            # Sin Spotify la lista sale igual: los numeros son de MySQL.
            for it in items:
                it.setdefault("image", None)
                it.setdefault("album", "")

    return {
        "dias": d,
        "total": len(items),
        "sin_calificar": sum(1 for it in items if not it.get("rating")),
        "items": items,
    }


@router.get("/listening/events-summary")
def listening_events_summary():
    """Cuanta serie temporal hay guardada. Solo MySQL, no toca Spotify."""
    return database.get_events_summary()


@router.get("/listening/{track_id}")
def listening_for_track(track_id: str,
                        name: str = Query("", description="para emparejar por nombre"),
                        artist: str = Query("")):
    """Real listening stats for one track: plays, hours, first and last time.

    One PK lookup. For a list of tracks use database.get_listening_many()
    instead — calling this in a loop is the 40-second mistake documented in
    database.py.
    """
    # Con nombre y artista se empareja igual que las colas, que es lo que
    # recupera las escuchas guardadas bajo otro track_id.
    # isinstance: llamada de Python a Python, estos llegan como objeto Query.
    name = name if isinstance(name, str) else ""
    artist = artist if isinstance(artist, str) else ""
    if name or artist:
        stats = database.get_listening_for(
            [{"track_id": track_id, "name": name, "artist": artist}]
        ).get(track_id)
    else:
        stats = database.get_listening(track_id)
    if not stats:
        return {
            "track_id": track_id, "found": False, "plays": 0, "skips": 0,
            "ms_total": 0, "hours": 0.0,
            "first_played": None, "last_played": None,
        }
    stats["found"] = True
    return stats


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
        "top_artists_year": extended["top_artists_year"],
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

    # Preserve original added_at on re-rate (upsert only sets it on INSERT).
    # req.added_at lo manda el backfill con la fecha de la PRIMERA ESCUCHA real,
    # para que una cancion de 2021 quede fechada en 2021 y por lo tanto cuente
    # como historica: asi no se cuela a Latte 2026 ni a la Galeria Anual.
    added_at = req.added_at or now_str

    # Una cancion NUEVA sin nombre quedaria en la DB como fila anonima, y ahi no
    # hay upsert que la arregle despues. Si el cliente no mando los nombres
    # (los atajos globales solo saben el track_id), se piden a Spotify. Es una
    # sola llamada y solo cuando falta el dato: re-calificar no la paga.
    name, artist, album = req.name, req.artist, req.album
    if old_track is None and not (name and artist):
        try:
            t = sp.track(tid) or {}
            name = name or t.get("name", "")
            artist = artist or ", ".join(
                a.get("name", "") for a in (t.get("artists") or []) if a.get("name")
            )
            album = album or (t.get("album") or {}).get("name", "")
        except Exception:
            pass  # sin Spotify se califica igual; el nombre es cosmetico
    database.upsert_track(tid, name, artist, album, added_at, new_rating)

    if soft:
        return {"ok": True, "rating": new_rating}

    # Estado con el que quedo la cancion DESPUES del upsert. No basta con mirar
    # old_track: desde que el backfill puede insertar con fecha historica, una
    # cancion NUEVA tambien puede nacer fechada en 2021, y entonces hay que
    # tratarla como historica igual que a una que ya existia. Antes de eso el
    # caso no podia darse — una cancion nueva siempre se fechaba hoy — y por eso
    # la logica de abajo solo consultaba old_track.
    efectivo = old_track or {"added_at": added_at, "cuatrimestre_override": None}

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
        # If track is historical, set override so rebuild lo incluye en el cuatri actual.
        # Sin el override, `POST /playlists/rebuild/anual` — que filtra por anio
        # actual — sacaria de la Galeria la cancion que se acaba de agregar.
        override = efectivo.get("cuatrimestre_override")
        if not _belongs_to_current_cuatri(efectivo, current_cuatri) and override != current_cuatri:
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
        # Like — only if not already saved, to avoid re-positioning in Liked Songs
        try:
            if not spotify.are_tracks_saved(sp, [tid]).get(tid, False):
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
            # Una cancion nueva fechada hoy sigue contando como actual (era el
            # viejo `old_track is None`), pero una nueva fechada en 2021 por el
            # backfill NO: para B/C+ el cuatrimestre historico es intocable.
            is_current_track = (
                _belongs_to_current_cuatri(efectivo, current_cuatri)
                or efectivo.get("cuatrimestre_override") == current_cuatri
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


def _novedad_dias(playlist_id: str) -> Optional[int]:
    """
    Ventana de "novedad" que le toca a esta playlist, o None para orden puro de
    rating (el de siempre).

    Se deriva del playlist_id a proposito, y no se pasa en cada llamada: asi los
    6 puntos que llaman a _order_playlist la heredan sin tocarlos, incluido el
    endpoint genérico POST /playlists/order/{id} que usan los botones "Ordenar"
    de Herramientas. Si se pasara a mano, apretar ese boton desharia el orden.

    Las playlists de cuatrimestres pasados caen a None solas, que es justo la
    regla de que las historicas son intocables.
    """
    pl = config.DISTRIBUTION_PLAYLISTS
    if playlist_id and playlist_id == pl.get("anual"):
        return config.NOVEDAD_DIAS_ANUAL
    cuatri_actual = utils.get_cuatrimestre(utils.now_utc())
    if playlist_id and playlist_id == pl.get(cuatri_actual):
        return config.NOVEDAD_DIAS_CUATRI
    return None


def aplicar_novedad(df_in, playlist_id: str, novedad_dias="auto"):
    """
    Marca la columna `es_novedad` en df_in y devuelve (sort_by, sort_asc).

    Vive aparte porque hay DOS lugares que ordenan la Galeria Anual:
    _order_playlist y rebuild_anual (que tenia su propio sort duplicado). Si el
    criterio estuviera copiado, apretar "Reconstruir Galeria" en Herramientas
    desharia el bloque de novedades y el bug volveria de forma intermitente,
    que es la peor forma de que vuelva.

    Espera que df_in ya tenga `rating_order` y `added_at_dt`.
    """
    if novedad_dias == "auto":
        novedad_dias = _novedad_dias(playlist_id)

    if not novedad_dias:
        return ["rating_order", "added_at_dt"], [False, False]

    # added_at es DATETIME de MySQL (sin zona) y los dos llamadores lo parsean
    # SIN utc=True, o sea tz-naive. El corte tiene que ser naive tambien:
    # comparar naive contra aware lanza TypeError en pandas.
    corte = utils.now_utc().replace(tzinfo=None) - timedelta(days=novedad_dias)
    es_top = df_in["rating_order"] >= config.RATING_ORDER["B+"]
    # NaT >= corte da False, asi que las fechas ilegibles no suben.
    df_in["es_novedad"] = es_top & (df_in["added_at_dt"] >= corte)
    return ["es_novedad", "rating_order", "added_at_dt"], [False, False, False]


def _order_playlist(sp, playlist_id: str, min_rating_order: Optional[int] = None,
                    novedad_dias="auto"):
    """
    Reorder a playlist: rating desc, then date desc. Excludes D.
    Unrated tracks go to the end.

    Si la playlist tiene ventana de novedad (ver _novedad_dias), se anteponen
    las de TOP_SET calificadas dentro de la ventana. El resultado son dos
    bloques, cada uno en el orden clasico de rating + fecha:

        1. novedades  — TOP_SET reciente (A+, luego A, luego B+)
        2. el resto   — TOP_SET historico, luego B, C+ ...

    B, C+ y C nunca entran al bloque 1, aunque sean recientisimas: subirlas
    arriba de una A+ seria peor que el problema que esto arregla.
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

    sort_by, sort_asc = aplicar_novedad(df_in, playlist_id, novedad_dias)

    df_sorted = df_in.sort_values(
        by=sort_by,
        ascending=sort_asc,
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

@router.get("/migrate/candidates")
def get_migrate_candidates():
    """
    Estado completo del cuatrimestre anterior: lo que todavia se puede migrar y
    lo que ya se fue al actual.

    El ORDEN sale de la playlist real en Spotify, no se recalcula. Reproducirlo
    aqui seria adivinar: el bloque de novedades de la playlist origen se congelo
    con una ventana relativa a cuando ese cuatrimestre era el actual, y hoy
    `_novedad_dias` le devuelve None por ser historica. Leer las posiciones da
    exactamente lo que el usuario ve, sin ventanas ni fechas de por medio.
    """
    current_cuatri = utils.get_cuatrimestre(utils.now_utc())
    prev_cuatri = utils.CUATRIMESTRE_PREV.get(current_cuatri)

    if prev_cuatri is None:
        return {"candidates": [], "from_cuatri": None, "to_cuatri": current_cuatri}

    from_year = utils.now_utc().year
    candidates = database.get_migration_candidates(prev_cuatri, from_year)
    migrated = database.get_migrated_out(prev_cuatri, from_year, current_cuatri)

    for c in candidates:
        c["migrated"] = False
    for c in migrated:
        c["migrated"] = True

    rows = candidates + migrated

    # Orden = posicion en la playlist origen. Las que no estan en ella (las C,
    # que rate_track saca del cuatrimestre) van al final en vez de mezclarse
    # arriba por rating.
    from_playlist_id = config.DISTRIBUTION_PLAYLISTS.get(prev_cuatri)
    orden_playlist = False
    if from_playlist_id:
        try:
            sp_ids = spotify.get_playlist_track_ids(spotify.get_client(), from_playlist_id)
            pos = {tid: i for i, tid in enumerate(sp_ids)}
            for r in rows:
                r["en_playlist"] = r["track_id"] in pos
            rows.sort(key=lambda r: pos.get(r["track_id"], len(pos)))
            orden_playlist = True
        except Exception:
            for r in rows:
                r.setdefault("en_playlist", None)
    else:
        for r in rows:
            r["en_playlist"] = None

    # Enrich with album art (smallest thumbnail) via Spotify
    if rows:
        try:
            sp = spotify.get_client()
            ids = [c["track_id"] for c in rows]
            image_map = {}
            for chunk in utils.chunk_list(ids, 50):
                result = sp.tracks(chunk)
                for t in (result.get("tracks") or []):
                    if t:
                        images = (t.get("album") or {}).get("images") or []
                        image_map[t["id"]] = images[-1].get("url") if images else None
            for c in rows:
                c["image"] = image_map.get(c["track_id"])
        except Exception:
            for c in rows:
                c.setdefault("image", None)

    # Serialize datetimes
    for c in rows:
        if c.get("added_at") and hasattr(c["added_at"], "isoformat"):
            c["added_at"] = c["added_at"].isoformat()

    return {
        "candidates": rows,
        "from_cuatri": prev_cuatri,
        "to_cuatri": current_cuatri,
        "migrables": len(candidates),
        "ya_migradas": len(migrated),
        "orden_playlist": orden_playlist,
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

    label = utils.nombre_cuatri(to_cuatri)
    return {
        "migrated": len(req.track_ids),
        "message": f"{len(req.track_ids)} canciones migradas a {label}.",
    }
