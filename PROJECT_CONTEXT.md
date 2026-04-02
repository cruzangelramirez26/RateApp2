# RateApp — Project Context
> Actualiza este archivo con cada mejora y súbelo a git junto al resto de cambios.

## ¿Qué es?
App web para calificar canciones de Spotify con ratings A+, A, B+, B, C+, C, D.
Las canciones se distribuyen automáticamente a playlists por cuatrimestre.

## Stack
- **Backend:** FastAPI (Python) — `backend/`
- **Frontend:** React + Vite — `frontend/`
- **DB:** TiDB Cloud (MySQL-compatible)
- **Deploy:** Render (se reinicia cada ~15 min en plan free)
- **Repo:** GitHub → auto-deploy en Render al hacer push

## Base de datos — TiDB Cloud
- Host: `gateway01.us-east-1.prod.aws.tidbcloud.com`
- Database: `rateapp`
- Tablas:
  - `tracks` — columnas: `track_id, name, artist, album, added_at, rating, manual_order`
  - `settings` — columnas: `key_name, value_text, updated_at` (creada en v4b)

## Playlists de Spotify (IDs hardcodeados en el backend)
| Nombre   | ID de Spotify              |
|----------|----------------------------|
| `<3333>` | `1kGf7O4l7tWfhWBEMuwyNx`  |
| Perla    | `41CXGh7OcFkplIo6BF44OJ`  |
| Galería '26 | `4BrxCvMSNdQSOEQbRXh7WN` |
| Latte    | `3DltKEaaDVOchGxfIQlPu9`  |
| Miel     | `5pFFpx2dYnfUdOKW4WBN3y`  |

## Flujo principal
1. Canciones llegan a `<3333>`
2. Usuario las califica en tab **Calificar**
3. Al calificar → se guarda en DB + se agrega al cuatrimestre actual (Perla ahorita)
4. B+ o mejor → también a "Mis Me Gusta" y "Galería Anual"
5. D → se elimina de todo

## Cuatrimestre actual
- **Perla** (playlist activa para calificar)
- Otros: Miel, Latte (períodos anteriores)

## Tabs de la app
| Tab | Archivo | Descripción |
|-----|---------|-------------|
| Calificar | `frontend/src/pages/PendingPage.jsx` | Canciones de `<3333>` sin calificar |
| Biblioteca | `frontend/src/pages/LibraryPage.jsx` | Buscar por playlist o canción, editar rating |
| Recientes | `frontend/src/pages/RecentPage.jsx` | Últimas canciones calificadas |
| Dashboard | `frontend/src/pages/StatsPage.jsx` | Stats, modo virtual, A+ instantáneos |

## Archivos clave del backend
| Archivo | Descripción |
|---------|-------------|
| `backend/main.py` | Entry point FastAPI, lifespan, CORS |
| `backend/database.py` | Conexión MySQL, queries, ensure_table |
| `backend/spotify.py` | Cliente Spotipy |
| `backend/routes/tracks.py` | Rate, library, aplus, recent |
| `backend/routes/playlists.py` | Operaciones de playlist |
| `backend/routes/virtual.py` | Modo virtual |
| `backend/routes/auth.py` | OAuth Spotify |
| `backend/utils.py` | Lógica de cuatrimestres |
| `backend/config.py` | Variables de entorno |

## Variables de entorno en Render
```
SPOTIPY_CLIENT_ID
SPOTIPY_CLIENT_SECRET
SPOTIPY_REDIRECT_URI=https://<tu-app>.onrender.com/callback
MYSQL_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
MYSQL_USER=4CCP4ijs5Bk8TUT.root
MYSQL_PASSWORD=...
MYSQL_DATABASE=rateapp
MYSQL_PORT=4000
SECRET_KEY=...
FRONTEND_URL=https://<tu-app>.onrender.com
PORT=8000
```

## Historial de versiones
| Versión | Cambios |
|---------|---------|
| v1 | App Tkinter + Flask mobile (sistema original) |
| v2 | Migración a FastAPI + React, deploy en Render |
| v3 | Fix nombres móvil, A+ siempre activo (en memoria), tab Biblioteca básica |
| v4b | Biblioteca busca por playlist via Spotify API (con portadas), cutoff A+ persistente en DB (tabla `settings`), chips de acceso rápido, 2 órdenes (Spotify / Recientes) |

## Pendientes / Ideas futuras
- [ ] Portadas en tab Recientes
- [ ] Abrir canción en Spotify desde la playlist (deep link)
- [ ] Agregar más playlists a Biblioteca (Marea u otras futuras)
- [ ] Selector de fecha para cutoff A+ en el Dashboard
