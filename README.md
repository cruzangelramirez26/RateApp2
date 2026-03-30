# 🎵 RateApp — Song Rating System

A modern web app to rate your Spotify songs, distribute them across playlists by "cuatrimestre" (4-month periods), and keep everything organized automatically.

## Architecture

```
rateapp/
├── backend/          # FastAPI (Python)
│   ├── main.py       # Entry point + CORS
│   ├── config.py     # Environment variables
│   ├── database.py   # MySQL connection + queries
│   ├── spotify.py    # Spotipy wrapper
│   ├── models.py     # Pydantic schemas
│   ├── routes/
│   │   ├── auth.py       # Spotify OAuth flow
│   │   ├── tracks.py     # Rate, edit, list tracks
│   │   ├── playlists.py  # Playlist operations
│   │   └── virtual.py    # Virtual edit mode
│   └── utils.py      # Cuatrimestre logic, helpers
│
├── frontend/         # React (Vite)
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Route pages
│   │   ├── hooks/        # Custom React hooks
│   │   ├── utils/        # Client helpers
│   │   └── styles/       # Global CSS
│   └── index.html
│
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Setup

### 1. Environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### 2. Install & run (development)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### 3. Deploy to Railway/Render

The project includes a `Dockerfile` that builds both frontend and backend into a single container. Just connect your repo and set the environment variables.

## Features

- **Rate songs** with A+, A, B+, B, C+, C, D scale
- **Auto-distribute** to cuatrimestre playlists (Perla, Miel, Latte)
- **Smart ordering** by rating → date within each playlist
- **Virtual edit mode** — drag songs in Spotify, detect rating changes
- **A+ instant detection** from Spotify liked songs
- **Cross-playlist sync** (Mis Me Gusta, Galería Anual)
- **Works everywhere** — phone, tablet, desktop
- **PWA-ready** — installable as app on mobile
