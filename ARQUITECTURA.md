# RateApp — Arquitectura

> Documento de referencia técnica. Última revisión: **2026-08-20**, contra el código en `main` (commit `cd1d37d`).
> El *changelog* de sesiones vive en [`CLAUDE_LOG.md`](CLAUDE_LOG.md); el backlog en [`Mejoras.txt`](Mejoras.txt).

---

## 1. Qué es

Una app de un solo usuario (Angel) para calificar canciones de Spotify con una escala de 7 niveles y **distribuirlas automáticamente** a playlists por período de 4 meses ("cuatrimestres"). El valor no está en calificar: está en que una sola calificación mueve la canción en 4 lugares distintos de Spotify sin intervención manual.

```
┌──────────────┐   califico A+   ┌───────────────────────────────────┐
│  RateApp UI  │ ──────────────► │ 1. Playlist del cuatrimestre      │
└──────────────┘                 │ 2. Playlist "Mis Me Gusta" (MMG)  │
                                 │ 3. Playlist "Galería Anual"       │
                                 │ 4. Me Gusta nativo (♥ de Spotify) │
                                 │ + reordena las playlists tocadas  │
                                 │ + guarda la nota en MySQL         │
                                 └───────────────────────────────────┘
```

---

## 2. Vista de 10,000 pies

```
                    ┌────────────────────────────────────────┐
                    │  Navegador / PWA  (React 18 + Vite)    │
                    │  fetch() a rutas relativas             │
                    └───────────────┬────────────────────────┘
                                    │ mismo origen en prod
                                    │ proxy de Vite en dev
                    ┌───────────────▼────────────────────────┐
                    │  Contenedor único en RENDER            │
                    │  ┌──────────────────────────────────┐  │
                    │  │ FastAPI (uvicorn, puerto $PORT)  │  │
                    │  │  /auth  /tracks  /playlists      │  │
                    │  │  /virtual  /health               │  │
                    │  │  + StaticFiles("/") ← build React│  │
                    │  └──────┬────────────────┬──────────┘  │
                    └─────────┼────────────────┼─────────────┘
                              │                │
                   ┌──────────▼───────┐ ┌──────▼───────────────┐
                   │  TiDB Cloud      │ │  Spotify Web API     │
                   │  (MySQL 8.0)     │ │  (vía spotipy)       │
                   │  tablas:         │ │  OAuth Authorization │
                   │   tracks, config │ │  Code + refresh      │
                   └──────────────────┘ └──────────────────────┘
```

**Un solo contenedor sirve todo.** El `Dockerfile` es multi-stage: compila el frontend con Node 20, copia el `dist/` resultante a `backend/static/`, y FastAPI lo monta en `/` con `StaticFiles(html=True)`. No hay CDN, no hay servidor web separado, no hay build de frontend en runtime.

---

## 3. Stack y versiones

| Capa | Tecnología | Versión fijada en |
|---|---|---|
| Frontend | React 18.3 + React Router 6.26 + Vite 5.4 + lucide-react | `frontend/package.json` |
| Estilos | CSS puro con custom properties (**sin** Tailwind, sin shadcn, sin CSS-in-JS) | `frontend/src/styles/global.css` |
| Backend | FastAPI 0.115 + uvicorn 0.30 + Pydantic 2.9 | `backend/requirements.txt` |
| Spotify | spotipy 2.23 | idem |
| Datos | mysql-connector-python 9.0 + pandas 2.2 | idem |
| Runtime | Python 3.12-slim (imagen), Node 20-slim (build) | `Dockerfile` |
| Hosting | Render (Docker, plan free) conectado a GitHub `cruzangelramirez26/RateApp2` rama `main` | — |

**pandas dentro de un backend web** es una decisión inusual pero deliberada: casi toda la lógica de ordenamiento y de estadísticas trabaja con `DataFrame`s cargados de golpe con `database.load_all()`. Funciona porque la tabla es de cientos/miles de filas, no millones. Es el techo de escalabilidad más obvio del diseño, y es un techo aceptable para un usuario.

---

## 4. Árbol de archivos

