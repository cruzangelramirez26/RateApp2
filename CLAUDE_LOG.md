# Changelog de sesiones

---

## 2026-08-21 (sesion ping anti-sleep + diagnostico del 404)

**Maquina: PC `AngelPC`.**

Sin cambios de codigo de la app. Un workflow de CI nuevo y documentacion.

**Lo que se pidio y lo que se hizo.** Angel reporto dos molestias juntas: que
Render free se duerme, y que "a veces hago refresh y sale esto, se reinicia toda
la app", con captura de `{"detail":"Not Found"}` en `/recent`. Resultaron ser dos
problemas independientes y el segundo **no** es lo que parecia.

**El 404 no es la app reiniciandose.** Se comprobo con el server despierto
(`/health` en 245 ms) recorriendo las rutas del SPA en el deploy vivo:

```
/            200
/recent      404
/library     404
/tools       404
/dashboard   404
```

Causa: `backend/main.py` monta `StaticFiles(directory=static_dir, html=True)` en
`"/"`. Con `html=True`, StaticFiles sirve `index.html` para `/` y para carpetas
que existan en disco — nada mas. `/recent` no es archivo ni carpeta, asi que cae
al 404 de FastAPI en JSON crudo. El `BrowserRouter` de React resuelve esas rutas
del lado del cliente, y de ahi la asimetria: navegar dentro de la app funciona,
refrescar o pegar la URL no. Es permanente y no lo arregla ni el ping ni migrar
de hosting.

**Arreglado (Angel lo pidio despues, en la misma sesion).** `SPAStaticFiles` en
`backend/main.py` subclasea `StaticFiles` y atrapa el 404 de `get_response` para
devolver `index.html`.

La condicion de "sin extension de archivo" es la parte que importa. Sin ella, un
`/assets/foo.js` inexistente devolveria `index.html` con status 200 y el error
real — un asset que no se copio al build — quedaria escondido detras de un
`Unexpected token '<'` en la consola del navegador, que es de las cosas mas
molestas de rastrear. Con la condicion, ese caso sigue dando 404 honesto.

Solo se atrapa el 404 a proposito: StaticFiles tambien levanta 405 para metodos
que no son GET/HEAD, y ese debe seguir saliendo tal cual (un `POST /recent` no
tiene por que recibir HTML). El mount va al final del archivo porque Starlette
resuelve en orden de registro: los routers se registran antes y por eso
`/tracks/...` le gana al catch-all.

**Verificacion con el build real de Vite**, no con un fixture: se corrio
`npm run build`, se copio `dist` a `backend/static` y se probaron 15 casos con
`TestClient` (instanciado sin `with`, para que no corra el lifespan y no pida
MySQL). Las 5 rutas del router devuelven el SPA real — se comprobo que traen
`<div id="root">` y la referencia al bundle, no solo que dan 200. Los assets
reales conservan su content-type (`application/javascript`, `text/css`,
`image/svg+xml`, `application/json`, `image/jpeg`). Tres assets inexistentes dan
404 y se verifico que NO traen el root del SPA. `/health` sigue siendo JSON del
router y `POST /recent` sigue dando 405. `backend/static` se borro despues: no
existia antes y esta en `.gitignore`, pero sin `.dockerignore` engordaria el
contexto de build.

**El ping (esto si se hizo).** `.github/workflows/keep-awake.yml` (nuevo) le pega
a `/health` cada 10 min via `cron: '*/10 * * * *'`, con `workflow_dispatch` para
dispararlo a mano. Se eligio sobre pagar Render ($7/mes) o migrar a Fly.io
(~$2-3/mes) porque es $0 y no toca el codigo de la app. El `curl` lleva
`--max-time 90` y `--retry 3 --retry-delay 15 --retry-all-errors` a proposito: el
momento en que el ping mas importa es justo un arranque frio de 30-60s, tras un
redeploy o si se perdio el ping anterior. Se probo el comando exacto contra el
deploy vivo (200) y se valido que el YAML parsea.

