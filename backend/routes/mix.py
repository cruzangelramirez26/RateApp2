"""El mix entre dos personas (Mejoras.txt seccion 7).

Angel + un invitado (su novia, para empezar). Estilo Blend, decidido por Angel
el 2026-09-27:
  1. primero lo que los DOS escuchan este mes;
  2. luego lo que uno escucha y el otro tiene en Me Gusta;
  3. y el resto, las favoritas de cada quien, una y una.
50 canciones, ventana de un mes, y se rehace sola cada semana
(.github/workflows/mix-semanal.yml).

LAS DOS VENTANAS NO SON LA MISMA COSA, y no se puede evitar:
  - Angel: escuchas REALES de los ultimos 30 dias (`listening_events`).
  - El invitado: `/me/top/tracks` short_term, que Spotify define como
    "~4 semanas" con su propio criterio. De otras personas no hay historial.

El invitado se conecta con un link de invitacion de un solo uso. Su token vive
en `personas` y solo trae scopes de LECTURA: nunca puede tocar una playlist.
La playlist del mix vive en la cuenta de Angel.
"""
import html
import json
import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import spotipy
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

import config
import database
import spotify
import utils

router = APIRouter(prefix="/mix", tags=["mix"])

TAMANO = 50
VENTANA_DIAS = 30
INVITACION_KEY = "mix_invitacion"
INVITACION_HORAS = 72
LIKES_TOPE = 3000

# MINIMO DE ESCUCHAS DEL LADO DE ANGEL, en la ventana. El primer mix real
# (2026-09-27) metio como "tuyas" cinco de Taylor Swift que Angel oyo UNA vez
# con ella el dia anterior: estaban en los Me Gusta de ella y el paso 2 las
# subio por encima de sus favoritas de verdad (15 y 12 escuchas). Su top de 30
# dias eran 200 canciones y 123 tenian 1 o 2 escuchas: ruido, no gusto.
# Decision de Angel: 3 en general, 2 en "los dos la escuchan" (para que se
# queden las que ponen juntos).
MIN_PLAYS_A = 3
MIN_PLAYS_A_COMUN = 2

# CLASICOS (Angel, 2026-09-28): "yo se que me gusta mucho duki y si me
# gustaria que de vez en cuando toque mis canciones favoritas de duki". El mix
# del mes nunca las mete: Duki tiene uNO dOS con 81 escuchas de siempre y casi
# nada en el ultimo anio. Asi que de las 50, 10 son favoritas DE SIEMPRE, 5 de
# cada quien, sorteadas cada semana POR ARTISTA (primero el artista, pesado
# por lo que se le ha escuchado, luego una de sus canciones). Sin marca
# distinta en la UI, decision suya: salen como "tuya" / "suya".
CLASICOS_POR_LADO = 5
CLASICOS_CADA = 5   # una clasica cada 5 posiciones, no amontonadas al final
# "De siempre" = los ultimos 3 anios, no desde 2018. Angel: "mis gustos han
# cambiado mucho". Lo de 2018-2023 (Gera MX, C. Tangana...) ya no lo pone.
CLASICOS_DIAS = 3 * 365


def _pl_key(pid: str) -> str:
    return f"mix_pl:{pid}"


def _ult_key(pid: str) -> str:
    return f"mix_ult:{pid}"


# ─── El algoritmo (puro: sin red ni base, para poder probarlo) ──────────────

def _dedup(top: list) -> list:
    """Quita repetidas por clave, conservando el primer lugar."""
    vistos, salida = set(), []
    for t in top:
        k = t.get("key")
        if not k or k in vistos or not t.get("track_id"):
            continue
        vistos.add(k)
        salida.append(t)
    return salida


