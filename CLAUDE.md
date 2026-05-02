# RateApp — Contexto para Claude

@README.md

## Reglas de trabajo

- Nunca hacer nada sin explicar primero qué entendí y qué voy a hacer
- Siempre preguntar dudas antes de asumir algo
- Solo actuar con visto bueno del usuario
- Al final de cada sesión donde se hagan cambios de código: actualizar `CLAUDE_LOG.md` con la fecha, qué se cambió y por qué, y el commit hash. Luego incluirlo en el push a GitHub.

## Deploy

- La app vive en **Render** (filesystem efímero) conectado a **GitHub** (`cruzangelramirez26/RateApp2`, rama `main`)
- **El backend SIEMPRE corre en Render. No preguntar dónde corre.**
- Cualquier archivo escrito en disco desaparece al reiniciar — **toda persistencia va a MySQL**
- Después de cada cambio: `git add` archivos modificados → `git commit` → `git push origin HEAD:main`
- Render redespliega automáticamente al detectar el push. El token `.spotify_cache` se borra en cada redeploy — el usuario re-autentica desde la app.

## Base de datos MySQL

Dos tablas:

**`tracks`** — track_id, name, artist, album, added_at, rating, manual_order, cuatrimestre_override
- `added_at`: fecha de primera calificación. **Nunca se pisa al re-calificar** (upsert solo la escribe en INSERT, no en UPDATE).
- `cuatrimestre_override`: NULL por defecto. Se pone cuando una canción se migra a otro cuatrimestre o cuando una canción histórica sube a TOP_SET y se agrega al cuatrimestre actual.

**`config`** — key/value para config persistente (ej: `aplus_cutoff`)

## Constantes clave

```
TOP_SET = {B+, A, A+}   → van a MMG playlist, Galería Anual, y Me Gusta nativo
RATING_ORDER = {D:0, C:1, C+:2, B:3, B+:4, A:5, A+:6}
Cuatrimestres: perla (ene-abr), miel (may-ago), latte (sep-dic)
```

## Spotify — Scopes y funciones clave

Scope actual: `playlist-read-private playlist-modify-public playlist-modify-private user-library-read user-library-modify`

Funciones en `spotify.py` para Me Gusta nativo:
- `save_tracks(sp, ids)` — da like
- `unsave_tracks(sp, ids)` — quita like
- `are_tracks_saved(sp, ids)` — verifica si están likeados

## Lógica de calificación (rate_track)

**REGLA CRÍTICA: toda query o lógica que construya playlists DEBE filtrar por año actual. Ya ocurrió 2 veces sin filtro y se llenaron playlists con canciones de años anteriores.**

### Distinción histórico vs actual
Una canción es del **cuatrimestre actual** si:
- Su `added_at` cae en el rango de meses del cuatrimestre actual y año actual, O
- Tiene `cuatrimestre_override == cuatrimestre_actual`

Si no cumple ninguna → es **histórica**.

### Tabla de acciones

| Situación | → TOP_SET (B+/A/A+) | → B/C+/C | → D |
|-----------|---------------------|-----------|-----|
| Canción actual | Agrega a cuatri actual + MMG + Galería + like | Sale de MMG + Galería + unlike (se queda en cuatri) | Sale de cuatri + MMG + Galería + unlike |
| Canción histórica | Agrega a cuatri **actual** + MMG + Galería + like + pone override | Solo sale de MMG + Galería + unlike (cuatri histórico intocable) | Sale de cuatri actual si estaba + MMG + Galería + unlike (cuatri histórico intocable) |

### Playlists históricas = INTOCABLES
Las playlists de cuatrimestres pasados (ej. Perla cuando estamos en Miel) **nunca se modifican** al re-calificar. Solo se tocan MMG, Galería Anual, el cuatrimestre actual, y Me Gusta nativo.

### Modo soft
`POST /tracks/rate?soft=true` — guarda solo en DB, no toca Spotify. Se usa cuando el usuario califica desde la vista "Me Gusta" en Biblioteca (solo quiere registrar una nota, no distribuir).

## Me Gusta nativo vs playlist MMG

Son dos cosas distintas:
- **Me Gusta nativo** = corazón de Spotify (`current_user_saved_tracks`). Se maneja con `save_tracks`/`unsave_tracks`. Se sincroniza automáticamente con TOP_SET al calificar.
- **Playlist MMG** (`mis_me_gusta` en `DISTRIBUTION_PLAYLISTS`) = playlist propia llamada "Mis Me Gusta". Se maneja igual que Galería Anual (entra con TOP_SET, sale al bajar).

## Galería Anual

- Contiene **todas las canciones TOP_SET del año actual**, sin importar de qué cuatrimestre son.
- `POST /playlists/rebuild/anual` — reconstruye desde DB con filtro de año actual. Usar cuando haya inconsistencias.
- Al re-calificar, `rate_track` la mantiene automáticamente (agrega al subir a TOP_SET, quita al bajar).

## Flujo A+ Instantáneo

- Cutoff guardado en tabla `config` clave `aplus_cutoff`
- Se fija la **primera vez** que el usuario escanea y **nunca se mueve**
- `aplus_apply` acepta lista de IDs seleccionados por el usuario (no aplica todo automáticamente)

## Biblioteca (LibraryPage)

- Abre por defecto mostrando **todos los Me Gusta nativos de Spotify** (hasta 500, newest first)
- Calificar desde la vista Me Gusta usa modo **soft** (solo DB, sin distribución)
- Calificar desde cualquier otro chip (Perla, Miel, Latte, Galería, 3333) usa la lógica completa
- Sort "Recientes" en vistas de playlist usa `rated_at` (fecha de calificación en DB), no la fecha de Spotify

## Changelog

@CLAUDE_LOG.md
