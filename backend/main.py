"""FastAPI entry point."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from contextlib import asynccontextmanager
import os

import config
import database


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.ensure_table()
    database.ensure_config_table()
    database.ensure_listening_table()
    yield


app = FastAPI(
    title="RateApp",
    description="Spotify song rating system",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173"],
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


class SPAStaticFiles(StaticFiles):
    """StaticFiles con fallback a index.html para las rutas del BrowserRouter.

    StaticFiles(html=True) sirve index.html solo para "/" y para carpetas que
    existan en disco, asi que refrescar en /recent caia al 404 de FastAPI aunque
    React si sepa resolver esa ruta del lado del cliente.

    El fallback aplica solo a paths sin extension de archivo. Sin esa condicion,
    un /assets/foo.js inexistente devolveria index.html con status 200 y el error
    real (un asset que no se copio al build) quedaria escondido detras de un
    "Unexpected token '<'" en la consola del navegador.

    Solo se atrapa el 404: los 405 que StaticFiles levanta para metodos que no
    son GET/HEAD siguen saliendo tal cual.
    """

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not os.path.splitext(path)[1]:
                return await super().get_response("index.html", scope)
            raise


# Va al final a proposito: los routers se registran antes, y Starlette resuelve
# en orden de registro, asi que /tracks/... gana contra este catch-all.
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="static")