def armar_mix(a_top: list, b_top: list, a_likes: dict, b_likes: dict, n: int = TAMANO,
              min_a: int = MIN_PLAYS_A, min_a_comun: int = MIN_PLAYS_A_COMUN) -> list:
    """Arma el mix de A (Angel) y B (el invitado).

    `a_top` / `b_top`: lo mas escuchado de cada quien, EN ORDEN, como dicts
    {key, track_id, name, artist}. `key` es `utils.listening_key`: se cruza por
    nombre+artista y no por track_id, porque Spotify le da ids distintos a la
    misma cancion segun el album o la reedicion (lo que costo ~12,000
    reproducciones el 2026-09-04).
    `a_likes` / `b_likes`: los Me Gusta de cada quien, clave -> track_id.

    Cada cancion sale con `de` = "ambos" | "a" | "b" y el `motivo`.

    Las de A traen `plays` (escuchas en la ventana): piden `min_a_comun` para
    contar como "de los dos" y `min_a` para todo lo demas. Sin `plays` no se
    filtra (las de B no lo traen: Spotify solo da el orden).
    """
    a_top, b_top = _dedup(a_top), _dedup(b_top)
    plays = lambda t: t.get("plays", min_a)
    a_top = [t for t in a_top if plays(t) >= min(min_a, min_a_comun)]
    rank_a = {t["key"]: i for i, t in enumerate(a_top)}
    rank_b = {t["key"]: i for i, t in enumerate(b_top)}
    por_b = {t["key"]: t for t in b_top}

    salida, claves, ids = [], set(), set()
    cuenta = {"a": 0, "b": 0}

    def meter(t, de, motivo, track_id):
        if len(salida) >= n or t["key"] in claves or not track_id or track_id in ids:
            return
        claves.add(t["key"])
        ids.add(track_id)
        if de in cuenta:
            cuenta[de] += 1
        salida.append({"track_id": track_id, "name": t.get("name"), "artist": t.get("artist"),
                       "de": de, "motivo": motivo})

    # 1) Lo que los dos escuchan: primero lo que a los dos les queda mas arriba.
    comun = sorted((t for t in a_top if t["key"] in rank_b and plays(t) >= min_a_comun),
                   key=lambda t: rank_a[t["key"]] + rank_b[t["key"]])
    for t in comun:
        # El id de B viene fresco de la API; el de A puede ser el de un
        # export de 2019.
        meter(t, "ambos", "Los dos la escuchan", por_b[t["key"]]["track_id"])

    def alternar(lista_a, lista_b, motivo_a, motivo_b, id_a):
        """Una y una, empezando por quien lleve menos en el mix: asi el
        reparto sale parejo aunque el paso anterior haya cargado a un lado."""
        ia = ib = 0
        while len(salida) < n and (ia < len(lista_a) or ib < len(lista_b)):
            toca_a = ib >= len(lista_b) or (ia < len(lista_a) and cuenta["a"] <= cuenta["b"])
            if toca_a:
                t = lista_a[ia]; ia += 1
                meter(t, "a", motivo_a, id_a(t))
            else:
                t = lista_b[ib]; ib += 1
                meter(t, "b", motivo_b, t["track_id"])

    # El id de A: el de su Me Gusta si la tiene (es el que Spotify tiene hoy),
    # si no el de su historial.
    id_a = lambda t: a_likes.get(t["key"]) or t["track_id"]

    # De aqui en adelante lo de A pide el minimo general.
    a_top = [t for t in a_top if plays(t) >= min_a]

    # 2) Lo que uno escucha y el otro tiene guardado.
    cruce_a = [t for t in a_top if t["key"] not in rank_b and t["key"] in b_likes]
    cruce_b = [t for t in b_top if t["key"] not in rank_a and t["key"] in a_likes]
    alternar(cruce_a, cruce_b, "Tuya, y está en sus Me Gusta", "Suya, y está en tus Me Gusta", id_a)

    # 3) El resto de las favoritas de cada quien.
    alternar(a_top, b_top, "De tus más escuchadas", "De sus más escuchadas", id_a)
    return salida


