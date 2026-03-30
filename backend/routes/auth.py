"""Spotify OAuth routes."""
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse
import spotify
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
    """Handle Spotify OAuth callback."""
    code = request.query_params.get("code")
    if not code:
        return JSONResponse({"error": "No code in callback"}, status_code=400)

    am = spotify.get_auth_manager()
    am.get_access_token(code)

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
        except Exception:
            pass
    return {"authenticated": authed, "user": user_name}


@router.post("/logout")
def logout():
    """Clear Spotify token cache."""
    import os
    try:
        os.remove(".spotify_cache")
    except FileNotFoundError:
        pass
    spotify._client = None
    spotify._auth_manager = None
    return {"ok": True}