**Numero corregido en `Mejoras.txt`:** la nota decia que 24/7 consume "~730 de
las 750 horas/mes". Son **744** en un mes de 31 dias, o sea 6 h de margen, no 20
— y solo si es el UNICO servicio free de la cuenta. Por eso el workflow trae
comentado un cron recortado (`*/10 13-23,0-7 * * *`, que es 7:00-1:00 hora Mexico
centro) para cuando haga falta holgura.

**Dos limitaciones que hay que tener presentes**, ambas anotadas en el YAML:
GitHub deshabilita los workflows programados tras 60 dias sin actividad en el
repo (avisa por correo), y el cron de Actions en runners gratis se atrasa
seguido, asi que algun ping puede llegar tarde o perderse. Si eso pasa de mas,
cron-job.org es mas puntual para este trabajo.

**Deuda que quedo senalada, sin tocar.** `backend/spotify.py:29` usa
`cache_path=".spotify_cache"`, un archivo en disco, y el filesystem de Render es
efimero: cada reinicio o redeploy obliga a re-loguearse en Spotify. El patron
para arreglarlo ya existe dos veces en el proyecto — `aplus_cutoff` y el estado
del Modo Virtual viven en la tabla `config` — asi que lo natural es un
`CacheHandler` de spotipy que lea y escriba ahi. Importa mas de lo que parece:
es prerrequisito para cualquier migracion futura a Cloud Run o a algo con mas de
una instancia, donde el problema **empeora** en vez de quedarse igual.

Commits: `782220f` (ping), `65fe434` (log), `PENDIENTE` (fallback SPA).

---

## 2026-08-20 (sesion 3 - modo oscuro)

**Maquina: PC `AngelPC`.**

**Feature: tema claro / oscuro con toggle y opcion de seguir al sistema.**

Sin cambios de backend.

**Arquitectura del tema:**
- `frontend/src/utils/theme.js` (nuevo) — el modo que elige el usuario (`light` | `dark` | `system`) se guarda en `localStorage` bajo `rateapp_theme`, pero lo que se escribe al DOM es siempre el tema **resuelto** en `documentElement[data-theme]`. Por eso `global.css` necesita un solo bloque `[data-theme="dark"]` y no duplica los tokens dentro de un `@media (prefers-color-scheme)`: un solo lugar que mantener.
- `frontend/index.html` — script inline que fija `data-theme` y el `theme-color` **antes del primer paint**. Sin esto, abrir la app en oscuro destella blanco mientras carga el bundle. Duplica a proposito la logica minima de `theme.js`.
- `frontend/src/hooks/useTheme.jsx` (nuevo) — `ThemeProvider` + `useTheme()`. En modo `system` escucha `matchMedia('(prefers-color-scheme: dark)')` y cambia en vivo. Emite `rateapp:themechange` en `window` para quien viva fuera de React.
- `frontend/src/App.jsx` — `ThemeProvider` envuelve tambien el gate de carga y el `LoginPage`, no solo la app autenticada.

**Tokens:**
- `frontend/src/styles/global.css` — `:root` gana `--bg-bar` / `--bg-bar-strong` (barras traslucidas), `--on-accent`, y tres tokens por rating: `-dim` (fondo), `-soft` (borde) y `-glow`. Existen para que el JS no tenga que concatenar alpha en hex (`${color}18` y `${color}44` desaparecieron). Los 23 colores hardcodeados que quedaban en el CSS pasaron a tokens; los unicos valores absolutos que sobreviven estan **dentro** de las definiciones de tokens, como debe ser.
- Bloque `:root[data-theme="dark"]`: fondo `#121110`, cards `#1c1a17`, texto `#f0ede6`, bordes en blanco translucido, sombras mas profundas y `color-scheme: dark`. Los 7 colores de rating se aclararon — el que mas lo necesitaba era `D` (`#88555c` casi desaparecia sobre fondo oscuro, ahora `#c98b93`).

**Los PiP tambien siguen el tema.** Un documento de Picture-in-Picture es un documento aparte: no hereda las custom properties del principal. `pipThemeCss()` lee los tokens ya resueltos con `getComputedStyle` y los inyecta como un `:root` propio en la ventana del PiP, asi que el HTML del PiP (que se genera con strings) puede usar `var(--...)` igual que el resto de la app. Al cambiar de tema se reescribe esa hoja y se vuelve a dibujar: `NavBar` agrega `theme` a las dependencias de su efecto de sincronizacion y `PendingPage` tiene un efecto nuevo para lo mismo.