def elegir_clasicos(pool: list, n: int, excluir: set, previas: set = frozenset(),
                    rng: Optional[random.Random] = None) -> list:
    """Sortea `n` clasicas de `pool` ({key, track_id, name, artist, peso}).

    Primero el ARTISTA, al azar pero pesado por la suma de pesos de sus
    canciones (Duki con cinco canciones de ~80 sale mas que alguien con una de
    20); luego una de sus canciones, pesada igual. Un artista por sorteo, para
    que no salgan cinco de Nsqk. `excluir` = lo que ya esta en el mix;
    `previas` = las clasicas de la semana pasada, que solo se repiten si no
    queda otra.
    """
    rng = rng or random.Random()
    for evitar in (excluir | set(previas), excluir):
        por_artista = {}
        for t in pool:
            if not t.get("key") or not t.get("track_id") or t["key"] in evitar or t.get("peso", 0) <= 0:
                continue
            por_artista.setdefault(utils.norm_text(t.get("artist") or ""), []).append(t)
        if por_artista:
            break
    salida = []
    while len(salida) < n and por_artista:
        artistas = list(por_artista)
        pesos = [sum(t["peso"] for t in por_artista[a]) for a in artistas]
        a = rng.choices(artistas, weights=pesos)[0]
        canciones = por_artista.pop(a)
        salida.append(rng.choices(canciones, weights=[t["peso"] for t in canciones])[0])
    return salida


def intercalar(base: list, clasicas: list, cada: int = CLASICOS_CADA, n: int = TAMANO) -> list:
    """Mete una clasica cada `cada` posiciones (la 5, la 10...) y corta en `n`."""
    base = list(base[: max(0, n - len(clasicas))])
    for i, c in enumerate(clasicas):
        base.insert(min(len(base), (i + 1) * cada - 1), c)
    return base[:n]


# ─── Los datos de cada quien ────────────────────────────────────────────────

def _top_dueno() -> list:
    filas = database.get_top_window(VENTANA_DIAS, 200)
    return [{"key": f["match_key"], "track_id": f["track_id"], "name": f["name"], "artist": f["artist"],
             "plays": f.get("plays", 0)}
            for f in filas if f.get("match_key") and f.get("track_id")]


def _clasicos_dueno() -> list:
    """Lo mas escuchado de los ultimos 3 anios (CLASICOS_DIAS), peso = escuchas."""
    filas = database.get_top_window(CLASICOS_DIAS, 400)
    return [{"key": f["match_key"], "track_id": f["track_id"], "name": f["name"], "artist": f["artist"],
             "peso": f.get("plays", 0)}
            for f in filas if f.get("match_key") and f.get("track_id")]


def _clasicos_invitado(sp) -> list:
    """Sus favoritas de siempre y de ~6 meses (mismo permiso user-top-read).
    Spotify no da escuchas, solo el orden: el peso es el lugar al reves."""
    vistas = {}
    for rango in ("long_term", "medium_term"):
        try:
            top = _top_invitado(sp, rango)
        except spotipy.SpotifyException:
            continue
        for i, t in enumerate(top):
            peso = len(top) - i
            if t["key"] not in vistas or vistas[t["key"]]["peso"] < peso:
                vistas[t["key"]] = {**t, "peso": peso}
    return list(vistas.values())


def _top_invitado(sp, rango: str = "short_term") -> list:
    """/me/top/tracks. Spotify da hasta ~99 en dos paginas."""
    salida = []
    for offset in (0, 49):
        try:
            r = sp.current_user_top_tracks(limit=50, offset=offset, time_range=rango)
        except spotipy.SpotifyException:
            if offset == 0:
                raise
            break
        items = (r or {}).get("items") or []
        for t in items:
            if not t or not t.get("id"):
                continue
            artista = ((t.get("artists") or [{}])[0] or {}).get("name", "")
            salida.append({"key": utils.listening_key(t.get("name", ""), artista),
                           "track_id": t["id"], "name": t.get("name"), "artist": artista})
        if len(items) < 50:
            break
    return salida


def _likes(sp) -> dict:
    tracks = spotify.get_all_liked_tracks(sp, limit=LIKES_TOPE)
    return {utils.listening_key(t["name"], t["artist"]): t["id"] for t in tracks if t.get("id")}


