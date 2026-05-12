# Changelog de sesiones

---

## 2026-05-12 (sesión controles PiP + mini-bar móvil)

**Features: controles ⏮⏯⏭ en PiP Now Playing; mini-bar de Now Playing en móvil con calificación inline**

**Backend:**
- `backend/spotify.py` — scope `user-modify-playback-state` agregado.
- `backend/routes/tracks.py` — 4 endpoints nuevos: `POST /tracks/player/pause`, `/player/play`, `/player/next`, `/player/previous` (requieren Spotify Premium). `GET /tracks/now-playing` actualizado: ahora retorna el track aunque esté pausado (`is_playing: false`); antes devolvía `track: null` si no estaba reproduciendo activamente.

**Frontend:**
- `frontend/src/utils/api.js` — `playerPause()`, `playerPlay()`, `playerNext()`, `playerPrevious()`.
- `frontend/src/components/NavBar.jsx` — PiP del Now Playing ahora incluye fila de botones ⏮ ⏯ ⏭ entre la portada y los botones de rating. Estado `isPlaying` sincronizado por el polling de 5s; manejadores cableados via refs (`handleToggleRef`, `handleNextRef`, `handlePrevRef`) para evitar closures obsoletos. Altura del PiP aumentada a 420px. Mini-bar móvil (`np-mobile-bar`): se renderiza encima del tab bar cuando hay algo sonando (o pausado); al tocarlo despliega panel con 7 botones de calificación con colores del design system.
- `frontend/src/styles/global.css` — Clases `np-mobile-bar`, `np-mobile-bar-collapsed`, `np-mobile-bar-info`, `np-mobile-bar-name`, `np-mobile-bar-artist`, `np-mobile-bar-rating`, `np-mobile-bar-chevron`, `np-mobile-panel`, `np-mobile-panel-label`, `np-mobile-panel-btns`, `np-mobile-panel-btn`. Mini-bar oculta en `≥768px`. Padding-bottom de `.page` aumentado de 100px a 130px para no quedar detrás del mini-bar expandido.

**Nota de re-autorización:** el nuevo scope requiere que el usuario desloguée y vuelva a hacer login en Render para activarse.

Commit: `fa3e392` → desplegado en Render.

---

## 2026-05-11 (sesión Now Playing + Library menu)

**Features: widget Now Playing en sidebar con PiP, picker de calificación en menú de Biblioteca**

**Backend:**
- `backend/spotify.py` — scope `user-read-currently-playing` agregado.
- `backend/routes/tracks.py` — nuevo endpoint `GET /tracks/now-playing`: llama a `sp.current_user_playing_track()`, devuelve info del track + rating desde DB si existe. Retorna `{"is_playing": false}` si no hay nada sonando.

**Frontend:**
- `frontend/src/utils/api.js` — `getNowPlaying()` apunta al nuevo endpoint.
- `frontend/src/components/NavBar.jsx` — sidebar footer reemplazado: cuando hay algo sonando muestra portada 34×34 + nombre + artista + rating con su color + botón PiP. Si no hay nada, sigue mostrando "Connected". Polling cada 5s. El PiP de Now Playing es independiente del PiP de 3333; abre ventana 300×380 con portada grande + 7 botones de calificación; se actualiza automáticamente cuando cambia la canción. Calificar usa lógica completa (`api.rateTrack`), no soft.
- `frontend/src/styles/global.css` — clases `now-playing-widget`, `now-playing-img`, `now-playing-info`, `now-playing-name`, `now-playing-artist`, `now-playing-actions`, `now-playing-rating`, `now-playing-pip-btn`.
- `frontend/src/pages/LibraryPage.jsx` — menú ⋯ de tabla desktop: reemplaza "Calificar A+" por "Cambiar calificación". Al hacer clic el dropdown muta a un picker con los 7 ratings como botones inline (rating actual resaltado con su color). Al seleccionar se califica y cierra el menú.

**Nota de re-autorización:** el nuevo scope requiere que el usuario desloguée y vuelva a hacer login en Render para activarse.

Commits: `8a73205`, `f455c62`, `37348b8` → desplegados en Render.

---

## 2026-05-10 (sesión UI improvements)

**Features: PiP light theme, toggle Lista/Individual, Stats portadas, Library pagination, mobile sizing**

