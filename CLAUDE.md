# RateApp — Contexto para Claude

@README.md

Arquitectura completa: [`ARQUITECTURA.md`](ARQUITECTURA.md) — stack, modelo de dominio, esquema de DB, flujos, mapa de la API y deuda técnica.

## Reglas de trabajo

- Nunca hacer nada sin explicar primero qué entendí y qué voy a hacer
- Siempre preguntar dudas antes de asumir algo
- Solo actuar con visto bueno del usuario
- Al final de cada sesión donde se hagan cambios de código: actualizar `CLAUDE_LOG.md` con la fecha, qué se cambió y por qué, y el commit hash. Luego incluirlo en el push a GitHub.

## Deploy

- La app vive en **Google Cloud Run** (`rateapp`, región `us-east4`, proyecto `rateapp-506404`) conectado a **GitHub** (`cruzangelramirez26/RateApp2`, rama `main`) vía Developer Connect + Cloud Build
- URL: `https://rateapp-1043427819721.us-east4.run.app`
- **El backend SIEMPRE corre en la nube, nunca en local. No preguntar dónde corre.**
- Render (`rateapp2.onrender.com`) está **suspendido** desde el 2026-08-25 y ya no sirve de respaldo: la rotación de la contraseña de MySQL lo dejó sin acceso a la base. Revivirlo exigiría actualizarle la variable a mano.
- `MYSQL_PASSWORD` **no** es una variable de entorno en texto plano: sale de Secret Manager (`mysql-password:latest`). Para rotarla: crear una versión nueva del secreto y redesplegar el servicio, porque el valor se resuelve al arrancar la instancia, no al leerlo. `SPOTIPY_CLIENT_SECRET` y `SECRET_KEY` **sí** siguen en texto plano.
- Cualquier archivo escrito en disco desaparece al reiniciar — **toda persistencia va a MySQL**
- Después de cada cambio: `git add` archivos modificados → `git commit` → `git push origin HEAD:main`
- Cloud Build compila y redespliega automáticamente al detectar el push. El token de Spotify vive en MySQL (tabla `config`, clave `spotify_token`), así que **la sesión sobrevive al redeploy**. Solo hay que re-loguear cuando se agrega un scope nuevo, y en ese caso `validate_token` lo fuerza solo.

## Base de datos MySQL

Cuatro tablas:

**`tracks`** — track_id, name, artist, album, added_at, rating, manual_order, cuatrimestre_override
- `added_at`: fecha de primera calificación. **Nunca se pisa al re-calificar** (upsert solo la escribe en INSERT, no en UPDATE).
- `cuatrimestre_override`: NULL por defecto. Se pone cuando una canción se migra a otro cuatrimestre o cuando una canción histórica sube a TOP_SET y se agrega al cuatrimestre actual.

**`config`** — key/value para config persistente (ej: `aplus_cutoff`)

**`listening_stats`** — escuchas reales: track_id, name, artist, plays, skips, ms_total, first_played, last_played
- Spotify **no expone play counts por API**. Estos datos salieron del export de "Historial de reproducción extendido" (187,577 reproducciones, 2018–2026 → 23,914 canciones) y se mantienen al día con `POST /tracks/listening/capture`, que lee `recently-played`.
- **Quién dispara la captura: Cloud Scheduler** (job `capture-listening`, región `us-east4`), **cada 15 min**. El workflow de GitHub Actions quedó degradado a red de seguridad cada 6 h porque el cron de Actions se atrasaba de 2 a 5 horas. Importa: `recently-played` solo devuelve **las últimas 50** reproducciones (~2.9 h de escucha seguida), así que un hueco largo pierde historial de forma irreversible.
- El POST **debe llevar `Content-Length`**. Cloud Run responde `411` a un POST sin body, así que `curl` va con `--data ''` y Cloud Scheduler con `--message-body='{}'`.
- **Es independiente de `tracks` a propósito.** `load_all()` no la toca y ninguna query existente cambia, así que no afecta los tiempos de carga.
- **REGLA: nunca `get_listening()` dentro de un loop.** La DB está en `us-east-1` (~80 ms por viaje), así que 500 canciones a query por cabeza son 40 segundos. Para listas se usa `get_listening_many()`, con un solo `IN (...)`.
- Los JSON crudos del export viven en `historial/`, que está en `.gitignore` **y** `.dockerignore`: son 156 MB y cada fila trae `ip_addr`.