def _mensaje_spotify(e: Exception, nombre: str) -> str:
    status = getattr(e, "http_status", None)
    if status == 403:
        return (f"Spotify no deja leer la cuenta de {nombre}. La app está en modo "
                "desarrollo: agrégala en el dashboard de Spotify (User Management) "
                "con el correo de su cuenta.")
    if status == 401 or "ya no sirve" in str(e):
        return f"La conexión de {nombre} caducó: mándale otra invitación."
    return f"Spotify falló leyendo a {nombre}: {e}"


def rehacer(pid: str, nombre: str) -> dict:
    """Arma el mix con una persona y lo escribe en la playlist de Angel."""
    sp = spotify.get_client()
    try:
        sp_b = spotify.get_guest_client(pid)
        b_top = _top_invitado(sp_b)
        b_likes = _likes(sp_b)
        b_clasicos = _clasicos_invitado(sp_b)
    except Exception as e:
        raise RuntimeError(_mensaje_spotify(e, nombre)) from e

    a_top = _top_dueno()
    a_likes = _likes(sp)
    items = armar_mix(a_top, b_top, a_likes, b_likes)

    # Los clasicos: 5 y 5, sin repetir lo que ya trae el mix ni (si se puede)
    # los de la semana pasada.
    try:
        previas = set((json.loads(database.get_config(_ult_key(pid)) or "{}") or {}).get("clasicos") or [])
    except ValueError:
        previas = set()
    en_mix = {utils.listening_key(t.get("name") or "", t.get("artist") or "") for t in items}
    rng = random.Random()
    mias = elegir_clasicos(_clasicos_dueno(), CLASICOS_POR_LADO, en_mix, previas, rng)
    en_mix |= {t["key"] for t in mias}
    suyas = elegir_clasicos(b_clasicos, CLASICOS_POR_LADO, en_mix, previas, rng)
    clasicas = []
    for i in range(max(len(mias), len(suyas))):
        for t, de in ((mias[i] if i < len(mias) else None, "a"), (suyas[i] if i < len(suyas) else None, "b")):
            if t:
                tid = (a_likes.get(t["key"]) or t["track_id"]) if de == "a" else t["track_id"]
                clasicas.append({"track_id": tid, "name": t.get("name"), "artist": t.get("artist"),
                                 "de": de, "motivo": "De sus favoritas de siempre" if de == "b"
                                 else "De tus favoritas de siempre", "key": t["key"]})
    items = intercalar(items, clasicas)
    # Dos ids iguales (reedicion) no deben entrar dos veces.
    vistos, limpio = set(), []
    for t in items:
        if t["track_id"] not in vistos:
            vistos.add(t["track_id"]); limpio.append(t)
    items = limpio
    if not items:
        raise RuntimeError("No salió ninguna canción: ¿alguno de los dos no ha escuchado nada este mes?")

    ids = [t["track_id"] for t in items]
    pl_id = database.get_config(_pl_key(pid))
    if pl_id:
        # Se reutiliza siempre la misma; si la borraron desde Spotify, se recrea.
        try:
            spotify.replace_playlist(sp, pl_id, ids)
        except Exception:
            pl_id = None
    if pl_id:
        # COLABORATIVA (Angel, 2026-09-27), y se asegura en cada vuelta: asi
        # la que ya existia se convierte sola. Spotify exige privada para
        # poder ser colaborativa.
        try:
            sp.playlist_change_details(pl_id, public=False, collaborative=True)
        except Exception as e:
            print(f"[mix] no se pudo hacer colaborativa {pl_id}: {e}")
    if not pl_id:
        me = sp.current_user()
        yo = (me.get("display_name") or "Yo").split(" ")[0]
        nueva = sp.user_playlist_create(
            me["id"], f"{yo} + {nombre}", public=False, collaborative=True,
            description="Mix de Rated: lo que los dos escuchan este mes. Se rehace cada semana.")
        pl_id = nueva["id"]
        spotify.replace_playlist(sp, pl_id, ids)
        database.set_config(_pl_key(pid), pl_id)

    resumen = {
        "fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "playlist_id": pl_id,
        "spotify_url": f"https://open.spotify.com/playlist/{pl_id}",
        "total": len(items),
        "ambos": sum(1 for t in items if t["de"] == "ambos"),
        "tuyas": sum(1 for t in items if t["de"] == "a"),
        "suyas": sum(1 for t in items if t["de"] == "b"),
        "clasicos": [t.pop("key") for t in items if "key" in t],
        "fuente": {"tu_top": len(a_top), "su_top": len(b_top),
                   "tus_likes": len(a_likes), "sus_likes": len(b_likes)},
        "items": items,
    }
    database.set_config(_ult_key(pid), json.dumps(resumen, ensure_ascii=False))
    return resumen