**Ratings sin hex en JSX.** Se borraron los 5 mapas `RATING_COLORS` duplicados (NavBar, PendingPage, LibraryPage, StatsPage, ToolsPage) y se reemplazaron por `ratingColor()` / `ratingDim()` / `ratingSoft()` de `theme.js`, que devuelven referencias `var(...)`. Los estilos inline de React ahora cambian con el tema sin JS extra. Esto tambien mata la deuda #9 de `ARQUITECTURA.md` (colores duplicados entre CSS y JS).

**UI del toggle:**
- `frontend/src/components/ThemeToggle.jsx` (nuevo) — dos variantes. `icon`: boton chico en el footer del sidebar que rota claro -> oscuro -> sistema (desktop). `segmented`: los tres modos visibles, en una tarjeta nueva "Apariencia" al inicio de Herramientas — esa es la via en movil, donde la tab bar ya esta llena con 5 items.

**Verificacion (esta vez de verdad, con navegador):** `npm run build` OK. Ademas se levanto un backend de mentiras en `:8000` (solo en el scratchpad, no toca el repo) para poder renderizar las vistas autenticadas en local, y se recorrieron `/`, `/tools`, `/library`, `/recent` y `/dashboard` en oscuro buscando elementos que siguieran pintados con valores del tema claro: **cero fugas**. Se comprobo que el script anti-parpadeo resuelve `system` -> `dark` antes del primer paint, que elegir `light` explicitamente le gana a la preferencia oscura del SO, que el toggle cicla y persiste (`dark/system` -> `light/light` -> `dark/dark`), y que `pipThemeCss()` emite valores oscuros u claros segun el tema. Lo unico que **no** se pudo probar es una ventana de PiP real: el navegador embebido no las abre, asi que el PiP hay que verlo a ojo tras el deploy.

Commit: `cd1d37d`.

**Cierre de sesión.** Angel confirmó `MYSQL_HOST` = `gateway01.us-east-1.prod.aws.tidbcloud.com`: es **TiDB Cloud Serverless** (free tier), no AWS RDS de él — el `aws` del hostname es la infraestructura de TiDB. Se documentó en `ARQUITECTURA.md` §6 y §9, con las tres consecuencias prácticas: es compatible con MySQL pero no es MySQL, exige TLS (lo negocia solo el conector), y la región `us-east-1` importa porque `load_all()` jala la tabla completa en casi cada operación. Se agregó fila de deuda por la posible discordancia de región Render/DB, y se quitaron las dos filas ya resueltas (el comentario falso de `.env.example` y los colores duplicados CSS/JS). Commit: `5ffb7b0`.

---

## 2026-08-20 (sesión 2 — limpieza del botón + ARQUITECTURA.md)

**Máquina de trabajo: PC `AngelPC`** (la otra es la laptop). En la PC sí hay toolchain: se corrió `npm install` — antes no existía `frontend/node_modules` — así que ya se verifica con `npm run build` de verdad, y el backend se puede importar en Python para validar rutas y modelos.

**Frontend:**
- `frontend/src/pages/PendingPage.jsx` — se quitaron los links `abrir app ↗` y `web ↗`: queda solo el botón `▶ Reproducir en <3333`, que es el que hace el trabajo. Se borraron los helpers `spotifyAppUri()` / `spotifyWebUrl()` que quedaron sin uso. El `<div>` con estilos inline se reemplazó por la clase `pending-track-actions`.
- `frontend/src/styles/global.css` — nueva clase `.pending-track-actions`: `justify-content: center` por default (móvil) y `flex-start` en el bloque de `min-width: 768px`, siguiendo la misma lógica que `.pending-track-info`, que ya alternaba `text-align` center/left. Así el botón queda centrado en móvil y alineado a la izquierda en desktop.

