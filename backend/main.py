"""FastAPI entry point."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

import config
import database


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.ensure_table()
    database.ensure_settings_table()  # crea tabla settings si no existe
    # Auto-init cutoff A+ si no existe — sobrevive reinicios de Render
    if not database.get_setting('aplus_cutoff'):
        from datetime import datetime, timezone
        database.set_setting('aplus_cutoff', datetime.now(timezone.utc).isoformat())
    yield


app = FastAPI(
    title="RateApp",
    description="Spotify song rating system",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routes.auth import router as auth_router
from routes.tracks import router as tracks_router
from routes.playlists import router as playlists_router
from routes.virtual import router as virtual_router

app.include_router(auth_router)
app.include_router(tracks_router)
app.include_router(playlists_router)
app.include_router(virtual_router)


@app.get("/callback")
def spotify_callback(request: Request):
    """Handle Spotify callback at /callback (matches Spotify Dashboard URI)."""
    from routes.auth import callback
    return callback(request)


@app.get("/health")
def health():
    return {"status": "ok"}


static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
