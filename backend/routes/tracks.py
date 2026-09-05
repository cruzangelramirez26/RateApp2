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
    PlayContextRequest, UnlikeRequest,
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
        mp = _iso_to_mysql(played_at)
        if mp and (a["first_played"] is None or mp < a["first_played"]):
            a["first_played"] = mp
        if mp and (a["last_played"] is None or mp > a["last_played"]):
            a["last_played"] = mp

    written = database.add_listening_batch(list(agg.values())) if agg else 0
    if newest and newest != cursor:
        database.set_config(LISTENING_CURSOR_KEY, newest)

    return {
        "ok": True,
        "returned_by_spotify": len(items),
        "new_plays": considered,
        "tracks_touched": written,
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
            val = str(r.get("rating", "")).strip()
            rated[r["track_id"]] = val if val and val.lower() != "nan" else ""

    pendientes = [t for t in liked if not rated.get(t.get("id") or t.get("track_id"), "")]

    ids = [t.get("id") or t.get("track_id") for t in pendientes]
    escuchas = database.get_listening_many(ids)

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
            v = str(r.get("rating", "")).strip()
            ratings[r["track_id"]] = v if v and v.lower() != "nan" else ""

    ids = [t.get("id") or t.get("track_id") for t in liked]
    escuchas = database.get_listening_many(ids)

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

BACKFILL_PLAYLIST_KEY = "backfill_playlist_id"


@router.post("/backfill/playlist")
def backfill_playlist(
    limit: int = Query(50, ge=1, le=100),
    play: bool = Query(True),
    source: str = Query("backfill", pattern="^(backfill|abandoned)$"),
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

    # Los argumentos van EXPLICITOS. Llamadas asi, de Python a Python, no pasan
    # por FastAPI, y los defaults declarados como Query(...) llegarian como el
    # objeto Query en vez de como el numero.
    datos = (abandoned_queue(limit=3000, meses=ABANDONO_MESES,
                             min_plays=ABANDONO_MIN_PLAYS)
             if source == "abandoned" else backfill_queue(limit=3000))
    tracks = datos["tracks"][:limit]
    if not tracks:
        raise HTTPException(status_code=400, detail="No hay canciones en la cola.")
    ids = [t["track_id"] for t in tracks]

    nombre = ("Abandonadas — revisar" if source == "abandoned"
              else "Por calificar — lo que más escuchas")
    desc = ("Generada por RateApp. Se reemplaza cada vez que la pides, "
            "así que no la edites a mano.")

    pl_id = database.get_config(BACKFILL_PLAYLIST_KEY + ("_ab" if source == "abandoned" else ""))
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
            database.set_config(
                BACKFILL_PLAYLIST_KEY + ("_ab" if source == "abandoned" else ""), pl_id)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"No se pudo crear la playlist: {e}")

    started = False
    error_play = None
    if play:
        # Mismo patron que play-in-context: Spotify rechaza start_playback con
        # NO_ACTIVE_DEVICE cuando la app esta abierta pero idle.
        ctx = f"spotify:playlist:{pl_id}"
        try:
            sp.shuffle(False)
        except Exception:
            pass
        try:
            sp.start_playback(context_uri=ctx)
            started = True
        except Exception as first:
            dev = _resolve_device_id(sp)
            if dev:
                try:
                    sp.start_playback(device_id=dev, context_uri=ctx)
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


@router.get("/listening/{track_id}")
def listening_for_track(track_id: str):
    """Real listening stats for one track: plays, hours, first and last time.

    One PK lookup. For a list of tracks use database.get_listening_many()
    instead — calling this in a loop is the 40-second mistake documented in
    database.py.
    """
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
    database.upsert_track(tid, req.name, req.artist, req.album, added_at, new_rating)

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