```
RateApp/
├── Dockerfile              # multi-stage: node build → python runtime
├── docker-compose.yml      # solo para correr local
├── railway.json            # vestigio de Railway; hoy se despliega en Render
├── .env.example            # plantilla de variables (¡ver nota en §9!)
│
├── backend/
│   ├── main.py             # app FastAPI, CORS, routers, /health, StaticFiles
│   ├── config.py           # TODA la configuración y las constantes del dominio
│   ├── database.py         # pool MySQL + todas las queries + migraciones
│   ├── spotify.py          # wrapper de spotipy: OAuth + operaciones de playlist
│   ├── models.py           # esquemas Pydantic de request/response
│   ├── utils.py            # cuatrimestres, fechas, chunking, dedupe
│   └── routes/
│       ├── auth.py         # OAuth: /login /callback /status /logout
│       ├── tracks.py       # el corazón: rate, pending, player, stats, A+, migración
│       ├── playlists.py    # listar, ordenar, reconstruir
│       └── virtual.py      # Modo Virtual + reordenador drag & drop
│
└── frontend/
    ├── index.html          # + manifest PWA, theme-color
    ├── vite.config.js      # proxy de dev a localhost:8000
    ├── public/
    │   ├── manifest.json   # PWA
    │   └── portadas/       # imágenes de cada cuatrimestre por año
    └── src/
        ├── App.jsx         # auth gate + router + preload de caches
        ├── components/     # NavBar (sidebar+tabbar+PiP), ThemeToggle, TrackCard,
        │                   #   RatingButtons, SearchBar, LoadingSkeleton
        ├── pages/          # Pending, Library, Recent, Stats, Tools, Login
        ├── hooks/useToast.jsx   # toasts
        ├── hooks/useTheme.jsx   # ThemeProvider + useTheme()
        ├── utils/api.js         # cliente HTTP único
        ├── utils/preloadCache.js# cache de sesión en memoria
        ├── utils/theme.js       # tokens del tema, helpers de rating, CSS para el PiP
        └── styles/global.css    # design system completo (~1400 líneas)
```

---

## 5. El modelo de dominio

Todo el vocabulario del negocio está en `backend/config.py` y `backend/utils.py`.

### 5.1 Escala de calificación

```python
RATING_ORDER = {"D": 0, "C": 1, "C+": 2, "B": 3, "B+": 4, "A": 5, "A+": 6}
TOP_SET      = {"B+", "A", "A+"}   # el umbral que dispara la distribución
```

`TOP_SET` es **el** concepto central: una canción en TOP_SET va a MMG + Galería Anual + Me Gusta nativo. Todo lo demás no.

### 5.2 Cuatrimestres

| Nombre | Meses | Playlist |
|---|---|---|
| `perla` | ene–abr | `PL_PERLA` |
| `miel` | may–ago | `PL_MIEL` |
| `latte` | sep–dic | `PL_LATTE` |

Los nombres cambian por año (2025 fueron Savia / Lirio / Marea) — eso vive **solo en el frontend**, en `StatsPage.jsx`. El backend siempre habla de perla/miel/latte.

`CUATRIMESTRE_PREV` en `utils.py` define el ciclo para la migración: `miel ← perla`, `latte ← miel`, y `perla` no tiene anterior.

### 5.3 Playlists fijas

Todos los IDs son hardcoded con default en `config.py` y sobreescribibles por variable de entorno:

| Clave | Env var | Para qué |
|---|---|---|
| `CALIFICAR_PLAYLIST_ID` | `CALIFICAR_PLAYLIST_ID` | La bandeja de entrada: `<3333`. De aquí sale el feed de Pending |
| `perla` / `miel` / `latte` | `PL_PERLA` / `PL_MIEL` / `PL_LATTE` | Cuatrimestres |
| `mis_me_gusta` | `PL_MMG` | Playlist propia "Mis Me Gusta" — **no** es el ♥ nativo |
| `anual` | `PL_ANUAL` | Galería Anual: todo el TOP_SET del año |
| `marea_archivo` | `PL_MAREA_ARCHIVO` | Archivo histórico |

### 5.4 La distinción que rige todo: actual vs. histórica

