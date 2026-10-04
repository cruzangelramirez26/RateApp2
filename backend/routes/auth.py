"""Spotify OAuth routes."""
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
import spotipy
import spotify
import database
import config

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
def login():
    """Redirect to Spotify authorization page."""
    am = spotify.get_auth_manager()
    auth_url = am.get_authorize_url()
    return RedirectResponse(auth_url)


@router.get("/callback")
def callback(request: Request):
    """Handle Spotify OAuth callback.

    Dos caminos que comparten el unico redirect URI registrado en Spotify:
    el `state` que empieza con "inv:" es un invitado del mix; lo demas es el
    login de siempre, el del dueño.
    """
    state = request.query_params.get("state") or ""
    if state.startswith(spotify.GUEST_STATE_PREFIX):
        from routes.mix import callback_invitado
        return callback_invitado(request)

    code = request.query_params.get("code")
    if not code:
        return JSONResponse({"error": "No code in callback"}, status_code=400)

    # EL CANDADO. Antes, `am.get_access_token(code)` guardaba el token en el
    # acto, de quien fuera: un amigo que abriera /auth/login sacaba a Angel de
    # su propia app. Ahora se canjea en memoria, se mira de quien es la cuenta
    # y solo se guarda si es la del dueño.
    token = spotify.canjear_code(code, spotify.SCOPE)
    owner = spotify.get_owner_id()
    try:
        quien = spotipy.Spotify(auth=token["access_token"]).current_user()["id"]
    except Exception:
        quien = None
    if owner and quien != owner:
        return HTMLResponse(
            "<meta name=viewport content='width=device-width'>"
            "<body style='font-family:system-ui;background:#121110;color:#f0ede6;padding:32px'>"
            "<h2>Esta no es la cuenta de Rated</h2>"
            "<p>Rated es de una sola cuenta de Spotify. Si te invitaron a un mix, "
            "usa el link de invitación que te mandaron.</p></body>",
            status_code=403)

    spotify.guardar_token_dueno(token)
    if not owner and quien:
        # Primer login de la historia (o la base se vacio): esta cuenta es el dueño.
        database.set_config(spotify.OWNER_KEY, quien)

    # Redirect to frontend
    return RedirectResponse(config.FRONTEND_URL)


@router.get("/status")
def auth_status():
    """Check if Spotify is authenticated."""
    authed = spotify.is_authenticated()
    user_name = None
    if authed:
        try:
            sp = spotify.get_client()
            me = sp.current_user()
            user_name = me.get("display_name", me.get("id"))
            # Siembra el candado del callback con la cuenta que ya esta
            # adentro, antes de que nadie mas pueda intentar loguearse.
            if not database.get_config(spotify.OWNER_KEY) and me.get("id"):
                database.set_config(spotify.OWNER_KEY, me["id"])
        except Exception:
            pass
    return {"authenticated": authed, "user": user_name}


@router.post("/logout")
def logout():
    """Clear the stored Spotify token."""
    spotify.clear_token()
    spotify._client = None
    spotify._auth_manager = None
    return {"ok": True}