Sin cambios de backend lógicos — solo nuevos campos expuestos en la API existente.

**Backend:**
- `backend/spotify.py` — `get_all_liked_tracks` acepta `start_offset` para paginación.
- `backend/routes/tracks.py` — `/tracks/liked-all` acepta `offset` (para cargar más); retorna `cuatrimestre_override` y `db_added_at` de DB en cada track para que el frontend calcule el cuatrimestre.

**Frontend:**
- `frontend/src/pages/PendingPage.jsx` — PiP usa tema claro (#f5f4f0); toggle Lista/Individual en el header (default: individual, como estaba); modo individual disponible en móvil (layout responsivo); `pending-mobile-only`/`pending-desktop-only` eliminados, reemplazados por `viewMode` state.
- `frontend/src/pages/LibraryPage.jsx` — función `computeCuatrimestre()` calcula cuatrimestre desde `cuatrimestre_override` + `db_added_at`; paginación "Cargar 500 más" para vista Me Gusta.
- `frontend/src/pages/StatsPage.jsx` — nombres año-específicos: 2025 → Savia/Lirio/Marea con colores #cfd8be/#efdffc/#bde8f3; portadas en cards de cuatrimestre con gradiente overlay.
- `frontend/src/styles/global.css` — CSS para `pending-individual-grid` responsivo (single-col móvil, 2-col desktop); `pending-upnext-hide-mobile` oculta UP NEXT en móvil; media query `max-width: 480px` reduce padding y font-sizes.
- `frontend/src/utils/api.js` — `getLikedAll` acepta `offset`.
- `frontend/index.html` — `theme-color` actualizado a #f5f4f0.
- `frontend/public/portadas/` — portadas copiadas de `recursos/portadas/` (Savia, Lirio, Marea 2025; Perla, Miel, Latte 2026).

Commit: `10af4b7` → desplegado en Render.

---

## 2026-05-10 (sesión implementación)

**Feature: Rediseño visual completo — tema claro + layouts desktop**

Sin cambios de backend. 7 archivos frontend modificados:

- `frontend/src/styles/global.css` — variables migradas a paleta clara (fondo #f5f4f0, cards blancas, acento verde Spotify). Sidebar desktop, clases nuevas para PendingPage, LibraryPage y StatsPage. Tab bar cambiado a blanco traslúcido.
- `frontend/src/App.jsx` — wrapper `app-layout` + `main-content` para soporte de sidebar.
- `frontend/src/components/NavBar.jsx` — doble render: tab bar móvil + sidebar desktop con badge de pending count.
- `frontend/src/pages/PendingPage.jsx` — layout desktop 2 columnas (canción focal + UP NEXT panel), keyboard shortcuts 1–7 y S, lógica de skip con `skippedIds`. Mobile conserva layout lista original.
- `frontend/src/pages/LibraryPage.jsx` — tabla desktop con portada/nombre/álbum/cuatrimestre/rating/acciones. Export CSV client-side. Sort pills Spotify | Recientes | Rating. Mobile conserva TrackCards.
- `frontend/src/pages/StatsPage.jsx` — time filter tabs (Mes/Cuatrimestre/Año/Todo), metric cards row (4 columnas desktop), layout main-grid distribución + top artistas. Cuatrimestres rediseñados con mini-bar.
- `frontend/src/pages/LoginPage.jsx` — glow decorativo de lavanda a verde Spotify.

---

## 2026-05-10

**Sesión de planeación — Rediseño visual frontend (sin cambios de código)**

- Claude Design entregó mockups de 3 pantallas (Pending, Library, Stats) en tema claro. El usuario aprobó la dirección.
- Explorado el frontend actual: dark vinyl theme, pure CSS variables en `global.css`, sin Tailwind/shadcn, React 18 + React Router.
- Plan de implementación completo guardado en `.claude/plans/este-es-el-front-delegated-floyd.md`.
- Screenshots de referencia del diseño aprobado guardadas en `frontend/design/` (01-pending.png, 02-library.png, 03-stats.png).
- Resumen del plan: cambiar variables CSS a tema claro (fondo #f5f4f0, acento verde Spotify), sidebar desktop en NavBar, layout dos columnas en PendingPage con UP NEXT panel, tabla en LibraryPage, metric cards + time filter en StatsPage. Sin cambios de backend.
- Implementación se hará en sesiones posteriores, archivo por archivo, en este orden: global.css → App.jsx → NavBar → PendingPage → LibraryPage → StatsPage.

No hay commit — sesión de planeación.

---

## 2026-05-03

**Sesión de diseño — Claude Design (sin cambios de código)**

- Investigado Claude Design (Anthropic Labs, lanzado 2026-04-17): workspace con canvas visual, disponible en plan Pro+, powered by Opus 4.7.
- Redactado prompt para rediseño visual completo de RateApp con nueva dirección: shadcn/ui como base, Spotify green (#1DB954) como accent principal, zinc scale para neutrales, light + dark mode. El diseño actual (dark vinyl) se abandona; solo se preservan los 7 colores de rating y las fuentes DM Sans / Space Mono.
- Iteración del prompt: primera versión reproducía el diseño actual porque describía la paleta existente. Segunda versión elimina toda referencia al diseño actual y añade "what NOT to do" explícito.
- Conclusión: no mandar CSS ni screenshots del estado actual a Claude Design para evitar que se inspire en lo existente.
- Idea anotada en memoria: Vista Play en chip 3333 de Biblioteca — toggle lista/play; la vista play muestra una canción a la vez con portada grande y botones de calificación (similar a PendingPage).

No hay commit — sesión de diseño y planeación.

---

## 2026-05-02

**Feature: Picture-in-Picture para calificar desde ventana flotante**

- `frontend/src/pages/PendingPage.jsx` — botón PiP junto al refresh. Usa `documentPictureInPicture` API (Chrome desktop). Abre ventana flotante 300×460 con portada, nombre/artista, 7 botones de rating (colores del design system) y botón "saltar". Al llegar al final reconstruye la cola con las que siguen sin calificar (loop); si no queda ninguna muestra pantalla de done. Calificar desde PiP ejecuta el mismo `handleRate` del componente principal (actualizaciones de estado y API idénticas).

Commit: `15340e4` → desplegado en Render.

---

## 2026-05-01 (sesión 3)

**Feature: Liked Songs sync + re-calificación histórica + UI mejoras**

### Liked Songs (Me Gusta nativo de Spotify)
- `backend/spotify.py` — scope `user-library-modify` agregado; `save_tracks()`, `unsave_tracks()`, `are_tracks_saved()`, `get_all_liked_tracks()`
- `backend/routes/tracks.py` — `rate_track` ahora sincroniza Me Gusta nativo: da like al subir a TOP_SET, quita like al bajar. Modo `soft=true` para guardar solo en DB sin tocar Spotify.
- `backend/database.py` — `upsert_track` ya no pisa `added_at` al actualizar (solo INSERT). `get_stats_extended()` con top artistas y desglose por cuatrimestre.

### Lógica histórico vs actual
- `rate_track` detecta si una canción es del cuatrimestre actual (`added_at` en rango + año) o histórica. Canciones históricas subiendo a TOP_SET entran al cuatrimestre actual con `cuatrimestre_override`. Playlists históricas nunca se tocan.

### Galería Anual
- `backend/routes/playlists.py` — `POST /playlists/rebuild/anual`: reconstruye Galería con todos los TOP_SET del año actual desde DB. (Bug fix: segunda versión sin filtro de año fue corregida inmediatamente.)

### UI
- `RecentPage` — portadas enriquecidas via batch `sp.tracks()`
- `LibraryPage` — default abre "Me Gusta" nativo; filtro inline; sort "Recientes" usa `rated_at` (fecha DB); modo soft al calificar desde Me Gusta
- `StatsPage` — TOP SET highlight con %, desglose por período, top artistas
- `ToolsPage` — botón "Reconstruir Galería"
- `api.js` — `getLikedAll()`, `rateTrackSoft()`, `rebuildAnual()`
- `/tracks/playlist/{id}` — agrega campo `rated_at` (fecha DB)
- `/tracks/liked-all` — nuevo endpoint: todos los Me Gusta enriquecidos con ratings de DB

Commits: `1785c30`, `fda69f8`, `c495261`, `6a0f02e`, `c53aac6` → desplegados en Render.

---

## 2026-05-01

**Bug corregido: A+ Instantáneo**

Problema: el cutoff se guardaba en `a_plus_cutoff.json` (archivo local). En Render, ese archivo se borraba en cada reinicio. Además, el cutoff se movía después de cada apply, lo que hacía que canciones antiguas volvieran a aparecer.

Cambios:
- `backend/database.py` — `ensure_config_table()`, `get_config()`, `set_config()`: tabla `config` en MySQL
- `backend/main.py` — llama `ensure_config_table()` en lifespan
- `backend/models.py` — nuevo modelo `AplusApplyRequest` con `track_ids: list[str]`
- `backend/routes/tracks.py` — cutoff migrado a MySQL, `aplus_apply` no mueve el cutoff, acepta IDs seleccionados
- `frontend/src/utils/api.js` — `aplusApply(trackIds)` manda los IDs seleccionados
- `frontend/src/pages/StatsPage.jsx` — checkboxes por candidato, todos marcados por defecto, botón "Marcar/Desmarcar todo", botón Aplicar muestra conteo y se deshabilita si hay 0 seleccionados

Commit: `9432400` → desplegado en Render.

---

## 2026-05-01 (sesión 2)

**Feature: Migración de cuatrimestre + página Herramientas**

Nueva funcionalidad para mover canciones del cuatrimestre anterior al actual sin alterar `added_at` ni `rating`. Las canciones históricas permanecen visibles en su cuatrimestre de origen; la migración es aditiva (se agregan a la playlist destino en Spotify, la playlist origen queda intocable).

Ciclo definido: Perla → Miel → Latte → (sin siguiente por ahora).

Cambios:
- `backend/database.py` — `ensure_table()` aplica migración de columna `cuatrimestre_override` (nullable); `get_migration_candidates(from_cuatri, from_year)` filtra por año exacto y excluye ya migradas; `set_cuatrimestre_override(track_ids, to_cuatri)`
- `backend/utils.py` — constante `CUATRIMESTRE_PREV` con el ciclo
- `backend/models.py` — nuevo modelo `MigrateRequest`
- `backend/routes/tracks.py` — `GET /tracks/migrate/candidates` y `POST /tracks/migrate`
- `frontend/src/utils/api.js` — `getMigrationCandidates()` y `migrateTracks()`
- `frontend/src/pages/ToolsPage.jsx` — página nueva con Modo Virtual, A+ Instantáneos, Migración y Orden de playlists
- `frontend/src/pages/StatsPage.jsx` — simplificado, solo muestra distribución de ratings
- `frontend/src/components/NavBar.jsx` — tab "Herramientas" antes de Dashboard
- `frontend/src/App.jsx` — ruta `/tools`

Commit: `c9ccf67` → desplegado en Render.

**Refinamientos UI migración** (commits `9a6a60e`, `597e003`)

- Sort por calificación ahora usa `added_at` desc como segundo criterio (replica orden real de playlist)
- Checkboxes desmarcados por defecto; botón Marcar/Desmarcar visible como `btn`
- Fila de candidato: checkbox + rating (color) + portada 34px + nombre/álbum + artista
- Backend enriquece candidatos con thumbnail vía `sp.tracks()`
- Filtro client-side por nombre/artista/álbum sin perder selecciones; "Marcar visibles" solo opera sobre los ítems mostrados

**Bug fixes** (commits `22fcc07`, `c9aa51c`)

- `LibraryPage` — chips Perla/Miel/Latte/Galería/3333 arreglados: llamaban a `api.getLibrary()` inexistente; corregido a `api.getDistribution()` + `api.getPlaylistTracks()`. Sort Spotify/Recientes restaurado.
- `POST /playlists/rebuild/{cuatri}` — reconstruye playlist desde DB. Corregidos dos bugs: (1) no filtraba por año, jalaba canciones de Perlas/Mieles anteriores; (2) filter `!= "D"` fallaba con NULL en DB (llegaban como `"nan"` al DF); reemplazado por `rating_order > 0` que excluye D y NULL robustamente.
- `ToolsPage` — botones "Ordenar Perla/Miel/Latte" individuales + "Reconstruir" con lógica corregida.

Commits: `22fcc07`, `c9aa51c` → desplegado en Render.