Una canción pertenece al **cuatrimestre actual** si:

- su `added_at` cae en el rango de meses **y el año** del cuatrimestre corriente, **o**
- su `cuatrimestre_override` es igual al cuatrimestre corriente.

Si no cumple ninguna de las dos, es **histórica**. La consecuencia práctica: **las playlists de cuatrimestres pasados son intocables**. Re-calificar una canción vieja nunca modifica la Perla de hace ocho meses; solo toca MMG, Galería Anual, el cuatrimestre actual y el ♥ nativo. Cuando una canción histórica sube a TOP_SET, entra a la playlist del cuatrimestre actual y se le escribe `cuatrimestre_override` para que los *rebuilds* futuros la sigan incluyendo ahí.

> ⚠️ **Regla que ya se rompió dos veces:** toda query que construya una playlist **debe filtrar por año actual**. Sin ese filtro se llenan las playlists con canciones de años anteriores. Aplica a `rebuild_anual`, `rebuild_playlist` y `get_migration_candidates`.

---

## 6. Base de datos

**TiDB Cloud Serverless** (free tier, región `us-east-1`), hablado por protocolo MySQL 8.0. Dos tablas, creadas y migradas en el `lifespan` de FastAPI (`database.ensure_table()` + `ensure_config_table()`). No hay Alembic ni ORM: las migraciones son `information_schema` + `ALTER TABLE` a mano.

### `tracks`

| Columna | Tipo | Nota |
|---|---|---|
| `track_id` | VARCHAR(64) PK | ID de Spotify |
| `name`, `artist`, `album` | VARCHAR(512) | |
| `added_at` | DATETIME NULL | **Fecha de la primera calificación.** Nunca se pisa al re-calificar: `upsert_track` la escribe solo en el INSERT |
| `rating` | VARCHAR(8) | `''` = sin calificar |
| `manual_order` | INT | reservado |
| `cuatrimestre_override` | VARCHAR(10) NULL | agregado por migración; ver §5.4 |

### `config`

Un simple `key`/`value` de texto. Es la respuesta a un problema concreto: **el filesystem de Render es efímero**. Todo lo que antes vivía en archivos JSON (`a_plus_cutoff.json`, `cuatri_virtual_state.json`) desaparecía en cada redeploy, así que se movió aquí. Llaves en uso:

- `aplus_cutoff` — el corte del flujo A+ Instantáneo
- el estado del Modo Virtual (serializado)

**Corolario de arquitectura: nada que deba sobrevivir un reinicio puede escribirse a disco.** La única excepción tolerada es `.spotify_cache`, y precisamente por eso hay que re-autenticar después de cada deploy.

### Acceso

`pooling.MySQLConnectionPool(pool_size=5, use_pure=True, autocommit=False)`, expuesto por el context manager `get_conn()`. `load_all()` devuelve la tabla completa como DataFrame y es la base de casi toda la lógica.

Tres cosas que conviene saber del proveedor:

- **Es compatible con MySQL, no es MySQL.** Las migraciones por `information_schema` funcionan, pero no conviene apoyarse en comportamientos exóticos del motor.
- **Exige TLS.** Nunca hubo que configurarlo porque `mysql-connector-python` lo negocia por default; si alguien pusiera `ssl_disabled`, la conexión se cae.
- **La región importa más de lo que parece.** La DB está en `us-east-1` (Virginia). Como `load_all()` jala la tabla completa en casi cada operación, si el web service de Render vive en otra región cada query cruza el continente y la latencia se multiplica por el número de queries. Vale la pena confirmar la región del servicio en Render y, si no coincide, recrearlo en Virginia. Es probablemente la mejora de rendimiento más barata disponible.

---

## 7. Integración con Spotify

### 7.1 OAuth

`SpotifyOAuth` de spotipy con `cache_path=".spotify_cache"` y `open_browser=False`. Flujo: `GET /auth/login` redirige a Spotify → Spotify regresa a `/callback` (registrado así en el Dashboard de Spotify, por eso `main.py` expone `/callback` además del `/auth/callback` del router) → se intercambia el code → redirige a `FRONTEND_URL`. `get_client()` refresca el token si está vencido. `POST /auth/logout` borra el archivo de cache y resetea los singletons.