**`listening_events`** — la **serie temporal**: una fila por reproducción (track_id, played_at, ms_played, match_key)
- Existe porque `listening_stats` es un **agregado** y no puede contestar *"cuántas veces la escuché en los últimos 30 días"*: suma sin guardar cuándo pasó cada cosa. El síntoma es engañoso — una canción con 200 plays en 2021 y **una sola vez ayer** se ve tan reciente como una que suena 50 veces este mes.
- **PK compuesta `(track_id, played_at)` + `INSERT IGNORE`.** Ahí vive la idempotencia: la captura corre cada 15 min y siempre re-ve reproducciones ya guardadas. El doble conteo es silencioso y permanente, así que se cierra en el **esquema**, no en la lógica.
- **Guarda `match_key`, igual que `listening_stats`.** Toda consulta de ventana agrupa por clave, nunca por `track_id` — cruzar por id ya costó ~12,000 reproducciones perdidas una vez.
- **Mismo umbral de 30 s** que el agregado, a propósito: así `COUNT(*)` de una ventana significa exactamente lo mismo que `plays`, y los dos números nunca se contradicen entre pantallas.
- Consultas: `get_top_window(dias, limit)` para las más escuchadas de una ventana (`dias=None` → histórico) y `get_window_plays_for(tracks, dias)` para listas. **Las dos resuelven en 2 queries, nunca N+1** — la misma regla del `us-east-1`.
- Tabla **angosta y separada**: no duplica name/artist (viven en `listening_stats`), `load_all()` no la toca y ninguna query existente cambia.
- Se rellena con `backend/scripts/import_eventos.py`, hermano de `import_historial.py`: local, con la contraseña en `$env:MYSQL_PASSWORD`, y es idempotente. Son ~118,729 eventos.
- **Ventanas que NO existen del lado de Spotify:** `/me/top/tracks` solo da `short_term` (~4 semanas), `medium_term` (~6 meses) y `long_term`. **No hay ventana de 12 meses**, así que "el último año" solo se puede calcular para Angel, con esta tabla.

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
| Canción actual | Agrega a cuatri actual + MMG + Galería + like | Sale de MMG + Galería + unlike. **B y C+ se agregan al cuatri actual; C se elimina del cuatri** | Sale de cuatri + MMG + Galería + unlike |
| Canción histórica | Agrega a cuatri **actual** + MMG + Galería + like + pone override | Solo sale de MMG + Galería + unlike (cuatri histórico intocable) | Sale de cuatri actual si estaba + MMG + Galería + unlike (cuatri histórico intocable) |

### Playlists históricas = INTOCABLES
Las playlists de cuatrimestres pasados (ej. Perla cuando estamos en Miel) **nunca se modifican** al re-calificar. Solo se tocan MMG, Galería Anual, el cuatrimestre actual, y Me Gusta nativo.

### Backfill: catalogar los Me Gusta viejos
`POST /tracks/rate` acepta **`added_at`** opcional. Lo usa la cola de
`/backfill` (`GET /tracks/backfill/queue`) para fechar cada cancion con su
**primera escucha real** en vez de con hoy.

**Por que importa:** 1,520 de los 1,537 Me Gusta sin calificar son de antes de
2026. Fechados hoy entrarian todos a Latte 2026 y a la Galeria Anual — y encima
arriba de todo, porque el bloque de novedades los veria recien llegados —
ademas de arruinar la medicion de A+/A de latte 2026 (seccion 6b).

Dos acciones, y el default es el seguro:
- **Calificar** -> `soft=true` + `added_at` historico. Solo cataloga: no toca
  ninguna playlist.
- **A mi rotacion** -> `rate_track` normal. Como la cancion quedo fechada en su
  epoca, la logica de "historica que sube a TOP_SET" ya hace lo correcto:
  cuatrimestre actual + MMG + Galeria + like + override.

