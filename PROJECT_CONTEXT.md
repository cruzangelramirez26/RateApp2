# RateApp — Project Context
> Actualiza este archivo con cada mejora y súbelo a git junto al resto de cambios.

## ¿Qué es?
App web para calificar canciones de Spotify con ratings A+, A, B+, B, C+, C, D.
Las canciones se distribuyen automáticamente a playlists por cuatrimestre.

## Stack
- **Backend:** FastAPI (Python) — `backend/`
- **Frontend:** React + Vite — `frontend/`
- **DB:** TiDB Cloud (MySQL-compatible)
- **Deploy:** Render (free tier — se duerme por inactividad ~50s de delay)
- **Repo:** GitHub (`cruzangelramirez26/RateApp2`) → auto-deploy en Render al hacer push

## Base de datos — TiDB Cloud
- Host: `gateway01.us-east-1.prod.aws.tidbcloud.com`
- Port: `4000`
- Database: `rateapp`
- Tablas:
  - `tracks` — `track_id, name, artist, album, added_at, rating, manual_order`
  - `settings` — `key_name, value_text, updated_at` (creada en v4c, persiste cutoff A+)

## Playlists de Spotify (IDs hardcodeados en backend/routes/tracks.py)
| Nombre      | ID de Spotify              |
|-------------|----------------------------|
| `<3333>`    | `1kGf7O4l7tWfhWBEMuwyNx`  |
| Perla       | `41CXGh7OcFkplIo6BF44OJ`  |
| Galería '26 | `4BrxCvMSNdQSOEQbRXh7WN`  |
| Latte       | `3DltKEaaDVOchGxfIQlPu9`  |
| Miel        | `5pFFpx2dYnfUdOKW4WBN3y`  |

## Flujo principal
1. Canciones llegan a `<3333>`
2. Usuario las califica en tab **Calificar**
3. Al calificar → se guarda en DB + se agrega al cuatrimestre actual (Perla)
4. B+ o mejor → también a "Mis Me Gusta" y "Galería Anual"
5. D → se elimina de todo

## Cuatrimestre actual
- **Perla** (playlist activa para calificar)
- Anteriores: Miel, Latte

## Tabs de la app
| Tab        | Archivo                                    | Descripción |
|------------|--------------------------------------------|-------------|
| Calificar  | `frontend/src/pages/PendingPage.jsx`       | Canciones de `<3333>` sin calificar |
| Biblioteca | `frontend/src/pages/LibraryPage.jsx`       | Buscar por playlist o canción, editar rating |
| Recientes  | `frontend/src/pages/RecentPage.jsx`        | Últimas canciones calificadas |
| Dashboard  | `frontend/src/pages/StatsPage.jsx`         | Stats, modo virtual, A+ instantáneos |

## Biblioteca — cómo funciona
- Chips de acceso rápido: **Perla · Miel · Latte · Galería · 3333**
- Búsqueda por playlist → llama a Spotify API con el ID real, trae canciones con portadas,
  cruza con DB para mostrar rating actual
- Búsqueda libre → busca por nombre/artista en DB local
- Dos órdenes: **Spotify** (posición en playlist) y **Recientes** (por added_at)

## Archivos clave del backend
| Archivo | Descripción |
|---------|-------------|
| `backend/main.py` | Entry point FastAPI, lifespan, CORS |
| `backend/database.py` | Conexión MySQL pool, `get_conn()` es @contextmanager |
| `backend/spotify.py` | Cliente Spotipy |
| `backend/routes/tracks.py` | Rate, library, aplus, recent, search |
| `backend/routes/playlists.py` | Operaciones de playlist |
| `backend/routes/virtual.py` | Modo virtual |
| `backend/routes/auth.py` | OAuth Spotify |
| `backend/utils.py` | Lógica de cuatrimestres |
| `backend/config.py` | Variables de entorno |

## Nota importante sobre database.py
`get_conn()` es un **context manager** — siempre usar con `with`:
```python
with database.get_conn() as conn:
    cur = conn.cursor(dictionary=True)
    cur.execute(...)
    rows = cur.fetchall()
    cur.close()
# NO llamar conn.close() — el with lo hace automáticamente
```
**Nunca usar** `conn = database.get_conn()` ni `database._get_conn()`.

## Variables de entorno en Render
```
SPOTIPY_CLIENT_ID=3547619262e44831a1eea39de04f1d03
SPOTIPY_CLIENT_SECRET=...
SPOTIPY_REDIRECT_URI=https://rateapp2.onrender.com/callback
MYSQL_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
MYSQL_USER=4CCP4ijs5Bk8TUT.root
MYSQL_PASSWORD=...
MYSQL_DATABASE=rateapp
MYSQL_PORT=4000
SECRET_KEY=...
FRONTEND_URL=https://rateapp2.onrender.com
PORT=8000
```

## Historial de versiones
| Versión | Cambios |
|---------|---------|
| v1 | App Tkinter + Flask mobile (sistema original) |
| v2 | Migración a FastAPI + React, deploy en Render |
| v3 | Fix nombres móvil, A+ siempre activo, tab Biblioteca básica (búsqueda en DB) |
| v4c | Biblioteca busca por playlist via Spotify API (con portadas + chips de acceso rápido), cutoff A+ persistente en tabla `settings` de TiDB, 2 órdenes (Spotify / Recientes) |

## Pendientes / Ideas futuras
- [ ] Portadas en tab Recientes (requiere cachear image_url en DB o lookup a Spotify)
- [ ] Abrir canción en Spotify desde la playlist (deep link en contexto de playlist)
- [ ] Selector de fecha para cutoff A+ en el Dashboard (ahora se cambia por SQL)
- [ ] Agregar más playlists a Biblioteca cuando haya nuevos cuatrimestres