**Documentación:**
- `ARQUITECTURA.md` (nuevo) — documento completo: diagrama de la arquitectura, stack con versiones, árbol de archivos, modelo de dominio (TOP_SET, cuatrimestres, playlists fijas, distinción actual/histórica), esquema de las dos tablas y por qué existe `config`, integración con Spotify (OAuth, scopes, peculiaridades del wrapper), los 7 flujos principales con `rate_track` desglosado, configuración y despliegue, patrones del frontend, mapa completo de la API, y una tabla de deuda técnica ordenada por impacto.
- `.env.example` — el comentario decía `# MySQL (AWS RDS)` y es **falso**: no hay nada en AWS. Corregido. El host real solo existe en las env vars de Render y su hostname va a delatar el proveedor.
- `CLAUDE.md` — enlace a `ARQUITECTURA.md`, y corregida la fila de la tabla de `rate_track` que decía que con B/C+/C la canción "se queda en cuatri". El código no hace eso: `C` se **elimina** del cuatrimestre y `B`/`C+` se **agregan** si la canción es del cuatrimestre actual.

Verificación: `npm run build` OK (1582 módulos, 3.15s).

Commit: `6bf17b1`.

---

## 2026-08-20 (sesión link contextual a <3333>)

**Feature: el link "Open in Spotify" de la canción focal de Pending ahora abre la playlist `<3333>` posicionada en esa canción, no la página aislada del track**

Sin cambios de backend — `GET /playlists/distribution` ya expone el id de `calificar`.

**Frontend:**
- `frontend/src/pages/PendingPage.jsx` — el link apuntaba a `open.spotify.com/track/{id}`, que abre el track sin contexto de playlist (nunca se implementó el contexto, no era un bug). Ahora construye `open.spotify.com/playlist/{calificar}?highlight=spotify:track:{id}`. El id de la playlist se obtiene con `preloadCache.load('distribution', api.getDistribution)` — `App.jsx` ya primea esa key, así que sale de cache. Si el id no está disponible cae al link de track de siempre; el label también cambia (`Abrir en <3333` vs `Open in Spotify`).

**Seguimiento (misma sesión):** el link visible ahora usa el esquema `spotify:` en vez de `https://open.spotify.com`, para que abra la **app instalada** (desktop y móvil) en lugar del web player. Helpers nuevos `spotifyAppUri()` / `spotifyWebUrl()` en el mismo archivo. El link de app va **sin** `target="_blank"` a propósito: el protocol handler se dispara y la pestaña actual no se mueve (con `_blank` quedaría una pestaña en blanco). Junto a él queda un link chico `web ↗` con la URL https, por si la app no está instalada. Si el cliente de escritorio no acepta el `?highlight=` en el URI, basta con quitar el query param y queda `spotify:playlist:{id}`.

**Seguimiento 2 (misma sesión): reproducir en contexto en vez de solo resaltar.**

Backend:
- `backend/spotify.py` — scope `user-read-playback-state` agregado (lo necesita `sp.devices()`). No cuesta re-login extra: el `.spotify_cache` se borra en cada redeploy de todos modos.
- `backend/models.py` — modelo `PlayContextRequest` (`track_id`, `playlist_id` opcional → default `<3333>`, `shuffle_off=True`).
- `backend/routes/tracks.py` — `POST /tracks/player/play-in-context`: apaga shuffle, luego `start_playback(context_uri="spotify:playlist:{id}", offset={"uri": "spotify:track:{tid}"})`. Al reproducir con contexto de playlist, lo que sigue es la siguiente canción de `<3333>` y no el radio de Spotify. Helper `_resolve_device_id()`: si el primer intento falla con `NO_ACTIVE_DEVICE` (típico cuando Spotify está abierto pero idle), lista dispositivos, prefiere el activo o toma el primero, y reintenta con `device_id` explícito. Si no hay ninguno, devuelve 400 con mensaje legible en español. Reintenta el `shuffle(False)` después de arrancar, porque sin contexto activo Spotify a veces ignora el toggle.

Frontend:
- `frontend/src/utils/api.js` — `playInContext(trackId, playlistId, shuffleOff)`.
- `frontend/src/pages/PendingPage.jsx` — botón primario `▶ Reproducir en <3333` en la canción focal, con estado `playing` para evitar dobles clics y toast con el `detail` del backend cuando falla. Los links pasaron a secundarios: `abrir app ↗` (esquema `spotify:`) y `web ↗`.