**OJO al tocar `rate_track`:** desde que existe `added_at`, una cancion **nueva**
tambien puede nacer historica. Por eso la logica usa la variable `efectivo`
(`old_track` o la fecha recien insertada) y no `old_track is None`. Con lo
segundo, una A+ fechada en 2021 no recibiria `cuatrimestre_override` y
`rebuild/anual` la sacaria de la Galeria donde se acaba de agregar.

### EMPAREJAMIENTO POR NOMBRE+ARTISTA (no solo por track_id)
**Spotify le da IDs DISTINTOS a la misma cancion** segun el album, el mercado o
la reedicion. El id del export de historial no siempre es el que hoy tiene esa
cancion en Me Gusta, asi que cruzar solo por `track_id` PIERDE reproducciones.

Medido con los datos reales: **17 canciones marcaban 0 escuchas habiendolas
escuchado** (LUCES DE COLORES decia 0 y tenia 19) y **884 salian subcontadas**;
en total se perdian **~12,000 reproducciones**. Lo detecto Angel comparando
contra stats.fm.

`listening_stats.match_key` guarda `utils.listening_key(name, artist)` y
`database.get_listening_for(tracks)` **SUMA todas las filas que comparten esa
clave**. Toda vista de lista usa esa funcion, nunca `get_listening_many`.

La normalizacion es **conservadora a proposito**: minusculas, acentos,
invisibles (el export trae U+2060) y puntuacion, y nada mas. Se probo truncar
en " - " o " (feat" y fusionaba `Punto G (Remix)` con `Punto G (feat. Darell)`,
que son canciones distintas. **No la hagas mas agresiva.**

`POST /tracks/listening/reindex` repuebla la clave sin re-correr el import.

**En la UI, `0` y "sin dato" NO son lo mismo** y confundirlos es peligroso: las
sin dato encabezaban la lista de limpieza, o sea eran las primeras candidatas a
borrar. Las colas devuelven `sin_datos` y la UI muestra `?`, no `0`.

### Limpieza de Me Gusta
`GET /tracks/cleanup/queue` — **TODOS** los Me Gusta con sus escuchas, sin
filtrar y ordenados de menos escuchada a mas. El frontend ordena y corta.

**EL UMBRAL LO PONE ANGEL, NO EL BACKEND, y hay una razon.** Aqui se afirmo
que "las menos escuchadas no existen" y **estaba mal medido**: se miro el
umbral 0-2 plays (34 canciones). Con la mediana de sus Me Gusta en **20**
escuchas, 5 SI es casi nada — hay **115** asi y **405** con 10 o menos (17%).
Angel tenia razon y lo dijo dos veces. Un umbral absoluto no sirve para juzgar
una distribucion que no se conoce: se le da la lista ordenada y el corta.

`GET /tracks/abandoned/queue?meses=&min_plays=` — la otra mitad del problema:
las que se escucharon mucho y llevan N meses sin sonar (metrica de recencia).
Sigue vivo, pero la UI ya no lo usa: `cleanup/queue` trae `meses_sin_oir` y el
frontend ordena por eso.

`POST /tracks/unlike` — la **unica accion destructiva de la app**. Nunca se
dispara sola: sale siempre de una seleccion explicita, la UI pide confirmacion,
y el tope son 200 por llamada. **No escribe ninguna calificacion a proposito**:
abandonada no es lo mismo que mala, y marcar estas canciones con un rating
seria poner en la DB un juicio que el usuario no hizo.

`POST /tracks/backfill/playlist?source=backfill|abandoned` — arma una playlist
REAL con las primeras N de la cola y la reproduce, para no ir cancion por
cancion. **Reutiliza siempre la misma playlist** (su id vive en `config`), asi
que reemplaza el contenido en vez de dejar una playlist nueva cada vez. Si la
borras desde Spotify, se recrea sola.

**OJO con el widget de Now Playing del sidebar:** califica con el flujo
completo y sin fecha, asi que usarlo mientras suena la cola de backfill meteria
la cancion al cuatrimestre actual. Por eso `/backfill` tiene su propio panel de
"sonando ahora" con los botones correctos.

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