# ─── La invitacion ──────────────────────────────────────────────────────────

def _invitacion_vigente() -> Optional[dict]:
    raw = database.get_config(INVITACION_KEY)
    if not raw:
        return None
    try:
        inv = json.loads(raw)
        if datetime.fromisoformat(inv["expira"]) < datetime.now(timezone.utc):
            return None
        return inv
    except (ValueError, KeyError, TypeError):
        return None


def _url_invitacion(token: str) -> str:
    return config.FRONTEND_URL.rstrip("/") + "/mix/unirme?i=" + token


def _pagina(titulo: str, texto: str, status: int = 200) -> HTMLResponse:
    """Lo que ve el invitado. A proposito NO es la app: no tiene nada que
    hacer dentro de la biblioteca de Angel."""
    return HTMLResponse(
        "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
        "<title>Rated · mix</title>"
        "<body style=\"margin:0;min-height:100vh;display:grid;place-items:center;"
        "background:#121110;color:#f0ede6;font-family:system-ui,sans-serif\">"
        "<main style='max-width:420px;padding:32px 24px'>"
        "<div style='font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.55'>Rated · mix</div>"
        f"<h1 style='font-weight:600;font-size:28px;margin:12px 0'>{html.escape(titulo)}</h1>"
        f"<p style='line-height:1.55;opacity:.8'>{html.escape(texto)}</p></main></body>",
        status_code=status)


@router.post("/invitacion")
def crear_invitacion():
    """Un link de un solo uso que vale 72 h. Crear otro invalida el anterior."""
    token = secrets.token_urlsafe(12)
    expira = datetime.now(timezone.utc) + timedelta(hours=INVITACION_HORAS)
    database.set_config(INVITACION_KEY, json.dumps({"token": token, "expira": expira.isoformat()}))
    return {"url": _url_invitacion(token), "expira": expira.isoformat()}


@router.get("/unirme")
def unirme(i: str = ""):
    inv = _invitacion_vigente()
    if not inv or not secrets.compare_digest(inv["token"], i or ""):
        return _pagina("Este link ya no sirve",
                       "Las invitaciones son de un solo uso y duran 3 días. Pide uno nuevo.", 410)
    return RedirectResponse(spotify.url_login_invitado(inv["token"]))