### 7.2 Scopes vigentes

```
playlist-read-private playlist-modify-public playlist-modify-private
user-library-read user-library-modify user-read-currently-playing
user-modify-playback-state user-read-playback-state
user-read-recently-played
```

Agregar un scope obliga a re-autenticar. **En este proyecto eso es gratis**: como `.spotify_cache` se borra en cada redeploy, Angel re-autentica de todos modos.

### 7.3 Peculiaridades que el wrapper resuelve

- **Paginación**: `get_playlist_tracks` y `get_all_liked_tracks` iteran con `sp.next()` hasta agotar.
- **Límite de 100 por request**: `add_to_playlist`, `remove_from_playlist`, `replace_playlist`, `save_tracks` y `unsave_tracks` parten en chunks con `utils.chunk_list`.
- **`are_tracks_saved` antes de `save_tracks`**: dar ♥ a algo ya likeado lo *reposiciona* al tope de Me Gusta. Se verifica antes para no alterar el orden histórico. (Este bug ya se corrigió una vez — el indexado tenía que ser por `tid`, no por `0`.)
- **`NO_ACTIVE_DEVICE`**: Spotify rechaza `start_playback` si la app está abierta pero idle. `_resolve_device_id()` lista dispositivos, prefiere el activo o toma el primero, y reintenta con `device_id` explícito.

### 7.4 Me Gusta nativo ≠ playlist MMG

Dos cosas distintas que es fácil confundir:

- **Me Gusta nativo** = el ♥ real de Spotify. Se maneja con `save_tracks` / `unsave_tracks` / `are_tracks_saved`.
- **Playlist MMG** = una playlist propia llamada "Mis Me Gusta", entrada de `DISTRIBUTION_PLAYLISTS`. Se maneja como cualquier otra playlist.

Ambas se sincronizan con TOP_SET, pero por caminos de API completamente diferentes.

---

## 8. Los flujos que importan

### 8.1 `POST /tracks/rate` — el corazón de la app

Es la función más consecuente del sistema ([`tracks.py:325`](backend/routes/tracks.py)). Secuencia:

1. Lee el estado anterior (`old_track`, `old_rating`) — importa porque varias ramas dependen de *de dónde viene* la canción, no solo de a dónde va.
2. `upsert_track(...)` — la nota siempre se guarda, pase lo que pase después.
3. Si `soft=true` → **corta aquí**. Ver §8.2.
4. Bifurca por la nota nueva:

| Nota nueva | Qué hace |
|---|---|
| `D` | Saca de cuatrimestre + MMG + Anual, quita el ♥. Fin. |
| `B+` / `A` / `A+` (TOP_SET) | Agrega al cuatrimestre actual; si la canción era histórica le pone `cuatrimestre_override`; agrega a MMG y Anual; da ♥ solo si no lo tenía |
| `B` / `C+` | Si venía de TOP_SET, la saca de MMG + Anual y quita el ♥. Luego, si la canción es del cuatrimestre actual, la agrega a esa playlist |
| `C` | Si venía de TOP_SET, sale de MMG + Anual y pierde el ♥. Además **se elimina del cuatrimestre** |

5. Reordena: siempre el cuatrimestre actual con `min_rating_order=2` (deja fuera C y D), y la Galería Anual cuando la nota nueva o la vieja tocaba TOP_SET.

Cada llamada a Spotify va envuelta en `try/except: pass`. Es deliberado —una playlist que falla no debe tumbar la calificación— pero significa que **los fallos parciales son silenciosos**. Cuando algo se ve inconsistente, la salida son los endpoints de *rebuild*.

> 📌 **Discrepancia detectada al escribir este documento:** la tabla de `CLAUDE.md` dice que con `B`/`C+`/`C` la canción "se queda en cuatri". El código no hace eso: `C` se **elimina** del cuatrimestre (`tracks.py`, rama del `else`), y `B`/`C+` se **agregan** si la canción es del cuatrimestre actual. Además el reorden con `min_rating_order=2` expulsaría a las `C` de todos modos. Manda el código; `CLAUDE.md` está desactualizado en esa fila.