Verificación: `npm install` corrido en esta laptop (antes no había `node_modules`), `npm run build` pasa (1582 módulos, 6.95s). Backend verificado importando `routes.tracks` — las 5 rutas de player registradas, el modelo instancia con sus defaults y el scope nuevo aparece en `SCOPE`.

Nota: el link solo *abre* la playlist, no reproduce, así que no dispara shuffle. Si el shuffle está prendido en Spotify y se le da play a mano, el orden sí se revuelve — queda anotado en `Mejoras.txt` un endpoint opcional de shuffle-off y el botón de "reproducir en contexto" vía `start_playback(context_uri=...)`.

También se creó `Mejoras.txt` con el backlog acordado: (1) link/play contextual, (2) modo oscuro con toggle + preferencia del sistema, (3) reescritura del PiP como React real con barra de progreso y seek, (4) hosting que no se duerma, (5) apps nativas con Tauri (Windows) y Capacitor (Android).

Verificación: `frontend/node_modules` sigue sin instalar en esta laptop, así que no hubo `vite build`. Se validó con parse de esbuild (`PendingPage.jsx`, `NavBar.jsx`, `App.jsx` → OK) y revisión de diff.

Commit: `a1d236d` → desplegado en Render.

---

## 2026-08-04 (sesión fix tamaño PiP Now Playing)

**Bug fix: el PiP de Now Playing perdía el tamaño ajustado a mano cada vez que cambiaba la canción**

Sin cambios de backend.

**Frontend:**
- `frontend/src/components/NavBar.jsx` — el efecto que sincroniza el PiP (`[nowPlaying, isPlaying, isPiPOpen, pipLayout]`) llamaba `resizeTo(w, h)` con el tamaño fijo del layout en **cada** corrida, así que cualquier resize manual se borraba al cambiar de canción o al pausar. Nuevo `appliedLayoutRef` guarda para qué layout ya se aplicó tamaño; el `resizeTo` solo se dispara cuando ese valor difiere del `pipLayout` actual (o sea, solo al tocar el botón ↔/↕).
- Además el tamaño ahora se recuerda: helpers `loadPipSizes` / `pipSizeFor` / `savePipSize` persisten `{vertical: [w,h], horizontal: [w,h]}` en `localStorage` bajo la clave `rateapp_np_pip_size`. Se guarda desde un listener `resize` de la ventana PiP (debounce 400 ms), al cerrar el PiP, y al cambiar de layout (bajo el layout que se está dejando). `requestWindow` usa el tamaño guardado del layout; si no hay o es inválido (<200×120), cae al default de siempre (300×420 vertical, 420×190 horizontal).

Nota: no se pudo verificar con `vite build` — `frontend/node_modules` no está instalado en esta máquina (laptop). Validación por revisión de diff.

Commit: `6248d42` → desplegado en Render.

---

## 2026-05-23 (sesión reordenador in-app + fix bug estado virtual + fronteras visibles)

**Bug fix: estado del Modo Virtual migrado de archivo JSON a MySQL (sobrevive reinicios de Render)**
**Feature: Reordenador in-app con drag & drop — arrastra canciones entre bloques de rating para cambiar calificación sin tocar Spotify manualmente**
**UX: Modo Virtual ahora muestra fronteras y cambios detectados con nombres de canciones**

**Backend:**
- `backend/database.py` — `get_virtual_state()` y `set_virtual_state()`: leen/escriben el estado del modo virtual en la tabla `config` (MySQL) en lugar del archivo `cuatri_virtual_state.json`. Esto corrige el bug donde el estado se perdía en cada reinicio de Render.
- `backend/routes/virtual.py` — eliminado `STATE_FILE` / `_save_state` / `_load_state`; reemplazados con llamadas a DB. `_boundary_lines` ahora retorna lista de dicts `{pair, upper, lower}` en vez de strings. Nuevos endpoints: `GET /virtual/playlist` (retorna playlist actual del cuatrimestre con ratings e imágenes para el reordenador) y `POST /virtual/reorder` (acepta lista ordenada con ratings, actualiza DB, sincroniza MMG/Anual/Me Gusta, y reemplaza la playlist de Spotify).