def callback_invitado(request: Request):
    """La llama /callback cuando el `state` es de invitado."""
    q = request.query_params
    if q.get("error"):
        return _pagina("No se conectó", "Cancelaste el permiso en Spotify. Puedes volver a abrir el link.")
    inv = _invitacion_vigente()
    token_inv = (q.get("state") or "")[len(spotify.GUEST_STATE_PREFIX):]
    if not inv or not secrets.compare_digest(inv["token"], token_inv):
        return _pagina("Este link ya no sirve",
                       "Las invitaciones son de un solo uso y duran 3 días. Pide uno nuevo.", 410)
    code = q.get("code")
    if not code:
        return _pagina("No se conectó", "Spotify no mandó el permiso. Vuelve a abrir el link.", 400)

    token = spotify.canjear_code(code, spotify.GUEST_SCOPE)
    try:
        me = spotipy.Spotify(auth=token["access_token"]).current_user()
    except spotipy.SpotifyException as e:
        if getattr(e, "http_status", None) == 403:
            return _pagina("Falta un paso",
                           "La app todavía está en modo de pruebas de Spotify y hay que agregar "
                           "tu correo de Spotify. Avísale a quien te invitó y vuelve a abrir el link.", 403)
        raise

    if me["id"] == spotify.get_owner_id():
        # Tipico: abrir el link en el celular de Angel, con su sesion puesta.
        return _pagina("Esa es la cuenta de quien te invitó",
                       "Abre el link con tu propia cuenta de Spotify: desde tu celular, "
                       "o cierra sesión en Spotify antes de abrirlo.", 409)

    nombre = me.get("display_name") or me["id"]
    database.upsert_persona(me["id"], nombre, json.dumps(token))
    database.delete_config(INVITACION_KEY)   # un solo uso
    return _pagina(f"Listo, {nombre}",
                   "Ya estás en el mix. La playlist se arma con lo que los dos escuchan "
                   "y se actualiza cada semana. Puedes cerrar esta pestaña.")


# ─── Para la tarjeta de Herramientas y el cron ──────────────────────────────

@router.get("/estado")
def estado():
    personas = database.get_personas()
    for p in personas:
        raw = database.get_config(_ult_key(p["id"]))
        try:
            p["mix"] = json.loads(raw) if raw else None
        except ValueError:
            p["mix"] = None
    inv = _invitacion_vigente()
    return {
        "personas": personas,
        "invitacion": {"url": _url_invitacion(inv["token"]), "expira": inv["expira"]} if inv else None,
        "ventana_dias": VENTANA_DIAS,
        "tamano": TAMANO,
    }


@router.post("/rehacer")
def rehacer_mix(persona: Optional[str] = Query(None)):
    """Sin `persona` rehace el de todos (es lo que llama el cron semanal)."""
    personas = database.get_personas()
    if persona:
        personas = [p for p in personas if p["id"] == persona]
        if not personas:
            raise HTTPException(status_code=404, detail="Esa persona no está conectada.")
    if not personas:
        return {"ok": True, "resultados": []}

    resultados = []
    for p in personas:
        try:
            r = rehacer(p["id"], p["nombre"])
            resultados.append({"id": p["id"], "ok": True, "mix": r})
        except Exception as e:
            print(f"[mix] fallo con {p['id']}: {e}")
            resultados.append({"id": p["id"], "ok": False, "error": str(e)})

    if all(not r["ok"] for r in resultados):
        # 502 para que el cron marque rojo; la UI lee el detalle.
        raise HTTPException(status_code=502, detail=resultados[0]["error"])
    return {"ok": True, "resultados": resultados}


@router.post("/reproducir")
def reproducir(persona: str = Query(...)):
    from routes.tracks import _reproducir
    pl_id = database.get_config(_pl_key(persona))
    if not pl_id:
        raise HTTPException(status_code=404, detail="Todavía no hay mix: ármalo primero.")
    sp = spotify.get_client()
    ctx = f"spotify:playlist:{pl_id}"
    try:
        sp.shuffle(False)
    except Exception:
        pass
    # offset explicito: Spotify recuerda la posicion en un contexto reutilizado
    # (el bug de la cola de backfill del 2026-09-04).
    error = _reproducir(sp, lambda device_id=None: sp.start_playback(
        device_id=device_id, context_uri=ctx, offset={"position": 0}))
    return {"ok": True, "playing": error is None, "error": error,
            "spotify_url": f"https://open.spotify.com/playlist/{pl_id}"}


@router.delete("/personas/{pid}")
def desconectar(pid: str):
    """Olvida a la persona y su token. La playlist se queda en Spotify (y si
    se vuelve a conectar, se reutiliza)."""
    database.delete_persona(pid)
    database.delete_config(_ult_key(pid))
    return {"ok": True}