### 8.2 Modo *soft*

`POST /tracks/rate?soft=true` guarda en la DB y no toca Spotify. Se usa cuando se califica desde la vista "Me Gusta" de Biblioteca: ahí la intención es *anotar* una nota, no distribuir la canción.

### 8.3 Reordenamiento (`_order_playlist`)

Criterio: `rating DESC`, luego `added_at DESC`. Excluye `D` siempre, y con `min_rating_order` se puede subir el piso. Las canciones sin calificar van al final. Termina con `replace_playlist` — es decir, **reescribe la playlist completa**, no hace movimientos incrementales.

Dos bugs históricos que dejaron cicatriz en el código: filtrar con `!= "D"` fallaba porque los NULL de MySQL llegan como el string `"nan"` en el DataFrame; la solución fue filtrar por `rating_order`, que descarta D y NULL de forma robusta.

### 8.4 Pending (`GET /tracks/pending`)

Lee la playlist `<3333` respetando su orden de Spotify, cruza contra la DB y marca cuáles ya tienen nota. Es la cola de trabajo de la app.

### 8.5 A+ Instantáneo

Detecta canciones nuevas en Me Gusta nativo desde un `cutoff` guardado en `config`. Reglas: el cutoff se fija la **primera** vez que se escanea y **nunca se mueve**; `aplus_apply` recibe la lista de IDs que el usuario seleccionó, no aplica todo automáticamente.

### 8.6 Modo Virtual

El flujo más exótico. La idea: en lugar de calificar en la app, arrastras canciones a mano dentro de Spotify y la app **deduce** las nuevas notas por la posición final.

1. `POST /virtual/start` — congela el orden y cuenta cuántas hay de cada rating; con eso calcula los **segmentos** (qué rango de posiciones corresponde a cada nota) y las **fronteras**. Guarda todo en `config`.
2. (Arrastras canciones en Spotify.)
3. `POST /virtual/simulate` — relee la playlist y reporta qué canciones cruzaron una frontera. Usa `_lis_indices` (subsecuencia creciente más larga) para distinguir las que realmente se movieron de las que solo se desplazaron por arrastre ajeno.
4. `POST /virtual/apply` — escribe las notas nuevas y sincroniza MMG / Anual / ♥.

El **reordenador in-app** (`GET /virtual/playlist` + `POST /virtual/reorder`) es la alternativa cómoda: arrastras dentro de la propia app entre bloques de rating y aplicas todo de un golpe.

### 8.7 Migración de cuatrimestre

Mueve canciones del cuatrimestre anterior al actual **sin tocar `added_at` ni `rating`** — solo escribe `cuatrimestre_override`. Es aditiva: la canción aparece en la playlist destino y la de origen queda intacta.

---

## 9. Configuración y despliegue

### Variables de entorno

```
SPOTIPY_CLIENT_ID  SPOTIPY_CLIENT_SECRET  SPOTIPY_REDIRECT_URI
MYSQL_HOST  MYSQL_USER  MYSQL_PASSWORD  MYSQL_DATABASE
SECRET_KEY  FRONTEND_URL  PORT
CALIFICAR_PLAYLIST_ID  PL_PERLA  PL_MIEL  PL_LATTE  PL_MMG  PL_ANUAL  PL_MAREA_ARCHIVO
```

> `MYSQL_HOST` es `gateway01.us-east-1.prod.aws.tidbcloud.com`: **TiDB Cloud Serverless**, free tier. El `aws` del hostname es la infraestructura de TiDB, no una cuenta de AWS propia. El comentario `# MySQL (AWS RDS)` que traía `.env.example` era falso y ya se corrigió.

No existe `.env` en ninguna de las dos máquinas de desarrollo: la configuración real vive únicamente en Render.

### Ciclo de despliegue

```
git add … → git commit → git push origin HEAD:main
        ↓
Render detecta el push → build del Dockerfile → deploy
        ↓
.spotify_cache se pierde → Angel re-autentica desde la app
```

### Desarrollo local

```bash
# backend
cd backend && uvicorn main:app --reload --port 8000
# frontend (otra terminal)
cd frontend && npm run dev
```