**Frontend:**
- `frontend/src/utils/api.js` — `getVirtualPlaylist()` y `reorderPlaylist(items)`.
- `frontend/src/pages/ToolsPage.jsx` — Modo Virtual ahora muestra tabla de fronteras (última/primera de cada par de ratings con nombre de canción) y lista de cambios detectados tras simular. Nueva sección "Reordenador": carga la playlist actual, muestra canciones agrupadas por bloques de rating con drag & drop nativo HTML5; arrastrar entre bloques cambia la calificación pendiente (con tachado del rating original visible); al aplicar, actualiza Spotify + DB + Me Gusta en un solo paso. Tracks con rating C quedan fuera de la playlist de Spotify al aplicar (igual que la lógica de rate_track).

Commit: `5cbdb54` → desplegado en Render.

---

## 2026-05-15 (sesión fixes móvil + preload + PiP layout)

**Features: preload cache, PiP toggle vertical/horizontal, fixes móvil, stats filtradas, recently played como default**

**Backend:**
- `backend/spotify.py` — scope `user-read-recently-played` agregado.
- `backend/routes/tracks.py` — `GET /tracks/recently-played`: llama a `current_user_recently_played(50)`, desduplicado por ID, enriquecido con ratings de DB. Fix bug Me Gusta: `save_tracks` ahora verifica `are_tracks_saved` antes de llamar para no re-posicionar canciones ya likeadas.
- `backend/database.py` — `get_stats_extended` actualizado: devuelve `by_rating` y `top_rating` por cuatrimestre; agrega `top_artists_year` (top artistas del año actual).

**Frontend — Preload:**
- `frontend/src/utils/preloadCache.js` — nuevo módulo singleton. `prime(key, fetcher)` inicia fetch background; `load(key, fetcher)` reutiliza cache, espera in-flight, o fetcha fresco.
- `frontend/src/App.jsx` — al autenticar, primea: `likedAll`, `recent`, `recentlyPlayed`, `distribution` (que a su vez primea cada chip de playlist: perla/miel/latte/anual/calificar).
- `frontend/src/pages/LibraryPage.jsx` — `loadLiked` y `handleChip` usan `preloadCache.load`.
- `frontend/src/pages/RecentPage.jsx` — ambas tabs usan cache; tab default cambiado a "Escuchados"; tabs reordenadas (Escuchados primero).

**Frontend — Stats:**
- `frontend/src/pages/StatsPage.jsx` — default filter: "año" (antes "todo"). Métricas (Tier A, mode rating, distribución) calculadas desde `by_rating` filtrado por cuatri. Top artistas: global para "todo", `top_artists_year` para cualquier otro filtro.

**Frontend — Mobile fixes:**
- `frontend/src/styles/global.css` — `.main-content` con `flex:1 + overflow-x:hidden` global (fix contenido descentrado y overflow biblioteca). `np-mobile-bar` sube a `bottom: 64px`. Play dot verde pulsante (`.np-play-dot`) en mini-bar. `pending-album-art` con `margin: 0 auto`. `padding-bottom` de `.page` aumentado a 160px (fix overlap Tools).
- `frontend/src/components/NavBar.jsx` — sidebar: dot verde + label "now playing"/"Connected" siempre visible. Mini-bar móvil: play dot pulsante (pausa = estático). PiP controles más chicos (`4px 10px`, `0.85rem`).

**Frontend — PiP toggle layout:**
- `frontend/src/components/NavBar.jsx` — PiP Now Playing con botón ↔/↕ para alternar entre vertical (300×420) y horizontal (420×190). Layout horizontal: portada 80px izquierda, nombre/artista/controles derecha, ratings abajo compactos. `resizeTo()` al cambiar layout.

**Misc:**
- Chip "calificar" en Biblioteca ahora muestra `<3333` (antes `3333`).

Commits: `909148d`, `7202520`, `f816834`, `71f200d` → desplegados en Render.

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