En dev el frontend corre en `:5173` y el proxy de Vite manda `/auth`, `/tracks`, `/playlists`, `/virtual` y `/health` a `:8000`. En producción todo es el mismo origen y `BASE` en `api.js` queda vacío.

### Limitaciones conocidas del hosting

- **El plan free de Render duerme** el servicio tras ~15 min sin tráfico: el primer request después de eso tarda 30–60 s.
- El filesystem es efímero (ver §6).
- No hay migraciones versionadas: el esquema se ajusta con `ALTER TABLE` condicionales al arrancar.

---

## 10. Frontend

### Rutas

| Ruta | Página | Qué hace |
|---|---|---|
| `/` | `PendingPage` | Cola de `<3333`. Vista *individual* (portada grande, atajos 1–7 y S, botón "Reproducir en `<3333`") o *lista*. Tiene su propio PiP |
| `/recent` | `RecentPage` | Tabs "Escuchados" (recently played) y calificaciones recientes |
| `/library` | `LibraryPage` | Abre en Me Gusta nativo (500 más recientes, paginable). Chips para Perla/Miel/Latte/Galería/`<3333`. Export CSV |
| `/dashboard` | `StatsPage` | Métricas, distribución, top artistas, flujo A+ Instantáneo |
| `/tools` | `ToolsPage` | Modo Virtual, reordenador drag & drop, migración, rebuilds |
| — | `LoginPage` | Cuando no hay sesión de Spotify |

`App.jsx` es el *gate*: llama `/auth/status`, muestra Login si no hay sesión, y si la hay, precalienta los caches.

### Patrones que conviene conocer antes de tocar código

- **`api.js` es el único punto de red.** Ningún componente hace `fetch` directo. Los errores llegan como `Error("<status>: <body>")`, así que el frontend hace `JSON.parse` del mensaje para sacar el `detail` de FastAPI.
- **`preloadCache.js`** es un cache de sesión en memoria (se pierde al recargar). `prime()` dispara el fetch en background y `load()` reutiliza, espera lo que esté en vuelo, o va fresco. `App.jsx` precalienta `likedAll`, `recent`, `recentlyPlayed` y `distribution`, y esa última a su vez precalienta cada playlist por chip.
- **Design system en CSS puro.** Todo son custom properties en `:root` en `global.css`, más un bloque `:root[data-theme="dark"]` que solo redefine tokens. El modo elegido (`light` | `dark` | `system`) vive en `localStorage`; lo que se escribe al DOM es siempre el tema *resuelto*, primero por un script inline en `index.html` antes del primer paint y después por `useTheme`. Los colores de rating se consumen desde JSX con `ratingColor()` / `ratingDim()` / `ratingSoft()` (`utils/theme.js`), que devuelven referencias `var(...)` — no hay hex duplicado entre CSS y JS.
- **Los documentos de PiP no heredan custom properties.** `pipThemeCss()` lee los tokens ya resueltos y los inyecta como un `:root` propio en la ventana del PiP; al cambiar de tema se reescribe esa hoja y se redibuja.
- **Mobile-first con dos renders separados.** `NavBar` dibuja tab bar (móvil) *y* sidebar (desktop), controlados por media queries a 768px. Varias páginas hacen lo mismo.
- **Los PiP se dibujan con strings de HTML.** `documentPictureInPicture` + `innerHTML` reescrito completo en cada poll de 5 s. Funciona, pero parpadea, pierde el foco y hace imposible animar. Hay dos implementaciones casi duplicadas (`NavBar.jsx` y `PendingPage.jsx`). **Está agendada su reescritura como React real** — ver `Mejoras.txt` punto 3.
- **Polling, no websockets.** El Now Playing se consulta cada 5 s. No hay estado en tiempo real en ninguna parte.
- **Sin state manager.** Todo es `useState` local más `refs` para evitar closures obsoletas dentro de los callbacks del PiP.

---

## 11. Mapa de la API

### `/auth`
| Método | Ruta | |
|---|---|---|
| GET | `/auth/login` | redirige a Spotify |
| GET | `/auth/callback` · `/callback` | intercambia el code |
| GET | `/auth/status` | `{authenticated, user}` |
| POST | `/auth/logout` | borra el cache del token |

### `/tracks`
| Método | Ruta | |
|---|---|---|
| GET | `/tracks/pending` | cola de `<3333` con notas |
| POST | `/tracks/rate` (`?soft=`) | **el flujo principal** |
| GET | `/tracks/now-playing` | track actual o pausado + nota |
| POST | `/tracks/player/{pause,play,next,previous}` | control del reproductor (Premium) |
| POST | `/tracks/player/play-in-context` | reproduce dentro de una playlist con shuffle apagado |
| GET | `/tracks/recent` · `/tracks/recently-played` | historial de notas · historial de escucha |
| GET | `/tracks/search` · `/tracks/liked-all` · `/tracks/playlist/{id}` | consultas |
| GET | `/tracks/stats` | métricas |
| GET/POST | `/tracks/aplus/{status,scan,apply}` | A+ Instantáneo |
| GET/POST | `/tracks/migrate/candidates` · `/tracks/migrate` | migración de cuatrimestre |
| POST | `/tracks/test-like/{id}` · `/tracks/test-unlike/{id}` | utilidades de debug |

### `/playlists`
| Método | Ruta | |
|---|---|---|
| GET | `/playlists/mine` · `/playlists/distribution` | listar · IDs configurados |
| POST | `/playlists/order/{id}` | reordenar |
| POST | `/playlists/rebuild/anual` · `/playlists/rebuild/{cuatri}` | reconstruir desde DB |

### `/virtual`
| Método | Ruta | |
|---|---|---|
| GET | `/virtual/status` · `/virtual/playlist` | estado · playlist para el reordenador |
| POST | `/virtual/start` · `/simulate` · `/apply` · `/end` | ciclo del Modo Virtual |
| POST | `/virtual/reorder` | aplicar el drag & drop in-app |

### Otros
`GET /health` → `{"status":"ok"}`. Es el endpoint indicado para un *pinger* externo que evite que Render duerma el servicio.

---

## 12. Deuda técnica y riesgos, ordenados por lo que dolería

| # | Qué | Por qué importa |
|---|---|---|
| 1 | **`try/except: pass` en cada llamada a Spotify** dentro de `rate_track` | Los fallos parciales son invisibles. Una playlist puede quedarse desincronizada sin que nada avise. Los *rebuilds* existen justamente por esto |
| 2 | **Render free duerme** | 30–60 s en el primer request. Backlog punto 4 |
| 3 | **PiP con `innerHTML`** | Parpadea, no se puede animar, y hay dos copias del mismo código. Backlog punto 3 |
| 4 | **`CLAUDE.md` desactualizado** en la tabla de acciones de `rate_track` | Ver §8.1. Documentación que miente es peor que no tenerla |
| 5 | **Sin tests, de ningún tipo** | La única verificación es `npm run build` y probar a mano. En una función tan ramificada como `rate_track`, esto es el riesgo real |
| 6 | **`load_all()` carga la tabla completa** en cada operación | Aceptable hoy; es el primer cuello de botella cuando crezca |
| 7 | **IDs de playlist hardcoded** con default en el código | Si alguna se borra en Spotify, el fallo aparece como un `except: pass` silencioso |
| 8 | **`railway.json` es un vestigio** | Ya no se despliega en Railway. Confunde |
| 9 | **Región de Render vs. región de la DB** | Si no coinciden, cada query cruza el continente. Ver §6 |

---

## 13. Reglas de trabajo del proyecto

De `CLAUDE.md`, porque son parte de la arquitectura *del proceso*:

1. Explicar primero qué se entendió y qué se va a hacer. Preguntar dudas antes de asumir.
2. Actuar solo con visto bueno.
3. Toda sesión con cambios de código actualiza `CLAUDE_LOG.md` (fecha, qué, por qué, commit) y eso entra en el push.
4. El backend **siempre** corre en Render. No preguntar dónde corre.
5. Toda persistencia va a MySQL. El disco es efímero.
6. Filtrar por año actual en cualquier query que construya playlists.
