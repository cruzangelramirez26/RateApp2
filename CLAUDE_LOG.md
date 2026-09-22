# Changelog de sesiones

---

## 2026-09-21 (sesion: la app de escritorio deja de ser un cascaron)

**Maquina: PC `AngelPC`.** Segunda tanda del dia. Angel: *"me gustaria seguir
lo de que sea app nativa de pc"*, o sea la fase 1 de Tauri que quedo abierta el
2026-08-25 — bandeja, arranque con Windows e instalador, **nunca probado**.

**Tres decisiones suyas, preguntadas antes de tocar codigo:**

| | Se recomendo | Eligio |
|---|---|---|
| Icono | el badge A+ verde del sidebar | **dejar el generico por ahora** |
| La X | ocultar a la bandeja | **ocultar a la bandeja** |
| Autostart | instalarlo apagado | **instalarlo apagado** |

**EL DETALLE DE ARQUITECTURA QUE MANDO EL DISENO:** la ventana carga una **URL
remota** (Cloud Run), no archivos locales. Exponerle comandos de Tauri a esa
pagina exigiria abrirle permisos al origen remoto en las capabilities. Por eso
**toda la configuracion vive del lado de Rust**, en el menu de la bandeja: no se
toca el frontend y no se le abre puerta a la pagina.

**LO CONSTRUIDO** (`desktop/src-tauri/src/lib.rs`, de 16 lineas a 133):

- Bandeja con menu **Mostrar RateApp / Iniciar con Windows / Salir**, y clic
  izquierdo para traer la ventana.
- **La X oculta, no cierra** (`prevent_close` + `hide`). Salir de verdad es la
  opcion del menu.
- **`tauri-plugin-autostart`, apagado de fabrica.** La casilla **lee el
  registro** en cada clic en vez de invertir su propio valor: si la escritura
  falla, o si Angel quita la entrada desde el Administrador de tareas de
  Windows, la casilla no miente.
- **`tauri-plugin-single-instance`, que no venia en ninguna peticion y es
  consecuencia directa de la decision #2:** con la ventana oculta, volver a
  abrir el acceso directo lanzaria una **segunda instancia** — dos iconos en la
  bandeja y la ventana vieja perdida. Ahora la nueva muere y trae al frente la
  que ya corria.
- **Arranque por Windows != doble clic.** El plugin registra un argumento
  propio (`--iniciado-por-windows`), y con el la app **se queda en la bandeja**
  en vez de saltar a la cara. Es lo que se espera de un arranque automatico.

**BUG QUE SOLO APARECE AL EMPAQUETAR:** el instalador copiaba **`app.exe`** tal
cual — el nombre del crate de Cargo. O sea el proceso se veria como "app.exe"
en el Administrador de tareas y el autostart registraria **ese** nombre en el
registro, aunque los accesos directos dijeran RateApp. Arreglado con
`mainBinaryName`. Solo se ve mirando el `main.wxs` que genera WiX; el `tauri
dev` de agosto jamas lo habria delatado.

**LA PRUEBA ESTABA MAL MEDIDA, Y CASI CUESTA DOS CAMBIOS INVENTADOS.** La
comprobacion de "arranca escondido" fallaba: con el argumento de autostart la
ventana **parecia** salir a la cara. Se cambio la config dos veces para
arreglarlo (`visible: false`, luego `focus: false`) y **seguia fallando**, que
fue la senal de que el diagnostico estaba mal.

Al enumerar las ventanas top-level del proceso en vez de creerle a PowerShell:

```
clase 'Tauri Window'            titulo 'RateApp'   visible=False   <- la real
clase 'com.angelrg.rateapp-sic' titulo '...-siw'   visible=True    <- la falsa
```

**La segunda es la ventana de mensajes del plugin single-instance.** Es
top-level y siempre visible, y `Process.MainWindowHandle` de .NET la toma como
"la ventana principal" **justo cuando la verdadera esta oculta** — o sea el
falso positivo aparece exactamente en el caso que se queria probar. El codigo
funcionaba desde la primera version.

Es el mismo patron que ya mordio el 2026-09-04 y el 2026-09-09 ("una prueba
fallo y la equivocada era la prueba"), pero con una vuelta nueva que conviene
anotar: **aqui el instrumento de medicion elegia solo cual ventana mirar**. La
leccion: cuando una prueba de UI falla, primero comprobar que esta mirando el
objeto que cree.

De los dos cambios, `focus: false` se **revirtio** (no hacia nada demostrable) y
`visible: false` se **conservo**: nacer invisible y mostrarse en el setup hace
imposible el parpadeo de un frame en el arranque automatico, mientras que
ocultar despues lo deja abierto.

**Verificacion: 11 comprobaciones contra el binario RELEASE**, no el de dev, y
midiendo la ventana por su clase real. Las que importan: la X **no mata el
proceso** y si oculta la ventana; la segunda instancia deja **1 proceso** y
reabre la ventana; con el argumento de autostart el proceso vive y la ventana
**no se ve**; y el registro `HKCU\...\Run` **sigue sin entrada** despues de
todo, o sea el plugin no se auto-activa. 11 de 11.

**LOS INSTALADORES, POR PRIMERA VEZ:**

```
RateApp_0.1.0_x64-setup.exe   1.9 MB   (NSIS)
RateApp_0.1.0_x64_en-US.msi   2.9 MB   (WiX)
```

El primer `tauri build` se descarga solo WiX 3.14 y NSIS 3.11; no habia que
instalar nada a mano. Salen al target-dir de fuera de OneDrive, asi que **no
tocan el repo ni la cuota de sincronizacion** — el arreglo del 2026-08-25
sigue haciendo su trabajo.

**LO UNICO SIN VERIFICAR, y es honesto decirlo:** los **tres items del menu de
la bandeja** necesitan un clic humano. El que importa es *Iniciar con Windows*,
porque es el unico camino que **escribe en el registro de Windows**. Queda para
que Angel lo pique y se confirme mirando `HKCU\Software\Microsoft\WindowsCurrentVersion\Run`.

**OJO AL PRENDERLO:** el autostart registra **la ruta del ejecutable que esta
corriendo**. Si se prende desde el `RateApp.exe` del directorio de compilacion
y despues se instala en Program Files, el registro apunta a la ruta vieja. Hay
que prenderlo **desde la app instalada**.

Commits `b9c6013` y este log.

**PENDIENTES DE LA APP NATIVA:**

- [x] **Bandeja, cerrar-a-bandeja, autostart e instalador.** Fase 1 cerrada.
- [ ] **Picarle a "Iniciar con Windows"** y confirmar la entrada del registro.
- [ ] **Icono propio.** Sigue el generico de Tauri. Cuando Angel diga, sale del
      badge A+ (`#1DB954`) o de una imagen suya.
- [ ] Fase 2: teclas multimedia globales. Los endpoints del player ya existen;
      es trabajo de Rust. **El Spotify de escritorio ya captura esas teclas** y
      ahi suele estar el conflicto.
- [ ] Fase 3: ventana flotante always-on-top que reemplace el PiP. **Sigue
      bloqueada por la seccion 3**: necesita una ruta `/player` de verdad, y
      hoy el PiP se genera con cadenas de HTML dentro de `NavBar.jsx`.
- [ ] Android con Capacitor, sin empezar.

---

## 2026-09-21 (sesion: los dos bugs que ya se veian en produccion)

**Maquina: PC `AngelPC`.** Doce dias sin tocar el repo. Angel abrio con "en que
nos quedamos?" y, al repasarle los pendientes, con "dale los dos": los dos
arreglos que la sesion del 9 dejo **propuestos y sin respuesta**.

**Antes de tocar nada se midio produccion, y de ahi salio un dato bueno:**

```
/health          200 en 0.22 s
/auth/status     autenticado, Angel RG
eventos          118,203   (117,827 el 7 sep)
agregado         119,245 plays
ultima escucha   el mismo dia
```

La diferencia agregado/eventos sigue siendo **exactamente 1,042**, la misma que
el 7 de septiembre. O sea **no hay deriva nueva**: el cron escribe las dos
tablas a la par y la idempotencia de la PK se sostiene sola desde entonces. Es
la unica forma de comprobarlo sin volver a contar todo.

**1) EL POOL DE 5 ERA UN 500 EN PRODUCCION.**

`App.jsx` dispara 9 peticiones en paralelo al arrancar contra un pool de **5**,
y cada endpoint sincrono de FastAPI corre en su propio hilo, o sea toma una
conexion. Las rafagas de `PoolError: pool exhausted` dentro de `load_all()`
estan en los logs del 5, 6, 8 y 9 de septiembre.

`pool_size` 5 -> **16**. **Pero el numero solo no cierra el hoyo, y eso es lo
que hace el arreglo distinto del propuesto:** 32 es el tope duro de
`mysql.connector` (`CNX_POOL_MAXSIZE`, verificado en la version instalada) y el
threadpool de FastAPI son **40 hilos**, asi que puede pedir mas conexiones de
las que el pool puede tener **jamas**. Subir a 16 solo mueve el umbral.

Por eso ademas se reintenta (`_acquire`, 4 intentos x 150 ms):
`get_connection()` **no espera** — falla en el acto cuando el pool esta vacio.
Pero una rafaga se drena en milisegundos, porque cada conexion vuelve al pool
al terminar su query. Esperar 0.45 s en el peor caso es mejor que un 500.

**El pool agotado de verdad sigue levantando el error, a proposito:**
reintentar para siempre esconderia una fuga de conexiones, que es peor que un
500 porque no se entera nadie.

**2) "LA PLAYLIST DE LAS MENOS ESCUCHADAS NO SE HACE". SI SE HACIA.**

Ya estaba diagnosticado el 9: el endpoint respondio **200 las tres veces** que
Angel le pico y armaba la playlist en 0.5 s; lo que falla es la reproduccion,
porque sin dispositivo activo `start_playback` no tiene donde sonar. Y lo que
volvia el fallo invisible: el backend devuelve el link en `spotify_url` y **el
frontend lo tiraba a la basura**, asi que la playlist quedaba armada con su
tramo exacto y sin forma de llegar a ella.

`frontend/src/components/QueuePlaylistLink.jsx` (nuevo) es un banner que **se
queda** con "Abrir en Spotify". Solo aparece cuando `playing` viene en false:
si ya esta sonando seria ruido.

**DOS COSAS QUE CORRIGEN EL DIAGNOSTICO DE LA SESION PASADA**, las dos por
haber leido el codigo en vez de fiarse del log:

- **El toast SI existe y SI dice el error.** `r.error || 'Playlist lista, pero
  no se pudo reproducir'`, en rojo, 5 s. La pregunta que quedo abierta —"¿sale
  algun mensaje **abajo**?"— estaba mal planteada: el toast sale **arriba a la
  derecha** (`.toast-container` es `top: 16px; right: 16px`). Lo mas probable
  es que Angel si lo vio. Asi que el banner **no reemplaza** al toast, lo
  complementa: el toast se va en 5 s y el link tiene que sobrevivir a eso.
- **Son DOS paginas, no tres.** El log del 9 decia "las tres paginas de colas";
  `AbandonedPage` ya no existe, la reemplazo `CleanupPage` el 2026-09-04. Solo
  `BackfillPage` y `CleanupPage` llaman a `buildQueuePlaylist`, y hay una
  prueba que lo fija.

**3) BUG QUE NO VENIA EN NINGUNA QUEJA, y estaba en el mismo boton.**

`BackfillPage:218` tenia `onClick={escuchar}`, asi que React le pasaba **el
evento** como parametro `desde`:

```js
lista.slice(evento, evento + 50)   // -> slice(NaN, NaN) -> []
`#${evento + 1}`                   // -> "#[object Object]1"
```

No se veia roto porque el backend cae a "las primeras 50 de la cola" cuando
`track_ids` llega vacio — pero eso **ignora el filtro de "solo activas"**, o
sea el boton no mandaba el tramo que Angel estaba viendo, que es justo lo que
se construyo el 2026-09-04. Se comprobo en node, no de memoria.

**Verificacion: 37 comprobaciones, sin red y sin MySQL** (12 del pool con la
capa de `mysql.connector` stubeada + 25 del cableado del link). Las que
importan: las **9 peticiones en paralelo** que tumbaban produccion pasan sin
`PoolError`; **40 hilos contra 16 conexiones** no revientan ninguna y el pool
queda intacto al final; el pool agotado de verdad **si** levanta el error y lo
intenta 4 veces, no 1; la conexion vuelve al pool aunque la query truene; el
banner **no** sale cuando si esta sonando; un fallo de red limpia el banner
viejo en vez de dejar un link muerto; y el `slice` con el evento da array
vacio. El import se probo contra **mysql-connector-python 9.0.0**, la version
fijada en `requirements.txt` — la misma que corre en Docker, no la ultima.
`npm run build` OK (1590 modulos).

**UNA PRUEBA FALLO Y LA EQUIVOCADA ERA LA PRUEBA** (el patron de siempre aqui):
buscaba `onClick={escuchar}` y pegaba con el **comentario** que explica el
arreglo. Es el mismo falso positivo de "Savia" del 2026-09-09. Ahora busca el
atributo en una linea de JSX real, o sea dato y no prosa.

**VERIFICADO EN PRODUCCION, y el pool con los logs en la mano.** El deploy
subio en ~2:30. El bundle se comprobo por **hash de contenido**: Vite nombra el
archivo por lo que contiene, asi que servir `index-BVduuoHR.js` — el mismo hash
que salio del build local — es la prueba de que el frontend nuevo esta arriba y
no una revision vieja. Ademas se confirmo que la cadena `"Abrir en Spotify"`
viaja dentro del bundle servido: el hash dice que el archivo cambio, la cadena
dice que cambio **por esto**.

El pool se probo **reproduciendo la rafaga que lo tumbaba**, contra produccion:

```
16 peticiones en paralelo a /tracks/stats   ->  16 de 16 en 200, max 0.63 s
40 peticiones en paralelo (el threadpool)   ->  40 de 40 en 200
```

Con el pool de 5, 11 de las primeras 16 habrian recibido `PoolError` en el
acto. Y el detalle que hace la prueba fuerte: las 56 peticiones las atendieron
**2 instancias**, o sea al menos una vio **mas peticiones concurrentes que
conexiones en su pool** — el reintento no quedo de adorno.

**HISTORIAL DE `PoolError` EN CLOUD RUN, 25 dias:**

```
8   2026-09-05
1   2026-09-06
3   2026-09-09
4   2026-09-15   <- 17:25:13, las cuatro en el MISMO segundo
0   hoy, con 56 peticiones disparadas a proposito
```

**El del 15 de septiembre no lo sabia nadie**: es posterior a la sesion que
diagnostico el problema, o sea el 500 siguio vivo seis dias mas despues de
quedar "propuesto sin respuesta". Las cuatro en el mismo segundo son la firma
de la rafaga, la misma de los dias 5 y 9.

**Y UN FALSO NEGATIVO QUE CASI SE PUBLICA COMO VERIFICACION.** La primera
consulta de logs devolvio **0 `PoolError` en 20 dias**, lo cual encajaba
sospechosamente bien con "ya esta arreglado". Antes de creerselo se pidio lo
contrario —que la consulta encontrara los `PoolError` **viejos**, que tienen
que estar ahi— y tambien salio 0. Ahi se vio: `gcloud` **nunca corrio**. Su
ruta tiene un espacio (`...\Google\Cloud SDK\...`), se partio al invocarla
desde bash, y `2>/dev/null` se tragaba el error; lo que se estaba contando eran
lineas de un mensaje de error. Corrido por PowerShell con el operador `&`,
aparecieron los 16 de arriba.

**La leccion, que es la version dura de la regla del 2026-09-02:** un resultado
**vacio** no verifica nada por si solo. Hay que comprobar que la consulta
encuentra lo que **si** deberia estar antes de creerle que no encuentra lo que
no deberia. Un comando que falla y un sistema sano se ven exactamente igual.

Commits `feee449` y `68f77c2`.

**4) LOS NOMBRES DE 2026, Y LAS PORTADAS DEJAN DE SER ARCHIVOS DEL REPO.**

Angel: *"ya le puse los nombres, se los cambie en spotify"*, con captura de su
biblioteca. **Pero la app no lee los nombres de Spotify**: desde el 2026-09-09
`config.CUATRI_NOMBRES` es la fuente unica, y seguia diciendo Perla/Miel/Latte.
O sea las etiquetas y sus playlists reales estaban desincronizadas en ese
momento.

**El mapeo no se adivino.** Se cruzaron los ids de `DISTRIBUTION_PLAYLISTS`
contra `/playlists/mine`, o sea contra su propia cuenta:

```
perla  41CXGh7OcFkplIo6BF44OJ  ->  "2026 PT.-1"
miel   5pFFpx2dYnfUdOKW4WBN3y  ->  "2026 PT.-2"
latte  3DltKEaaDVOchGxfIQlPu9  ->  "2026 PT.-3"
```

**LO QUE NO VENIA EN SU MENSAJE, y salio de ampliar la captura** (recortar los
thumbnails a 260 px): **solo cambio el arte de PT.-3**. PT.-1 sigue con las
conchas y PT.-2 con el frasco de miel — y esas dos imagenes tienen la palabra
vieja **PINTADA DENTRO**. La de PT.-3 es nueva, oscura, y **no existia del lado
de la app**: el repo tenia la taza de cafe de `Latte.jpg`.

O sea los archivos de `frontend/public/portadas/` ya se habian desincronizado
solos. **Por eso la portada ahora sale de Spotify** (`get_playlist_covers`, con
`sp.playlist_cover_image`) y esos archivos pasan a ser **respaldo**. Angel
cambia la portada alla y la app la refleja sin que nadie copie nada.

**TRES DECISIONES SUYAS, preguntadas antes de tocar codigo:**

| | Se recomendo | Eligio |
|---|---|---|
| Etiqueta | `PT.-1` sin el anio | **`2026 PT.-1`, calco de Spotify** |
| Portadas | de Spotify | **de Spotify** |
| Colores | solo cambiar el de PT.-3 | **solo el de PT.-3** |

En la etiqueta fue contra la recomendacion y su razon vale: no traducir
mentalmente entre la app y Spotify. El costo, que se le dijo antes: la tarjeta
del Dashboard imprime `2026 PT.-1` con `sep-dic 2026` justo debajo, o sea el
anio dos veces, y la fila de chips de Biblioteca repite "2026" tres veces.

**DOS LIMITES QUE QUEDARON ESCRITOS EN EL CODIGO:**

- **Solo el anio ACTUAL.** `DISTRIBUTION_PLAYLISTS` son las tres playlists de
  este anio; de los pasados la app **no guarda ningun id**, asi que no hay a
  quien preguntarle la portada. 2025 se queda con sus archivos locales, y eso
  es correcto: ese arte ya no cambia.
- **ADITIVO Y NO-FATAL, y es el riesgo de verdad de este cambio.** Hasta hoy
  `/playlists/distribution` **no tocaba Spotify**, o sea respondia incluso sin
  token — y es el que lleva el mapa de **NOMBRES** que `App.jsx` primea al
  arrancar. Si se le mete una llamada a Spotify sin red de seguridad, un token
  muerto deja la app **sin nombres**. El `try` envuelve **tambien al
  `get_client()`**, no solo a la llamada de portadas.

**EL DETALLE QUE HACIA FALTA PENSAR: `img: None` explicito.** PT.-3 no tiene
respaldo local a proposito — su arte viejo era la taza de cafe y ya no es su
portada, asi que **mostrarla seria peor que no mostrar ninguna**. Para eso
`cuatri_info` usa `"img" in info` y **no** `or`: con `or`, un `None` se caeria
al path derivado `/portadas/{anio}/{nombre}.jpg`, que ademas ya no existe para
un nombre como `2026 PT.-1`. El frontend tiene el mismo cuidado (`'img' in
info`, no `??`).

**EL COLOR DE PT.-3: `#d04e54`, muestreado del arte real.** El dominante crudo
salio `#7a2025` con **L=0.30**, y ahi se vio el problema: la portada es casi
toda negra —**194 de 6400 pixeles** tienen color usable— asi que el promedio
habria dado un acento **invisible sobre el tema oscuro**. Se conservo el tono
del carmin de las flores (H=357) y se subio a L=0.56. Medido contra los dos
fondos:

```
                claro    oscuro
#d04e54 (PT.-3)  3.89:1   4.05:1   <- el nuevo
#5ba8d4 (PT.-1)  2.39:1   6.61:1
#f5c542 (PT.-2)  1.47:1  10.70:1
```

O sea el nuevo queda **mejor balanceado que los que ya estaban en produccion**.
PT.-1 y PT.-2 conservan el suyo porque su arte no cambio.

**RESIDUO DEL REFACTOR, encontrado con un grep:** `StatsPage.jsx` tenia
`CUATRI_LABEL = {perla: 'Perla', miel: 'Miel', latte: 'Latte'}` como respaldo
de la etiqueta. Hoy no se dispara nunca (`cuatriInfo` siempre devuelve un
nombre), pero desde que el nombre visible **ya no es** el identificador,
imprimiria un nombre **falso** si alguna vez lo hiciera. Es el bug de los cinco
mapas duplicados del 2026-09-09, en version latente. Fuera.

`frontend/public/portadas/2026/Latte.jpg` queda sin referencias. No se borro:
es arte suyo y no molesta.

**Verificacion: 35 comprobaciones nuevas**, sin red y sin MySQL. Las que
importan: **el identificador no se movio** (septiembre sigue devolviendo
`latte`, las claves del mapa siguen siendo `perla/miel/latte`, o sea
`cuatrimestre_override` intacto, y ningun "PT" se colo como identificador);
`/distribution` **sin Spotify** sigue trayendo los tres nombres y no revienta,
ni cuando falla `get_client()` ni cuando falla la llamada de portadas; una
playlist que truena **no tumba a las otras dos**; PT.-3 no inventa
`/portadas/2026/2026 PT.-3.jpg`; y 2025 no se toca. Las 37 de la tanda anterior
siguen verdes: **72 en total**. `npm run build` OK (1590 modulos).

**VERIFICADO EN PRODUCCION:** los tres nombres, las tres portadas saliendo de
Spotify y respondiendo `200 image/jpeg`, 2025 sin moverse
(`/portadas/2025/Savia.jpg`) y `actual` seguido en `latte`.

**Y AHI SE VIO UN DESCUIDO PROPIO:** `images[0]` es la variante **mas grande**,
o sea 640 px y ~100 KB para pintar una tira de **90 px de alto** — por tres
cuatrimestres, en el primer paint del Dashboard y en un telefono. La de 300 px
pesa un tercio y a ese tamano se ve igual incluso al doble de densidad. Medido
despues del arreglo:

```
              antes    despues
2026 PT.-1    174 KB    44 KB
2026 PT.-2    170 KB    43 KB
2026 PT.-3    102 KB    32 KB
              446 KB   120 KB
```

**El caso que habria reventado:** para una portada subida a mano Spotify a
veces manda `width: null`. Sin tamano no se puede elegir, asi que cae a la
primera — el comportamiento de antes. 10 comprobaciones solo para esa funcion.

Commits `f590b5f`, `e847032` y `21813fb`. **82 comprobaciones** en la sesion.

**5) LAS VENTANAS DE ESCUCHA, USADAS POR FIN.**

La tabla `listening_events` se lleno el 2026-09-07 con 118 mil reproducciones y
llevaba **dos semanas** sin que ninguna pantalla la tocara — el pendiente que
se venia arrastrando como "lo mas barato que queda con valor visible". Angel:
*"que ventanas? pero dale"*. O sea no se acordaba de que eran, asi que primero
se le explico con sus propios datos y luego se construyo.

**QUE SON, dicho corto:** `listening_stats` guarda **totales**, asi que no
puede contestar "que traes escuchando". Una cancion con 200 plays en 2021 y
**una sola vez ayer** se ve igual de reciente que una que suena 50 veces este
mes. `listening_events` guarda **cuando** paso cada reproduccion, asi que si
puede. Es lo que Angel pidio el 2026-09-06 para el mix — y **la version de un
solo usuario no necesita nada de la cirugia de auth** que lo bloquea.

**Lo construido:** pantalla `/window` ("Mis mas escuchadas"), con cuatro
ventanas —30 dias, 90, un anio, historico—, y por cancion: puesto, portada,
plays **de esa ventana**, horas, desde que anio la escucha y cuantas veces en
total. Filtro de texto, "solo sin calificar", los 7 botones de calificar, y
**"Escuchar 50"**, que arma la playlist real de ese periodo. O sea el mix.

Entra por **Herramientas**, sin tab propia: la barra movil ya tiene 5 items.
Es la misma decision que se tomo con `/backfill`.

**LA TRAMPA QUE HABRIA ARRUINADO LA PANTALLA, y es la razon de la mitad del
codigo.** El `first_played` que devuelve `get_top_window` es la primera escucha
**DENTRO de la ventana**, o sea a lo mas 30 dias atras. Calificar con esa fecha
una cancion que Angel descubrio en 2019 la vuelve **nueva** para `rate_track`:
cuatrimestre actual + Galeria Anual + Me Gusta, y encima **arriba de todo** por
el bloque de novedades.

Es exactamente el desastre del 2026-09-04 — y **desde esta pantalla seria
PEOR**, porque las de aqui son justo las que mas suenan, o sea las que Angel
mas querria calificar. El backend manda `suggested_added_at` con la primera
escucha **de verdad**, que sale del agregado en **una** query
(`get_listening_for`, que suma por `match_key`). La pantalla califica siempre
en **soft** y con esa fecha, igual que `/backfill`.

**Y quedo fijado por prueba:** hay comprobaciones que **fallan** si alguien
cambia `rateTrackSoft` por `rateTrack`, si quita `added_at`, o si manda `null`
en vez de `undefined` (mandar null fecharia en hoy). La pantalla ademas pinta
el anio de la primera escucha, que es el dato que hace visible por que
calificar ahi es seguro.

**BUG PROPIO QUE ATRAPO LA VERIFICACION, y estaba en CINCO LUGARES MAS.** La
prueba de la ventana fallo con `rating: 'None'` — la **cadena**. El rating se
limpiaba con `str(v).strip()` y un filtro contra `"nan"`, pero un rating NULL
llega del DataFrame como `NaN` **o** como `None` segun el dtype que pandas le
infiera a la columna, y `str(None)` da `"None"`, que es **verdadera** y pasa el
filtro. Consecuencia: la UI pintaria "None" como si fuera una calificacion y el
filtro de "solo sin calificar" dejaria de encontrar esas canciones.

Con `"nan"` ya habia pasado el 2026-05-01 (el filtro `!= "D"` dejaba pasar los
NULL) y se tapo **en seis sitios por separado**; `"None"` era el mismo bug sin
tapar, esperando el dtype adecuado. Ahora hay un solo `_rating_limpio()` y los
seis lo usan, y cubre `None`, `NaN`, `"nan"`, `"None"`, `"null"`, `"<NA>"` y
los espacios.

**Detalles que evitan bugs conocidos:**

- La playlist de la ventana tiene su **propia clave en `config`**. Si
  compartiera la de limpieza, abrir una vista pisaria la playlist que la otra
  dejo sonando — la regla del 2026-09-04.
- Reusa `QueuePlaylistLink`, el banner de esta misma sesion, para el caso de no
  haber dispositivo. No se reinvento el manejo del fallo.
- Las portadas van en **un solo `sp.tracks()`** por lote de 50, nunca una
  llamada por cancion, y con `images[-1]` porque son miniaturas. Y es
  **no-fatal**: sin Spotify la lista sale igual, porque los numeros son de
  MySQL.
- **Una clave de cache por ventana** (`window_30`, `window_90`...): son
  consultas distintas y cambiar de pestana no debe volver a esperar la que ya
  se pidio.
- Los botones por fila mandan **su indice**, no el evento. Es el bug que se
  arreglo hoy mismo en `BackfillPage`, no repetido aqui.

**Verificacion: 61 comprobaciones nuevas** (36 del backend + 25 del cableado),
sin red y sin MySQL. Las que importan: la fecha sugerida sale del **agregado**
(2019) y no de la ventana (2026), con el caso peligroso metido a proposito en
los datos de prueba; `plays` es el de la ventana y el total viaja aparte; una
sola llamada a `sp.tracks` para toda la lista; sin Spotify la lista sale igual;
`dias=0` se traduce a `None`; si el agregado no tiene fila cae a la de la
ventana y **nunca** a `None` (que fecharia en hoy); y `/listening/window` sigue
registrandose **antes** de `/listening/{track_id}` contra el router real de
FastAPI — la ruta parametrizada de `/listening/` ya causo tres problemas.

**Una prueba fallo y estaba desactualizada, no equivocada:** afirmaba que
**exactamente 2** paginas arman playlist de cola. Ahora son 3, y lo bueno es
que el bucle de esa prueba corrio contra `WindowPage` y paso sus 6
comprobaciones sola, o sea la pantalla nueva cumple las mismas invariantes que
las otras dos. Se fijo la lista completa para que cualquier pagina nueva tenga
que pasar por ahi.

**139 comprobaciones en la sesion.** `npm run build` OK (1591 modulos).

**VERIFICADO EN PRODUCCION, y LA TRAMPA NO ERA TEORICA.** Medido contra sus
datos de verdad:

```
ventana      canciones  sin calificar  tiempo   #1
30 dias          100         32         1.1 s   Vedette (9)
90 dias          100         26         1.3 s   Gente Comun (22)
1 anio           100          7         1.2 s   Ojos empapados (72)
historico        100         72         1.1 s   MAMI 100PRE SABE (160)
```

**48 de las 100 canciones del top de 30 dias son de antes de 2026.** O sea la
fecha equivocada habria afectado a **casi la mitad de la pantalla**, no a un
caso raro:

```
cancion            la ventana dice   se fecha en    plays
Ateo               2026-09-20        2021-10-07      3 de 41
Tanjiro            2026-08-24        2024-08-26      4 de 94
Cowboy Bebop       2026-08-24        2025-08-05      4 de 52
```

`Ateo` es el caso de manual: la escucho **ayer**, asi que la ventana la ve
nueva — y la escucha desde **octubre de 2021**, con 41 plays. Con la fecha de
la ventana habria entrado a PT.-3, a la Galeria y a Me Gusta. Las que si son
nuevas (Vedette, Hombre De Bien) se fechan en 2026 como debe ser, o sea el
mecanismo distingue, no aplana todo hacia atras.

**Higiene de lo que llega:** 0 ratings basura (la prueba del `_rating_limpio`
sirviendo en produccion), 0 items sin fecha sugerida —o sea ninguno se fecharia
en hoy— y **100 de 100 con portada**.

**Y UN NUMERO QUE VALE POR SI SOLO:** de sus 100 canciones **mas escuchadas de
toda la vida**, **72 no estan calificadas** en RateApp. Contra 7 de 100 en la
ventana de un anio. La app conoce bien lo reciente y esta casi ciega a lo que
mas ha escuchado historicamente.

Commits `55bd2df` y `942c144`.

**PENDIENTES:**

- [x] **`pool_size` 5 -> 16, mas reintento.** El 500 recurrente, cerrado.
- [x] **El link a la playlist cuando no hay dispositivo.**
- [x] **Contestada la pregunta del toast**: existe, funciona y sale arriba a la
      derecha.
- [x] **Los nombres de 2026: PUESTOS.** `2026 PT.-1/2/3`, calcados de Spotify,
      y la portada ahora se lee de Spotify en vez de un archivo del repo.
- [ ] **Las portadas de PT.-1 y PT.-2 todavia dicen "Perla" y "Miel" pintado
      dentro.** No es codigo: es arte. Cuando las cambie en Spotify, la app las
      toma sola.
- [ ] El mix. Sigue bloqueado por **auth mono-usuario**.
- [ ] Scope `user-top-read`, junto con la cirugia de auth.
- [x] **Las ventanas de escucha, EN USO.** Pantalla `/window` con 30/90/365/
      historico, y la playlist de cada periodo. Era el pendiente mas viejo con
      valor visible.
- [ ] **El mix CON otras personas** sigue bloqueado por auth mono-usuario. El
      de Angel solo ya esta. Y ojo con la asimetria del 2026-09-06: de los
      demas solo hay `/me/top/tracks`, que **no tiene ventana de 12 meses**.
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] `/tracks/abandoned/queue` sigue sin usarse por la UI.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-09 (sesion: la migracion mostraba 70 de 303, y los nombres dejan de ser el id)

**Maquina: PC `AngelPC`.** Dos quejas de Angel y un hallazgo que no venia en
ninguna de las dos.

**1) LA PANTALLA DE MIGRACION ENSENABA 70 CANCIONES Y LA PLAYLIST TIENE 303.**

Angel: *"lo de migrar canciones de playlist no esta respetando ni el orden de
la playlist anterior (lo de novedades) ni me muestra las canciones que ya habia
migrado de la playlist anterior"*. Las dos cosas eran bugs reales y las dos son
**de lectura**: la playlist destino ya se ordenaba bien y la origen nunca se
toca.

Medido en produccion antes de tocar nada:

```
playlist Miel en Spotify        303 canciones
la pantalla ofrecia migrar       70
no aparecian                    233
```

**La causa: `get_migration_candidates` implementaba la mitad de la regla que
esta escrita en `CLAUDE.md`.** Una cancion es de un cuatrimestre si su
`added_at` cae en el rango de meses **O** si su `cuatrimestre_override` apunta
ahi. La query solo miraba la fecha:

```sql
WHERE YEAR(added_at) = 2026 AND MONTH(added_at) BETWEEN 5 AND 8
```

Asi que las **~176** que Angel migro de Perla -> Miel el cuatrimestre pasado
—que viven en Miel por override y estan fechadas en marzo/abril— quedaban
invisibles. Son literalmente "las canciones que ya habia migrado de la playlist
anterior" que el reclamo. Otras **~66** ya tenian `override='latte'`, o sea ya
las habia movido en esta tanda, y el filtro tambien las escondia: no habia
forma de ver que ya se hizo.

**Ahora salen las dos cosas**: las migrables y, marcadas y con el checkbox
muerto, las que ya estan en Latte (`get_migrated_out`). Angel eligio verlas sin
poder tocarlas.

**LIMITE QUE NO SE PUEDE ESQUIVAR, y quedo escrito en el codigo:**
`cuatrimestre_override` es **un solo campo, sin historia**. Una cancion que fue
perla -> miel -> latte hoy dice `latte` y esta fechada en marzo, o sea es
**indistinguible** de una que fue perla -> latte directo. Solo se recuperan las
que nacieron en el cuatrimestre origen. Y ojo con la etiqueta: `rate_track`
pone el override solo cuando una cancion historica sube a TOP_SET, asi que lo
correcto es decir **"ya esta en Latte"**, no "ya la migraste" — pudo llegar ahi
sin abrir esta pantalla.

**EL ORDEN: no se recalcula, se lee.** La lista ordenaba por rating desc +
fecha desc. Ese criterio replicaba la playlist **hasta el 2026-08-21**, cuando
el orden real gano el bloque de novedades, y nadie actualizo esta pantalla. El
orden real de Miel hoy:

```
pos 1-21   A+   <- bloque de novedades congelado
pos 22-29  A
pos 30-33  B+
pos 34+    A+ historicas, luego A, B+, B...
```

**Reproducirlo aqui habria sido adivinar**: `_novedad_dias` devuelve `None`
para un cuatrimestre historico, y la ventana de 45 dias que produjo ese orden
era relativa a agosto. Se leen las **posiciones reales** de la playlist origen
y se ordena por ahi. De paso, las que no estan en la playlist (las 7 C, que
`rate_track` saca del cuatrimestre) caen al final marcadas, en vez de mezclarse
arriba por rating. Si Spotify no contesta, la pantalla sale igual y avisa que
el orden no es el de la playlist.

**Verificado en produccion despues del deploy: 246 migrables + 68 ya marcadas,
con `orden_playlist: true`.** Antes: 70.

**Verificacion: 31 comprobaciones sin red y sin MySQL.** El metodo vale la pena
anotarlo: **la SQL real que emite `database.py` se captura y se ejecuta contra
SQLite** con `YEAR`/`MONTH` registradas como funciones de usuario, o sea se
prueba la query de produccion y no una parafrasis. `npm run build` OK (1588).

Commit `e11b06a`.

**2) LOS NOMBRES DE LAS PLAYLISTS: EL PROBLEMA NO ERAN LOS NOMBRES.**

Angel: *"necesitamos cambiar los nombres de las playlist y las portadas porque
nunca conecte. quiero que me ayudes a evaluar opciones"*.

Antes de proponer nombres se hizo el inventario, y ahi cambio el diagnostico:
**el nombre visible y el identificador interno eran la misma palabra**,
repartida en **cinco mapas** (dos `_CUATRI_DISPLAY` en el backend, tres en el
frontend) que se limitaban a capitalizar el id.

**Eso ya mentia en produccion**, aunque nadie lo hubiera notado: en 2025 los
cuatrimestres se llamaban **Savia / Lirio / Marea**, y Herramientas igual decia
"Perla". El bug estaba latente y se iba a hacer visible en enero de 2027.

Se le presentaron tres opciones con su costo real y eligio la **B**:

| | Que implica | Costo |
|---|---|---|
| A | Renombrar solo 2026 a mano | 15 min, el problema vuelve cada anio |
| **B** | **Separar nombre de identificador, fuente unica** | **medio dia** |
| C | Renombrar tambien los identificadores | alto, con migracion de datos |

**C se descarto sin dudar y la razon importa:** `perla` / `miel` / `latte` no
son solo codigo — estan **dentro de la columna `cuatrimestre_override` de
MySQL, en filas reales**. Renombrarlos costaria una migracion de datos a cambio
de **cero** beneficio visible, porque esos strings nadie los ve.

**Lo construido:** `config.CUATRI_NOMBRES` (anio -> slot -> nombre + color) es
la unica fuente. `utils.cuatri_info()` / `nombre_cuatri()` traducen. El mapa
viaja en **`/playlists/distribution`**, y eso fue deliberado: el frontend ya
primea esa llamada al arrancar y la cachea, asi que los nombres llegan **sin
una peticion nueva** ni asincronia extra en las pantallas que solo quieren
pintar una etiqueta. `frontend/src/utils/cuatrimestres.js` (nuevo) guarda lo
que llego, con un fallback estatico para que nada salga en blanco antes de que
responda.

Cambiar los nombres de un anio es ahora **una entrada**, y la portada se deriva
sola: `/portadas/<anio>/<Nombre>.jpg`. Cuando Angel haga las portadas con
Design, basta con que el archivo se llame igual que el nombre.

**Angel decidio nombrar al INICIO del cuatrimestre**, no al cierre: se le habia
sugerido lo contrario (que nombrar cuatro meses que todavia no vives es dificil
que conecte) y dijo *"yo digo que nombremos playlist al inicio"*. El sistema no
impone ninguna de las dos.

**Verificacion: 22 comprobaciones**, incluida una que renombra latte 2026 a
"Cobre" y comprueba que el **identificador no se movio** y que
`get_cuatrimestre` sigue devolviendo `latte`. `npm run build` OK (1589).
Verificado en produccion: `/playlists/distribution` ya trae el mapa y
`2025/perla` dice **Savia**.

**Una prueba fallo y la equivocada era la prueba** (el patron de siempre en
este repo): buscaba la palabra "Savia" en cualquier linea del frontend y pegaba
con los **comentarios** que explican el cambio. Ahora busca la forma
`: 'Savia'` de un objeto literal, o sea dato y no prosa.

Commit `716095a`.

**3) LA PLAYLIST DE LAS MENOS ESCUCHADAS: "se queda sin hacer nada". SI SE
ESTA ARMANDO.**

Angel: *"cuando quiero hacer la playlist de las menos escuchadas no se hace, se
queda sin hacer nada"*. Se fue a los logs de Cloud Run antes de tocar codigo, y
el sintoma no era el que parecia:

```
23:13:00  POST /tracks/backfill/playlist?source=cleanup  200 OK
23:13:08  POST ...                                        200 OK
23:13:19  POST ...                                        200 OK
```

Tres clics seguidos (o sea Angel insistiendo) y **las tres respondieron bien**.
Comprobado ademas llamando al endpoint con `play=false`: creo/actualizo la
playlist `6TWVXuYK9EHT1FD7rxIIm0` ("Limpiar Me Gusta - revisar", privada) en
0.5 s.

**Lo que falla es la reproduccion, y lo que lo vuelve invisible es la UI.**
`now-playing` confirma que no hay ningun dispositivo de Spotify activo, asi que
`start_playback` no tiene donde sonar. Y el backend devuelve el link en
`spotify_url` — **que el frontend tira a la basura**. O sea la playlist queda
armada con su tramo exacto y no hay forma de llegar a ella. De ahi "no hizo
nada".

**HALLAZGO QUE NO VENIA EN NINGUNA QUEJA, Y ES PEOR:**

```
mysql.connector.errors.PoolError: Failed getting connection; pool exhausted
```

En `load_all()`, o sea en el camino que corre en cada operacion. La causa:
`App.jsx` dispara **9 peticiones en paralelo** al arrancar (likedAll, recent,
recentlyPlayed, distribution + las 5 playlists que esta encadena) contra un
pool de **5** conexiones. Cada endpoint sincrono de FastAPI corre en su propio
hilo y toma una conexion.

**No es esporadico**: los 500 salen en rafagas de 3-4 peticiones **en el mismo
segundo**, y estan el 5, 6, 8 y 9 de septiembre. El de anoche fue a las
**23:11:59**, un minuto antes de sus clics.

**Los dos arreglos quedaron propuestos y SIN respuesta**, asi que no se toco
nada:
  - el link "Abrir en Spotify" cuando no logra reproducir (las tres paginas de
    colas: Limpiar, Backfill, Abandonadas);
  - subir `pool_size` de 5 a ~16 en `database.py:13`.

Y quedo una pregunta abierta que decide si hay un tercer problema: **si al
picarle sale algun mensaje abajo (rojo o verde) o de verdad no aparece nada**.
Si no aparece nada, el toast tambien esta roto.

**Nota:** la prueba dejo 3 canciones sueltas en esa playlist. Se reemplazan
solas en el proximo uso.

**PENDIENTES:**

- [x] **Migracion arreglada y verificada en produccion** (246 vs 70).
- [x] **Nombres separados del identificador**, con fuente unica.
- [ ] **Decidir los nombres nuevos de 2026** (y las portadas, que Angel hara
      con Design). El codigo ya solo espera una entrada en
      `config.CUATRI_NOMBRES`.
- [ ] **El link a la playlist cuando no hay dispositivo** — propuesto, sin OK.
- [ ] **`pool_size` de 5 a 16** — propuesto, sin OK. Es un 500 recurrente en
      produccion, no cosmetico.
- [ ] Contestar si el toast de la pagina de limpieza se ve o no.
- [ ] El mix. Sigue bloqueado por **auth mono-usuario**.
- [ ] Scope `user-top-read`, junto con la cirugia de auth.
- [ ] **Nada consume las ventanas de escucha todavia.**
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] `/tracks/abandoned/queue` sigue sin usarse por la UI.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-07 (sesion: el import corrido, y tres cosas que salieron de los numeros)

**Maquina: laptop del trabajo.** Angel corrio `import_eventos.py` y mando la
captura del terminal. Salieron tres cosas de mirar los numeros, y una **corrige
una afirmacion equivocada de ayer**.

**EL IMPORT CORRIO BIEN.** 118,729 eventos procesados en 1.4 s, subidos en
lotes de 1000 en **21 s**. La contrasena la saco el de Secret Manager y la puso
en su propia shell: el valor no paso por Claude, igual que el 2026-09-03.

**1) LOS 902 QUE "FALTABAN" ERAN 917 DUPLICADOS, Y LA CUENTA CIERRA EXACTA.**

El script dijo que mandaba 118,729 y la base reporto 117,827. Se midio en vez de
suponer:

```
eventos del export con umbral : 118,729
pares (track_id, played_at) unicos : 117,812   -> 917 colapsados por la PK
en la base                    : 117,827  = 117,812 + 15 del cron   ✓
```

**Son duplicados exactos del export, no escuchas perdidas.** El mismo
`track_id` con el **mismo segundo**, repetido hasta 4 veces:

```
x4  3iq3AG31l8l2L1x1valVVI  2018-09-03 16:56:50
x4  5mGu63Zp0QmY585W5ZTKie  2020-02-22 05:15:54
x4  5SkiVFWCP3NPEgNk3PaL2I  2022-01-14 07:33:05
```

Es fisicamente imposible escuchar una cancion 4 veces empezando en el mismo
instante; lo mas probable es solapamiento entre los archivos del export
(`2019.json`, `2019_1.json`, `2019_2.json`...). 872 pares tenian al menos una
copia. Colapsarlos es exactamente para lo que existe la PK.

**Y AQUI LA CORRECCION.** Ayer se escribio, tanto en `CLAUDE.md` como en este
log, que `COUNT(*)` de una ventana coincidiria **exacto** con `plays` del
agregado. **No coincide, y el juicio se invierte:**

```
plays del agregado : 118,869   <- SI cuenta los 917 duplicados
eventos            : 117,827   <- los descarta
```

O sea **los eventos son los fieles y el agregado viene inflado ~0.8%**, no al
contrario. Corregido en `CLAUDE.md` para que el dia que los dos numeros se vean
distintos en dos pantallas no se busque un bug que no existe.

**2) HUECO REAL EN LA SERIE: 2 -> 6 de septiembre, ~125 reproducciones.**

Sale de la misma aritmetica. El cron metio **140** reproducciones al agregado
desde que termina el export (1 sep 23:34), pero solo **15** a los eventos —
porque el codigo que guarda la serie se desplego el 6. Esos ~125 plays estan en
`listening_stats` y **no** en `listening_events`.

**Es irrecuperable**: `recently-played` solo devuelve las ultimas 50 y esos dias
ya pasaron; rellenarlo pediria otro export y 30 dias de espera. Pero **se
autocorrige**: conforme pase el tiempo el hueco sale solo de la ventana de 30
dias. Mientras tanto esa ventana va ~13% corta (871 medidos contra ~996 reales).
Documentado en `CLAUDE.md` para que no se lea como un bug.

**3) BUG PROPIO, Y ESTABA EN PRODUCCION: `datetime.utcnow()` deprecado.**

El terminal de Angel lo delato — `DeprecationWarning ... import_eventos.py:95`.
Pero el grep encontro que **el mismo llamado estaba en `database.py:838`, dentro
de `_corte()`**, o sea en el camino que corre en Cloud Run **en cada consulta de
ventana**. El warning del script era lo visible; el de produccion era el que
importaba.

**El detalle que hacia el arreglo no-trivial:** el reemplazo obvio,
`datetime.now(timezone.utc)`, devuelve un datetime **tz-aware**, y ese valor se
manda como parametro a MySQL contra una columna `DATETIME` **sin zona**. Eso
desplaza la hora o truena al comparar — **es el mismo detalle que ya mordio el
2026-08-21** con el bloque de novedades (`utils.now_utc()` aware contra
`added_at` naive). Arreglado con
`datetime.now(timezone.utc).replace(tzinfo=None)`, que mantiene el naive de
siempre, con la razon escrita al lado.

Verificado corriendo con `-W error::DeprecationWarning`: `_corte(30)` sale
naive (`tzinfo: None`), `_corte(0)` sigue dando `None` (historico), y compara
contra un naive sin reventar.

**Verificacion: las 50 comprobaciones de ayer siguen verdes** (36 + 14) despues
del cambio.

**ESTADO REAL DE LA SERIE, medido en produccion:**

```
eventos   : 117,827
canciones : 15,925        <- por match_key, no por track_id
desde     : 2018-01-28T16:59:27
hasta     : 2026-09-07T06:49:19
```

Las **15,925 canciones contra las 17,869 track_ids** del script **no son un
error, son la prueba de que `match_key` trabaja**: 1,944 ids resultaron ser
reediciones de canciones que ya estaban. Es justo el subconteo que costo ~12,000
reproducciones el 2026-09-04, ahora colapsado como debe ser.

**PENDIENTES:**

- [x] **`import_eventos.py` CORRIDO** por Angel. 117,827 eventos en la base.
- [x] **`datetime.utcnow()`** fuera del codigo, incluido el de produccion.
- [ ] El mix en si. Sigue bloqueado por **auth mono-usuario**: un solo
      `TOKEN_KEY` en `config`, asi que hoy un amigo que entre a `/auth/login`
      **saca a Angel de su propia app**.
- [ ] Scope `user-top-read`. Obliga a re-loguearse, conviene junto con la
      cirugia de auth.
- [ ] **Nada consume las ventanas todavia.** Los endpoints existen y la tabla
      esta llena, pero ninguna pantalla los usa. Es lo mas barato que queda con
      valor visible, y no necesita nada de auth.
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] `/tracks/abandoned/queue` sigue sin usarse por la UI.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-06 (sesion: el mix se arma con escuchas reales, no con recommendations)

**Maquina: laptop del trabajo** (la del `cramirez@joffroy.com`). Segunda vez que
se trabaja aqui; ver abajo lo de las versiones.

Angel abrio con *"entonces si podremos meter el mix?"*, o sea la seccion 7.

**1) EL PENDIENTE DE 6 SESIONES, CERRADO: `/recommendations` ESTA MUERTO.**

Arrastrado desde el 2026-09-02 y repetido en seis entradas del log sin que
nadie lo corriera. Nunca se habia llamado desde la app — el grep confirmo que
la palabra solo existia en `Mejoras.txt` y en este changelog.

Se resolvio con un endpoint de diagnostico temporal, desplegado y luego
retirado:

```
seed_track      : 23uZ2cVSSecPQBhKtU9xSY   (real, de sus Me Gusta)
recommendations : status 404 — vivo: false
user-top-read   : ausente del scope
```

Dos cosas hacen que el resultado sea confiable. **La semilla era real**, sacada
de sus propios Me Gusta: con un id inventado, un 404 no distingue "endpoint
muerto" de "semilla mala". Y es **404, no 403** — Spotify no contesta
"prohibido", hace como si el endpoint nunca hubiera existido, que es la firma
de la deprecacion de nov 2024 para apps en development mode.

**2) ANGEL CAMBIO EL DISEÑO, Y PARA BIEN.** Antes de ver el resultado dijo:

  *"el de recommendations era un comentario, no es lo que busco al 100%, me
  parece mejor que el mix sea de las canciones favoritas de los ultimos 30
  dias, el ultimo anio u historico. tipo algo mas real que de recommendations."*

O sea descarto el motor de sugerencias por su cuenta y pidio escucha real. La
verificacion, que parecia el bloqueador de la seccion 7, acabo siendo un
tramite: confirmo que el camino que el ya habia descartado tampoco existia.

**3) EL OBSTACULO NO ERA SPOTIFY, ERA LA APP — y estaba escondido.**

`listening_stats` es un **agregado**: una fila por cancion con el total de plays
y `first/last_played`. **No guarda cuando ocurrio cada reproduccion**, asi que
no puede contestar "cuantas veces en los ultimos 30 dias", que es justo lo que
Angel acababa de pedir.

El sintoma es engañoso y por eso vale anotarlo: una cancion con **200 plays en
2021 y UNA sola vez ayer** se ve tan "reciente" como una que suena 50 veces
este mes. Un mix de "ultimos 30 dias" armado sobre el agregado habria salido
lleno de nostalgia disfrazada de novedad, sin que nada se viera roto.

La buena noticia es que el dato existia: los JSON del export siguen en
`historial/` con el timestamp de cada reproduccion. Estaba colapsado, no
perdido.

**LO QUE SE CONSTRUYO: `listening_events`,** una fila por reproduccion. Tres
decisiones y las tres son defensa contra errores que este proyecto YA PAGO:

- **PK `(track_id, played_at)` + `INSERT IGNORE`.** La idempotencia vive en el
  **esquema**, no en la logica. La captura corre cada 15 min y siempre re-ve
  reproducciones ya guardadas; el doble conteo es un error silencioso y
  permanente, del que nadie se entera hasta que los numeros ya derivaron.
- **`match_key`.** Toda consulta de ventana agrupa por clave, nunca por
  `track_id`. Cruzar por id ya costo ~12,000 reproducciones perdidas el
  2026-09-04, y una tabla nueva era la oportunidad perfecta de repetirlo.
- **`INSERT`, nunca `executemany` con `UPDATE`.** Con UPDATE el conector manda
  una sentencia por fila: 118,729 filas x ~80 ms a `us-east-1` son **horas**.
  Ya paso con el reindex. Con INSERT se agrupa: ~119 viajes.

Ademas la tabla es **angosta** (no duplica name/artist, que viven en
`listening_stats`) e **independiente**: `load_all()` no la toca y ninguna query
existente cambia, o sea los tiempos de carga que Angel pidio no descomponer
quedan literalmente igual.

**Codigo:** `backend/database.py` — `ensure_listening_events_table`,
`add_events_batch`, `get_top_window`, `get_window_plays_for`,
`get_events_summary`, `_corte`. `backend/main.py` — la tabla en el lifespan.
`backend/routes/tracks.py` — la captura ahora ademas guarda la serie, mas
`GET /tracks/listening/window?dias=` y `/listening/events-summary`.
`backend/scripts/import_eventos.py` (nuevo), hermano de `import_historial.py`.

Lo que queda disponible, medido sobre el export real:

```
ventana        reproducciones   canciones
30 dias                   882         564
90 dias                 2,720       1,388
1 anio                 17,060       4,276
2 anios                35,595       6,856
historico             118,729      17,869
```

Se usa **el mismo umbral de 30 s** que el agregado para que las dos cifras
midan lo mismo. **CORREGIDO AL DIA SIGUIENTE:** aqui se afirmo que coincidirian
exacto y **no coinciden** — la PK colapso 917 duplicados del export que el
agregado si cuenta, asi que los eventos son los fieles y `plays` viene inflado
~0.8%. Ver la entrada del 2026-09-07.

**ASIMETRIA QUE HAY QUE TENER PRESENTE AL DISEÑAR EL MIX**, y no es obvia: las
ventanas de Angel y las de los demas **no son las mismas**. De el hay serie
completa desde 2018, o sea cualquier ventana. De los demas solo hay
`/me/top/tracks`: `short_term` (~4 semanas), `medium_term` (~6 meses) y
`long_term`. **No existe ventana de 12 meses**, asi que "el ultimo anio" que
pidio solo se puede calcular para el; para ellos lo mas cercano son 6 meses.
Es limite de Spotify, no del diseño.

**4) EL FALSO POSITIVO QUE CASI SE CUELA, y es variante NUEVA de uno viejo.**

Al verificar el deploy, `GET /tracks/listening/events-summary` devolvio JSON
valido:

```
{"track_id":"events-summary","found":false,"plays":0,...}
```

Eso **no es el endpoint nuevo**: es la ruta parametrizada
`/listening/{track_id}` tragandose la cadena `"events-summary"` como si fuera
un id de cancion. La revision vieja seguia arriba.

El 2026-09-02 ya habia mordido un falso positivo parecido — ahi era el fallback
del SPA devolviendo `index.html` con 200 — y de eso salio la regla "verificar
que la respuesta sea JSON, no que el status sea 200". **Esa regla no alcanza**:
aqui la respuesta ERA JSON. La regla buena es **buscar una llave que solo exista
en la respuesta nueva** (aqui `"eventos"`).

Es la tercera vez que la ruta parametrizada de `/listening/` causa un problema,
asi que las dos rutas nuevas se registraron **antes** de ella y hay pruebas que
lo comprueban contra el router real de FastAPI, no contra el orden del texto.

**Verificacion: 50 comprobaciones, sin red y sin MySQL** (36 de logica con la
capa de `mysql.connector` stubeada + 14 importando la app de verdad, 54 rutas).
Las que importan: los lotes van en INSERT y nunca en UPDATE; `INSERT IGNORE`
para que re-capturar no duplique; `match_key` se calcula del nombre+artista y
acentos/mayusculas caen en la misma clave; `get_top_window` agrupa por clave y
resuelve nombres en **2 queries, no N+1**; historico no filtra por fecha; la que
no aparece en la ventana cuenta 0 y **no se omite**; y FastAPI ve
`/listening/window` antes que `/listening/{track_id}`.

`import_eventos.py --dry-run` corrio contra los 156 MB reales: 187,577 filas
procesadas en **1.1 s**.

**UNA PRUEBA FALLO Y EL EQUIVOCADO ERA LA PRUEBA**, como el 2026-09-04:
comprobaba que el mount del SPA fuera la ultima ruta, pero `backend/static`
solo lo crea el build de Docker, asi que en local no se monta. Se corrigio la
prueba, no el codigo.

**NOTA DE MAQUINA (la regla de las dos maquinas, otra vez).** Esta laptop no
tenia ni `fastapi` ni `spotipy`. Se instalaron, y el detalle importa: `pip
install fastapi` trajo la **0.141.1**, donde `include_router` guarda las rutas
anidadas en vez de aplanadas — la app real reportaba **6 rutas en vez de 54** y
parecia que nada se habia registrado. No era el codigo: era la version. Con la
fijada en `requirements.txt` (`fastapi==0.115.0`) todo salio verde. Mismo patron
que el `pandas 2.2.2` vs `3.0.5` del 2026-09-03. **Al verificar en esta laptop,
instalar las versiones fijadas, no las ultimas.**

**PENDIENTES:**

- [x] **`/recommendations` — VERIFICADO MUERTO** (404). Cerrado.
- [x] **Desplegado y verificado en produccion** (commit `9b72587`):
      `events-summary` -> `{"eventos":0,...}` y `window` -> `{"dias":30,"items":[]}`
      responden con la forma nueva, el diag temporal ya cae al SPA, y
      `/tracks/stats` sigue devolviendo los 1,312 tracks, o sea nada se rompio.
      La tabla se creo sola en el lifespan.
- [ ] **CORRER `import_eventos.py`.** Lo tiene que hacer Angel, porque necesita
      la contrasena: `$env:MYSQL_PASSWORD = '...'` y luego
      `python backend/scripts/import_eventos.py`. Hasta entonces la tabla
      existe pero solo tiene lo que capture el cron de aqui en adelante, o sea
      las ventanas largas saldran vacias. Es idempotente, se puede correr sin
      miedo.
- [ ] El mix en si. El muro sigue siendo **auth mono-usuario**: un solo
      `TOKEN_KEY` en `config`, asi que hoy un amigo que entre a `/auth/login`
      **saca a Angel de su propia app**. Bloquea los dos modos, no solo el
      persistente.
- [ ] Scope `user-top-read` para `/me/top/tracks`. **Obliga a Angel a
      re-loguearse** (`validate_token` descarta el token al que le falta un
      scope), asi que conviene meterlo junto con la cirugia de auth y no antes.
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] `/tracks/abandoned/queue` sigue sin usarse por la UI.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-04 (sesion: el conteo de escuchas estaba mal)

**Maquina: PC `AngelPC`.**

**LO REPORTO ANGEL COMPARANDO CONTRA stats.fm**, y tenia razon: *"esta mal la
cantidad de reproducciones, dice que eso y mas de joan no la he escuchado y en
stats dice que la escuche 3 veces... tambien luces de colores, dice que 0 pero
la escuche 19 veces"*.

**LA CAUSA: Spotify le da IDs DISTINTOS a la misma cancion** (album, mercado,
reedicion — track relinking). Comprobado con el caso exacto que dio:

```
LUCES DE COLORES
  en el historial : 5dDlknAL9imbXXl7uG7oqe  -> 18 reproducciones
  en sus Me Gusta : 5BTnoMRlpAnyzYY9S9HbIn  -> no casa
```

**Y era mucho mas grande de lo que parecia.** El join por `track_id` perdia:

  - **17** canciones marcadas en 0 que si escucha. **Estas eran las
    peligrosas**: con el orden por defecto salian ARRIBA en la lista de
    limpieza, o sea eran las primeras candidatas a que las borrara.
  - **884** con el conteo por debajo del real
  - **~12,000 reproducciones** en total
  - de todos sus Me Gusta, **solo 1** nunca se escucho de verdad

**LA SOLUCION, y por que NO se hizo mas agresiva.** Se agrego `match_key`
(nombre+artista normalizado) y `get_listening_for()` **suma** todas las filas
que comparten clave. Antes de elegir la normalizacion se midieron dos:

  - **conservadora** (minusculas, acentos, invisibles, puntuacion): 178
    colisiones de 21,435, y todas resultaron ser el mismo titulo escrito
    distinto (`Mi Ultima Cancion` / `Mi Ultima Cancion` con acentos). Recupera
    16 de las 17 perdidas y corrige 815 conteos.
  - **agresiva** (ademas trunca en " - " y " (feat"): 494 colisiones, e incluia
    `Punto G (Remix)` con `Punto G (feat. Darell)` — canciones distintas.

Se eligio la conservadora, y quedo escrito en `CLAUDE.md` que no se haga mas
agresiva.

Detalle que solo aparece mirando los bytes: el export trae **U+2060 (word
joiner)** al inicio de algunos titulos, invisible al ojo y suficiente para que
el emparejamiento por texto falle. Por eso la normalizacion descarta la
categoria Unicode `Cf`.

**No hizo falta re-importar los 156 MB.** `POST /tracks/listening/reindex`
deriva la clave del `name`/`artist` que la tabla ya guarda, asi que Angel no
tuvo que volver a manejar la contrasena de MySQL.

**ARREGLO APARTE, y era el peligroso:** la UI mostraba `0` cuando en realidad no
habia dato. Como el orden por defecto es "menos escuchadas", esas canciones
**encabezaban la lista de candidatas a borrar** — Angel pudo haber quitado likes
de canciones que si escucha. Ahora las colas devuelven `sin_datos`, la UI pinta
`?` en vez de `0`, y esas filas se mandan **al final** de la lista.

**BUG QUE ATRAPO LA VERIFICACION, y es el mismo patron por segunda vez:**
`norm_text` reventaba con `TypeError: normalize() argument 2 must be str, not
Query`. Una ruta de FastAPI llamada de Python a Python recibe sus defaults como
objetos `Query`, no como el valor. Ya habia pasado con `backfill_playlist` en
esta misma sesion. Ahora `norm_text` es defensiva y la ruta valida con
`isinstance`.

**Verificacion: 110 comprobaciones.** Las nuevas prueban el caso exacto de
Angel: LUCES DE COLORES devuelve **19** (18+1, sumando las dos filas) con el id
nuevo de Me Gusta, y `Eso Y Mas` casa con `Eso Y Mas` acentuado. Tres tests
viejos fallaron por stubs desactualizados (apuntaban a `get_listening_many`);
**se corrigieron los tests, no el codigo**.

**RESULTADO EN PRODUCCION.** El reindex corrio en **3 segundos**: 23,926
filas, 21,373 claves unicas. Los ceros falsos desaparecieron.

```
                        antes   despues
con 0 escuchas             17         0
sin dato (muestran ?)       -         1   (Lose Yourself, Eminem)
hasta 2 escuchas           34         9
hasta 5 escuchas          113        76
hasta 10 escuchas         404       316
```

**CONTRA stats.fm NO CUADRA EXACTO, y la razon esta medida:**

  - `LUCES DE COLORES`: la app dice **18**, stats.fm **19**. En el export hay
    **23** reproducciones, pero solo 18 pasan de 30 s; las otras cinco duraron
    9s, 6s, 17s, 8s y 2s. La app usa el umbral de 30 s (`UMBRAL_PLAY_MS`), que
    es el que Spotify usa para contar un stream. **Diferencia de definicion,
    no un error.** Si algun dia Angel quiere que cuadre con stats.fm es una
    linea, pero se le recomendo NO hacerlo: contar un salto de 2 segundos como
    escucha ensucia justo la metrica con la que limpia.
  - `Eso Y Mas`: la app dice **4** y stats.fm **3**, y aqui la app va MEJOR: el
    export trae 3 y la cuarta es la que Angel escucho antier, capturada por el
    cron. De paso confirma que la captura automatica funciona.

**BUG QUE SALIO AL CORRER EL REINDEX POR PRIMERA VEZ:** se quedaba colgado y el
request de Cloud Run moria. `executemany` con **UPDATE** no se agrupa — el
conector manda una sentencia por fila, o sea 24k viajes de ~80 ms: mas de 30
minutos. **Es el mismo error que se habia evitado a proposito en
`import_historial.py`** y que aqui se repitio. Arreglado con
`INSERT ... ON DUPLICATE KEY UPDATE`, que si se agrupa: 24 viajes, 3 segundos.
La prueba tiene una asercion que falla si alguien vuelve a poner executemany
con UPDATE ahi.

**PENDIENTES:**

- [x] **Reindex CORRIDO y verificado** (ver arriba).
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] Seccion 7, los mixes. Primer paso: verificar si `/recommendations` sigue
      vivo para esta app.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-04 (sesion: se corrige el error de medicion + cache + tramos de escucha)

**Maquina: PC `AngelPC`.** Tres quejas de Angel, y la tercera obligo a admitir
un error de analisis de hace tres sesiones.

**1) EL ERROR: "las menos escuchadas no existen" ESTABA MAL MEDIDO.**

Angel lo dijo dos veces y las dos se le llevo la contraria. La tercera fue
explicita: *"es que en realidad yo queria eso que te dije, las que tengo en mis
me gusta y casi ni escuche, no digo solo las que tienen 0 escuchas, sino que
tienen demasiado pocas"*.

Se volvio a medir, y **tenia razon**. El analisis del 2026-09-02 uso el umbral
**0-2 reproducciones** (34 canciones) y de ahi salio la conclusion. Pero:

```
mediana de sus Me Gusta: 20 escuchas    promedio: 25    maximo: 150

con  2 escuchas o menos     34   1.5%   <- lo unico que se habia mirado
con  5 escuchas o menos    115   4.9%
con 10 escuchas o menos    405  17.4%
```

Con la mediana en 20, **5 escuchas si es "casi nunca"**. El error fue usar un
umbral absoluto para juzgar una distribucion que no se conocia.

**Y la solucion que propuso el es mejor que cualquier umbral:** *"maybe armar
mis me gusta por escucha, y de ahi calificar y asi"*. O sea: no que la app
decida el corte, sino darle la lista ordenada y que el corte.

`GET /tracks/cleanup/queue` devuelve **TODOS** los Me Gusta con sus numeros, sin
filtrar. El frontend ordena (menos escuchadas / abandonadas / mas escuchadas),
filtra por umbral escribible, por texto y por "solo sin calificar". El corte lo
pone Angel. `AbandonedPage` se reemplazo por `CleanupPage`.

**2) LA CARGA SE REPETIA CADA VEZ.** *"se cargo y tardo mucho, luego me sali, me
volvi a meter y volvio a cargar todo"*. Justo: la peticion recorre los ~2,300 Me
Gusta de Spotify (~47 llamadas) y no habia cache.

Arreglado con `preloadCache`, que ya existia en el proyecto desde mayo y no se
estaba usando aqui. Ahora la primera carga es la unica; cambiar de orden o de
umbral es local e instantaneo, y salir y volver no vuelve a esperar. Calificar y
quitar likes actualizan el cache con `preloadCache.set` para que no quede viejo.
El boton de recargar fuerza con `invalidate`.

**3) NO SE PODIA ESCUCHAR MAS QUE LAS PRIMERAS 50.** *"que hago si quiero
escuchar de la 60 a la 100? a fuerza tendria que calificar las 50 primeras?"*.

No. `POST /tracks/backfill/playlist` ahora acepta `track_ids` en el body, y el
frontend manda **el tramo exacto** que se esta viendo. Cada fila tiene ademas un
boton de play que arranca la playlist **desde ahi**. Sin `track_ids` cae al
comportamiento viejo (las primeras N), asi que nada se rompio.

De paso, cada fuente (`backfill`, `abandoned`, `cleanup`) usa **su propia clave
en `config`**: si compartieran una, abrir una vista pisaria la playlist que la
otra dejo sonando.

**Verificacion: 96 comprobaciones** (21 captura + 12 tipos MySQL + 23 backfill +
23 abandonadas + 17 nuevas). Las de esta tanda: vienen TODAS las canciones y no
solo las que pasan un umbral; la de 0 escuchas va primero y la de 150 al final;
sin historial cuenta como 0 y no se omite; se sugiere la primera escucha para no
fechar en el cuatrimestre actual; el tramo pedido se manda tal cual; deduplica
sin perder el orden; sin `track_ids` cae a la cola como antes; y cada fuente
tiene su nombre y su clave de playlist. `npm run build` OK (1588 modulos).

Un test viejo fallo y **el que estaba mal era el test**: comprobaba la clave
`_ab`, que cambio a `_abandoned` al separar una clave por fuente. Se actualizo
el test, no el codigo.

**BUG REPORTADO POR ANGEL EN VIVO:** *"le estoy picando a la cancion 22 o 23 y
me esta reproduciendo la segunda cancion de la lista"*. El indice estaba bien;
el error era `start_playback(context_uri=...)` **sin `offset`**.

Spotify **recuerda la posicion dentro de un contexto**, y como aqui la playlist
se REUTILIZA siempre, arrancarla sin offset reanudaba donde se habia quedado la
tanda anterior en vez de empezar por la primera del tramo. El sintoma exacto que
describio.

Lo mas feo: **el codigo de mayo ya lo resolvia bien**. `play-in-context` pasa
`offset={"uri": ...}` desde entonces, y aqui no se copio ese detalle.

Arreglado con `offset={"uri": <primera del tramo>}` y respaldo a
`{"position": 0}` por si Spotify todavia no propago el reemplazo de la
playlist. 5 casos nuevos, incluido que **nunca** se llame sin offset.

**PENDIENTES:**

- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] Seccion 7, los mixes. Primer paso, 5 min: **verificar si
      `/recommendations` sigue vivo para esta app**.
- [ ] `/tracks/abandoned/queue` quedo sin usar por la UI. Se dejo vivo porque su
      criterio de recencia esta probado, pero es candidato a borrarse.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-04 (sesion: limpiar Me Gusta + escuchar las colas)

**Maquina: PC `AngelPC`.** Continuacion directa de la cola de backfill.

Angel pidio dos cosas, y de la segunda dijo lo importante: *"sigo sin ver lo
contrario que es lo que verdaderamente queria, calificar o mas bien descalificar
las que no me gustan de mi me gusta"*. Tenia razon: era lo primero que pidio
el 2026-09-01 y llevaba tres sesiones sin construirse.

**1) ESCUCHAR LA COLA SIN IR CANCION POR CANCION.**
*"no quisiera ir buscando cancion por cancion. maybe hacer una playlist real de
mis canciones mas escuchadas y que si le doy click traiga esa playlist en ese
orden"*, y aparte *"para no tener una cola de 1000 canciones mejor"*.

`POST /tracks/backfill/playlist?source=backfill|abandoned&limit=50` arma una
playlist **real** con lo primero de la cola y la reproduce con `context_uri`.
Se eligio playlist real sobre mandar una lista de `uris` a `start_playback`
porque asi puede seguir escuchando desde Spotify sin la app abierta, que es lo
que el describio.

**Reutiliza siempre la misma playlist** — su id vive en `config` — para no ir
dejando una playlist nueva tirada en su cuenta cada vez que le da al boton. Si
la borra desde Spotify, se recrea sola en vez de tronar. El `limit` topa en 100
a proposito: pidio explicitamente no acabar con una cola de mil canciones.

**EL RIESGO QUE SE LE SENALO ANTES DE CONSTRUIRLO, y que el no habia visto:**
el widget de Now Playing del sidebar califica con `api.rateTrack` **sin fecha**,
o sea con el flujo completo. Si escuchaba la cola y calificaba desde ahi,
**metia la cancion a Latte 2026** — exactamente lo que la pagina de backfill
existe para evitar. Por eso `/backfill` tiene ahora su **propio panel de
"sonando ahora"**, con los 7 botones cableados a la logica correcta (soft +
fecha de la primera escucha). Se sondea `now-playing` cada 5 s y el panel solo
aparece si la cancion es una de las que faltan por calificar.

**2) LIMPIAR ME GUSTA: LAS ABANDONADAS.** Lo que de verdad queria.

`GET /tracks/abandoned/queue?meses=&min_plays=` — Me Gusta que se escucharon
mucho y llevan N meses sin sonar, ordenadas por cuanto se escucharon ANTES:
primero las que mas amo y mas abandono. Tres filtros:
  - `min_plays` (default 5): "la amabas de verdad".
  - `meses` (default 12): "ya no la pones".
  - like de al menos un anio: lo recien likeado no se juzga, no ha tenido
    tiempo de ser abandonado.

`POST /tracks/unlike` es **la unica accion destructiva de toda la app**, y se
trato como tal: nunca se dispara sola, sale siempre de una seleccion explicita,
la UI pide confirmacion aparte con el conteo, y el tope son 200 por llamada
(en tandas, porque no se deshace solo).

**Y NO escribe ninguna calificacion, a proposito.** Marcar estas canciones con
una D automaticamente seria poner en la DB un juicio que Angel no hizo:
*abandonada no es lo mismo que mala*, y en esa lista hay clasicos suyos. Quedo
escrito en el codigo, en `CLAUDE.md` y en la propia UI.

**Codigo:** `backend/models.py` (`UnlikeRequest`), `backend/routes/tracks.py`
(`abandoned_queue`, `unlike_tracks`, `backfill_playlist`),
`frontend/src/pages/AbandonedPage.jsx` (nuevo), ruta `/abandoned`, panel de
sonando y boton "Escuchar 50" en `BackfillPage.jsx`, dos tarjetas nuevas en
Herramientas, y `api.js`.

**BUG ATRAPADO ANTES DE PROBAR NADA:** `backfill_playlist` llama a
`backfill_queue()` y `abandoned_queue()` como funciones normales de Python. Los
defaults de esas funciones estan declarados como `Query(3000, ...)`, y una
llamada que no pasa por FastAPI recibe **el objeto Query en vez del numero** —
`get_all_liked_tracks(limit=<objeto Query>)` habria reventado en la primera
llamada real. Arreglado pasando los argumentos explicitos, con la razon escrita
al lado para que no se "limpie" despues.

**Verificacion: 79 comprobaciones** (21 captura + 12 tipos de MySQL + 23
backfill + 23 nuevas), sin red y sin MySQL. Las que importan de esta tanda: la
que sigue escuchando NO sale como abandonada; 2 plays no cuenta como "la
amabas"; un like de hace un mes no se juzga; sin historial queda fuera; aflojar
o apretar el criterio cambia la lista; el unlike deduplica, no llama a Spotify
con lista vacia, rechaza mas de 200, y **se verifico por inspeccion del codigo
fuente que no escribe ningun rating**; la playlist se crea la primera vez,
guarda su id, se reutiliza la segunda, reproduce con `context_uri` (no
canciones sueltas) y se recrea si la borraron desde Spotify.
`npm run build` OK (1588 modulos).

**PENDIENTES:**

- [ ] Vista de las 317 que escucha y no tiene likeadas. Es la unica de las tres
      vistas del analisis que falta.
- [ ] Seccion 7, los mixes. Primer paso, 5 min: **verificar si
      `/recommendations` sigue vivo para esta app**.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-04 (sesion: cola de backfill, "califica lo que si escuchas")

**Maquina: PC `AngelPC`.** Misma sesion que el cambio a Cloud Scheduler.

**LA PREOCUPACION DE ANGEL, y tenia toda la razon.** Al proponerle la cola de
los 1,537 Me Gusta sin calificar contesto: *"no quiero que canciones viejitas
entren a mis playlist actuales"*. Se midio y el numero le da la razon con
creces: **1,520 de las 1,537 son de antes de 2026**. Solo UNA es de este anio.

Reparto por anio de descubrimiento: 2018:111, 2019:133, 2020:145, 2021:265,
2022:169, 2023:347, 2024:343, 2025:7, 2026:1, sin dato:16.

**Y el problema era PEOR de lo que el planteo**, por tres capas encadenadas:

1. `rate_track` mete una cancion historica en TOP_SET a **Latte 2026 + MMG +
   Galeria + like**.
2. `upsert_track` fecha con **hoy** en el INSERT, y las 1,537 no estan en
   `tracks`, o sea todas serian INSERT.
3. Con `added_at = hoy` cuentan como **novedades**, asi que el bloque de
   novedades de agosto las pondria **ARRIBA DE TODO** en la Galeria Anual.
   O sea calificarlas deshacia el trabajo de la seccion 6.

**Cuarta consecuencia, que Angel no habia visto y que se le senalo:** estamos en
latte 2026, justo el cuatrimestre que el decidio el 2026-08-25 esperar para medir
su ratio A+/A limpio (*"veremos el cambio en latte"*). Meter 1,537
calificaciones ahi **destruye esa medicion**, que lleva cuatro meses esperandose.

**LA SOLUCION SALE DEL HISTORIAL QUE SE IMPORTO AYER.** Cada cancion se fecha
con su **primera escucha real**, no con hoy. Una de 2021 queda fechada en 2021,
o sea es historica, o sea no entra a Latte 2026 ni a la Galeria. El problema se
resuelve de raiz en vez de con un parche — y es la razon por la que el export
vale mas de lo que parecia.

**LO QUE PIDIO ANGEL, textual:** *"quiero la versatilidad de que si quiero,
pueda calificar una cancion que ya tenia en mis me gusta y que se comporte como
una nueva, que se meta a mis playlist y asi pero tambien la opcion de
calificarla sin que se meta a ningun lado"*. Y pregunto que proponia.

**Diseno: dos acciones distintas y visibles, no un modo escondido.**
- **Calificar** (los 7 botones) -> cataloga. `soft=true` + fecha historica.
  Nada toca Spotify. Es el default porque sera el 95% de las 1,537.
- **"A mi rotacion"** (boton aparte) -> flujo completo, como cancion nueva.
  Solo ofrece B+/A/A+, porque subir algo mas bajo no tiene sentido.

**Lo bonito: el segundo boton casi no necesito codigo.** Si la cancion quedo
fechada en 2021, para la app **ya es historica**, y la regla que existe desde
mayo para "historica que sube a TOP_SET" es exactamente *"agrega a cuatrimestre
actual + MMG + Galeria + like + pone override"*. O sea "a mi rotacion" es
literalmente `rate_track` sin soft. La logica vieja ya hacia lo correcto; lo que
faltaba era la fecha que la activa bien.

**EL HUECO QUE ABRIA EL CAMBIO, encontrado escribiendo las pruebas.** Hasta hoy
una cancion NUEVA siempre se fechaba hoy, asi que la logica podia preguntar
`if old_track:` para decidir si era historica. Con `added_at` una cancion nueva
puede **nacer fechada en 2021**, y entonces:

- Una A+ nueva con fecha historica **no recibia `cuatrimestre_override`**, asi
  que `rebuild/anual` — que filtra por anio actual — la habria sacado de la
  Galeria donde se acababa de meter. Inconsistencia silenciosa.
- Una B nueva con fecha historica **si entraba** al cuatrimestre actual, cuando
  la tabla de `CLAUDE.md` dice que para B/C+ el cuatrimestre historico es
  intocable.

Arreglado con una variable `efectivo` (= `old_track`, o la fecha recien
insertada si la cancion es nueva) que reemplaza a `old_track is None` en los dos
puntos. El comportamiento viejo queda intacto: una cancion nueva fechada hoy se
sigue tratando igual que siempre, y hay pruebas de las dos ramas.

**Codigo:**

`backend/models.py` — `RateRequest.added_at` opcional. Compatible hacia atras:
sin el campo, `rate_track` sigue fechando con hoy.

`backend/routes/tracks.py` — `added_at = req.added_at or now_str`; la variable
`efectivo`; y `GET /tracks/backfill/queue`, que cruza los Me Gusta con
`listening_stats` **con `get_listening_many()`, una sola query con un `IN (...)`**
(pedirlas de a una serian ~1,500 viajes a us-east-1 = dos minutos largos).
Cada fila devuelve `suggested_added_at` con la primera escucha.

Limitacion conocida y documentada: el agregado guarda totales, no una serie
temporal, asi que **no se puede contar "plays de los ultimos 12 meses"**.
El orden usa `last_played` como proxy de "la sigues oyendo" y dentro de eso
ordena por plays totales.

`frontend/src/pages/BackfillPage.jsx` (nuevo) + ruta `/backfill` + tarjeta de
entrada en Herramientas. **Sin tab propia a proposito**: la barra movil ya tiene
5 items.

**Verificacion: 56 comprobaciones** (21 de captura + 12 de tipos de MySQL + 23
nuevas), sin red y sin MySQL. Las que importan: una A+ de 2021 catalogada no
toca NADA (ni playlist, ni like, ni override); la misma sin soft si entra al
cuatrimestre actual, MMG, Galeria y like, y **ninguna playlist de cuatrimestre
pasado se toca**; los dos huecos de arriba, con sus dos ramas cada uno; el flujo
viejo sin `added_at` sigue fechando hoy; y el orden de la cola pone primero lo
que si escucha aunque tenga menos plays que algo abandonado con 100.
`npm run build` OK (1587 modulos).

**CONSECUENCIA QUE SE LE AVISO ANTES DE EMPEZAR:** sus **stats historicas van a
cambiar**. Latte 2023 pasara de vacio a tener decenas de canciones conforme
catalogue. Es el retrato real de su historia musical, pero es un cambio visible
en el Dashboard.

**PENDIENTES:**

- [ ] Vista de abandonadas (las 721) para limpiar Me Gusta.
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] Seccion 7, los mixes. Primer paso, 5 min: **verificar si
      `/recommendations` sigue vivo para esta app**.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.

---

## 2026-09-04 (sesion: la captura pasa a Cloud Scheduler)

**Maquina: PC `AngelPC`.** Sin cambios de codigo de la app. Infraestructura.

Angel abrio con "ayer hice el import, como vamos?". Se reviso el estado en vivo
y de la revision salio un problema real que no se habia visto.

**LO BUENO: el sistema se sostiene solo.** Comparando contra lo que quedo el
2026-09-03, sin que nadie tocara nada:

```
                 3 sep      4 sep
canciones        23,918  ->  23,926   (+8)
reproducciones  118,735  -> 118,795   (+60)
horas           5,853.5  -> 5,856.9   (+3.4)
ultima escucha  3 sep 02:54  ->  4 sep 22:16
```

12 de 12 corridas del workflow en verde. Y el modal tiene con que trabajar: de
las primeras 30 canciones de Biblioteca, **las 30 traen historial**.

**EL PROBLEMA, y es el que motivo la sesion.** El workflow pedia `*/30 * * * *`
y **GitHub lo estaba corriendo cada 2 a 5 horas**. Medido sobre 12 corridas
seguidas: huecos de 111, 137, 166, 176, 184, 214, 265, 273, 277, 280 y **308
minutos**. El peor: **5.1 horas**.

Eso no es cosmetico. `/me/player/recently-played` devuelve como maximo **las
ultimas 50** reproducciones, o sea ~2.9 horas de escucha seguida. Con huecos de
5 h se pierden reproducciones, **y no se recuperan**: para eso habria que volver
a pedir el export y esperar 30 dias.

Es el mismo atraso del cron de Actions que ya estaba documentado desde el
2026-08-22 con `keep-awake` (huecos de 40-90 min), solo que aqui salio peor y
aqui si cuesta datos.

**Todavia no se habia perdido nada.** Se revisaron las 10 ultimas capturas y el
maximo que devolvio Spotify fue **23 de 50** (46% del buffer). Margen real, pero
muy lejos del "es imposible perder algo" que se habia prometido al disenarlo.
Se llena en un dia de escucha intensa: un road trip, o un dia de trabajo con
musica continua.

Angel: *"dale el arreglo de los cron, no quiero perder el historial"*.

**LA SOLUCION: Cloud Scheduler.** Job `capture-listening` en `us-east4` (la
misma region que Cloud Run), **cada 15 min**, con 3 reintentos y deadline de
90 s. Se eligio sobre cron-job.org porque vive en el mismo proyecto de GCP que
ya se administra, y sobre subirle la frecuencia a Actions porque el problema de
Actions no es la frecuencia pedida sino que no la respeta.

Costo: **$0**. Cloud Scheduler regala 3 jobs por cuenta de facturacion y este
es el primero. Hubo que habilitar `cloudscheduler.googleapis.com`, que no lo
estaba.

**El detalle que se habria repetido:** el job va con `--message-body='{}'` y
`Content-Type: application/json`. Sin body, Cloud Run responde **411 Length
Required** desde el balanceador — el mismo bug que tumbo el workflow el 2026-09-02
y que ahi se arreglo con `--data ''`. Quedo escrito en `CLAUDE.md` para que no
se caiga por tercera vez.

**Verificado end-to-end, no por el estado del job:** se forzo una corrida y se
confirmo en los logs de Cloud Run la peticion real —
`02:32:31  HTTP 200  Google-Cloud-Scheduler`. El `status: {}` vacio del job
tambien indica exito (gcloud omite el codigo cuando es 0), pero el log del
servidor es la prueba de que llego y respondio bien.

**El workflow de Actions NO se borro: se degrado a red de seguridad**, cada 6 h
(`17 */6 * * *`). El riesgo que cubre es perdida irreversible de historial, asi
que vale la pena tener un segundo mecanismo por si el job se borra, se
deshabilita la API o falla la facturacion. La captura es idempotente (filtra por
cursor **y** por `played_at`), asi que solaparse con Cloud Scheduler no cuenta
nada dos veces — eso ya estaba probado contra produccion el 2026-09-02.

**PENDIENTES (sin cambios respecto a ayer, salvo el cron ya cerrado):**

- [x] **El cron — RESUELTO.** Cloud Scheduler cada 15 min, Actions de respaldo.
- [ ] Cola de "califica lo que si escuchas": los 1,538 Me Gusta sin calificar,
      ordenados por reproducciones de los ultimos 12 meses. Sigue siendo lo de
      mas valor: la app esta ciega a dos tercios de lo que Angel escucha.
- [ ] Vista de abandonadas (las 721).
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] Seccion 7, los mixes. Primer paso son 5 min: **verificar si
      `/recommendations` sigue vivo para esta app**.
- [ ] `MYSQL_PORT` sigue sin leerse.
- [ ] `frontend/package-lock.json` sigue sin versionar, esperando decision.
- [ ] `.claude/worktrees/` guarda una copia entera del repo de una sesion vieja.
      Ya esta en `.gitignore`; falta decidir si se borra.

---

## 2026-09-03 (sesion import del historial de escuchas)

**Maquina: laptop del trabajo.** Primera vez que se trabaja en esta maquina en
el repo — sin cambios de codigo, solo un pendiente operativo de la sesion
anterior.

**Cerrado el unico pendiente de la sesion del 2026-09-02: correr el import.**
Angel no lo habia corrido porque necesitaba la contrasena de MySQL, que vive
en Secret Manager desde la rotacion del 2026-08-25. La saco el mismo de la
consola de GCP (Secret Manager -> `mysql-password` -> ver valor de la version
`latest`) y la puso en su propia shell — el valor no paso por Claude, que era
el punto de haberla movido ahi.

**Esta laptop no tenia ninguna dependencia del backend instalada**, y salieron
en cascada: `mysql-connector-python`, luego `pandas`, luego `python-dotenv`.
Ninguna es sorpresa por si misma (es la deuda de las "dos maquinas" de
`CLAUDE.md` global), pero una si vale la pena anotar: **`pandas==2.2.2`, la
version fija en `requirements.txt`, no tiene wheel para Python 3.14** (lo que
trae esta laptop). `pip install -r requirements.txt` intento compilarlo desde
fuente con meson y murio buscando `vswhere.exe` — hubiera exigido instalar
Visual Studio Build Tools solo para correr un script de una vez. Se instalo
`pandas` sin fijar version y cayo en la `3.0.5`, que si trae wheel. `database.py`
solo la usa para `pd.DataFrame` / `pd.to_datetime` en unas pocas funciones, asi
que no deberia haber incompatibilidad, pero si alguna vez sale un error rato de
pandas en un script local (no en produccion, que sigue en `2.2.2` via Docker),
es por ahi.

**El import corrio limpio:** 187,577 reproducciones leidas de los 17 JSON
(2018-2026), 132 filas sin `spotify_track_uri` ignoradas, procesado en 1.1s.
Subido a MySQL en lotes de 1000: 23,914 filas escritas en 7.5s. La diferencia
entre las 187,577 reproducciones leidas y las 118,735 que quedaron contadas en
`plays` es a proposito — el script aplica el mismo umbral de 30s que ya usa la
app para contar una reproduccion como tal (`UMBRAL_PLAY_MS`), asi que los
numeros significan lo mismo en los dos lados.

**Verificado contra produccion**, no solo con el output del script:
`GET /tracks/listening/summary` respondio `{"tracks":23918,"plays":118735,
"hours":5853.5,"first_played":"2018-01-28T16:55:58",
"last_played":"2026-09-03T02:54:39"}` — la tabla `listening_stats` ya tiene
datos reales y "Mis escuchas" en Biblioteca deberia mostrarlos.

Sin commit de codigo — solo se corrio el script que ya existia. Este archivo
se actualiza y sube como cierre de sesion.

---

## 2026-09-02 (sesion historial de escuchas real)

**Maquina: PC `AngelPC`.**

Angel abrio con cuatro ideas de golpe: mixes tipo Blend con varias personas,
limpiar los Me Gusta, mixes de artistas, y — como idea futura — abrir RateApp a
mas gente. Se documentaron las cuatro en `Mejoras.txt` (secciones **7, 8 y 9**
nuevas) y luego la sesion se fue entera a la 8, porque **Angel ya tenia pedido
el export de Spotify** y lo puso en `historial/` a media conversacion.

**Lo primero fue tapar un hoyo, antes de tocar los datos.** `historial/` estaba
untracked pero **no** en `.gitignore` ni en `.dockerignore`. Un `git add .`
distraido subia 156 MB a GitHub, y no son solo canciones: **cada fila trae
`ip_addr`**. Ademas reventaba el contexto de Cloud Build, que en agosto se habia
bajado de 143 MB a 11. Agregado a los dos archivos y verificado con
`git check-ignore`.

**Que hay en el export:** 187,577 reproducciones, 23,914 canciones unicas,
**5,872 horas** (244 dias enteros), de 2018 a hoy. La cobertura del join salio
al **99.3%** y solo 2 filas de 187 mil no traen `spotify_track_uri` — mucho
mejor de lo que se le habia advertido a Angel.

**EL HALLAZGO QUE CAMBIO LA FEATURE: la premisa estaba equivocada.**

Angel pidio "las menos escuchadas". Se midio y **no existen**: de 2,212 Me Gusta
con 6+ meses, solo **32 (1%)** tienen 0-2 reproducciones en toda su vida. La
mediana de un Me Gusta suyo son **22 escuchas completas**. No hay basura por
volumen, y construir la feature como se pidio habria dado una pantalla vacia.

Lo que si existe es otra cosa, y es lo que de verdad le molesta:
**721 de 2,328 Me Gusta (31%) estan ABANDONADAS** — las escucho mucho hace anios
y lleva 12+ meses sin ponerlas. Ejemplo: "Cuarto de Hotel" de Gera MX, **108
reproducciones, cero en 12 meses**. La lista es el retrato de su gusto de hace
2-4 anios (Gera MX, C. Tangana, LATIN MAFIA, Tiago PZK).

**La metrica correcta no era volumen, era recencia.** "Nunca la escuche" y "ya
no me gusta" son dos cosas distintas y solo la segunda describe el problema.
Quedo escrito en `Mejoras.txt` §8, junto con la advertencia de que *abandonada
!= basura*: la app **no** debe quitar likes sola.

**HALLAZGO APARTE, y puede valer mas que la limpieza:** **1,538 de los 2,328
Me Gusta (66%) nunca pasaron por RateApp.** La app conoce 1,310 tracks. Hay
canciones con 29 reproducciones en el ultimo anio sin calificar (Easykid, Nsqk,
Alvaro Diaz). O sea la app esta ciega a dos tercios de lo que Angel escucha.

**Tercer dato, que Angel pidio de pasada:** **317 canciones que escucha hoy y
nunca likeo** (OUTRO de Omar Courtz, 34 plays este anio). Y confirmo su sospecha:
las mas escuchadas fuera de Me Gusta (Gera MX 91 plays, Cosculluela, Anuel, todas
con 0 en 12 meses) tienen el perfil exacto de las abandonadas — si son canciones
que likeo y quito.

**Roza la seccion 6b:** de las 721 abandonadas solo 30 son A+ y 26 son A. O sea
el historial **no** delata que Angel infle A+ en canciones que ni oye. Dato
limpio para cuando se mida latte 2026 en enero.

**EL MIEDO DE ANGEL, y como se resolvio.** Dijo textual que le daba miedo que
"la aplicacion termine tardando anios en cargar", porque los tiempos ya se
habian arreglado en agosto y no queria descomponerlos. Se le contesto con
numeros y el diseno salio de ahi:

  - La tabla nueva son ~24k filas contra las ~1.3k de `tracks`: **3.5 MB, el
    0.07% de la cuota de TiDB**. Un lookup por PK en 24k filas es
    indistinguible de uno en 1,310 — lo que domina son los ~80 ms de viaje a
    `us-east-1`, no el tamanio.
  - **Tabla INDEPENDIENTE.** `load_all()` no la toca y ninguna query existente
    cambia, asi que los tiempos de hoy quedan literalmente igual.
  - El error que si costaria caro es **una query por cancion dentro de un loop**:
    500 canciones x 80 ms = **40 segundos**. Por eso existe
    `get_listening_many()` con un solo `IN (...)`, y la regla quedo escrita
    tanto en `database.py` como en `CLAUDE.md`.
  - El import inicial fila por fila serian ~24k viajes (media hora larga y
    Request Units quemadas): se hace con `executemany` en lotes de 1000.

**Codigo:**

`backend/database.py` — `listening_stats` (track_id PK, name, artist, plays,
skips, ms_total, first_played, last_played, indices en last_played y plays) mas
`ensure_listening_table`, `replace_listening_batch` (import: pisa),
`add_listening_batch` (captura: **suma**), `get_listening`, `get_listening_many`
y `get_listening_summary`. Las dos funciones de escritura son distintas a
proposito: el import conoce la verdad absoluta de una cancion y la sobreescribe,
la captura solo sabe de las reproducciones nuevas y tiene que sumarlas. Usar
replace en la captura resetearia cada cancion a lo que vio la ultima media hora.

`backend/main.py` — `ensure_listening_table()` en el lifespan.

`backend/routes/tracks.py` — `GET /tracks/listening/summary`,
`POST /tracks/listening/capture` y `GET /tracks/listening/{track_id}`.
Ojo con el orden de registro: las dos rutas literales van **antes** de la
parametrizada, si no `{track_id}` se come a `summary` y a `capture`.

`backend/scripts/import_historial.py` (nuevo) — procesa los JSON y sube el
agregado. **La contrasena sale de una variable de entorno**, nunca de un
archivo: en la sesion del 2026-08-25 se decidio que ese valor no pasara por
Claude, y se respeto. Los demas datos de conexion se sacaron de Cloud Run con
`gcloud run services describe` (no son secretos): `MYSQL_DATABASE=rateapp`.

`.github/workflows/capture-listening.yml` (nuevo) — POST a `/listening/capture`
cada 30 min.

`frontend/` — `api.getListening()`, componente `ListeningModal.jsx`, y la opcion
**"Mis escuchas"** en el menu ⋯ de la tabla de Biblioteca.

**LA PREGUNTA DE ANGEL QUE VALIA LA PENA, y la respuesta es buena.** Pregunto si
para medir de hoy en adelante hay que tener la app prendida — su cabeza decia
que si. **No.** Spotify guarda el historial de su lado, asi que la app solo tiene
que despertar cada tanto y preguntar por `recently-played`. Eso significa
**historial perpetuo sin volver a pedir el export nunca**.
  - El scope `user-read-recently-played` **ya estaba** desde mayo. Cero re-login.
  - El limite real: el endpoint devuelve maximo **las ultimas 50**
    reproducciones. Perder algo con captura cada 30 min exigiria 50 canciones en
    media hora. El margen es enorme.
  - Imprecision conocida y documentada: `recently-played` dice QUE se escucho,
    no por cuanto tiempo, asi que `ms_total` se aproxima con la duracion del
    track. `plays` queda exacto; solo las horas derivan un poco hacia arriba
    contra el export, que si trae `ms_played` real.

**EL BUG QUE ATRAPO LA VERIFICACION, y era de los caros.** El filtro
anti-duplicados comparaba `played_at <= cursor` como **strings**. Con un cursor
corrupto — un `"basura"` cualquiera — resulta que `"2026-09-02..." <= "basura"`
es **True**, porque `"2" < "b"` en ASCII. O sea: un cursor invalido habria
bloqueado toda captura futura, **en silencio y para siempre**, sin un solo error
en los logs. Arreglado descartando por completo el cursor que no parsea. Es
justo el tipo de fallo que no se encuentra mirando el codigo.

**Verificacion: 21 casos, sin red y sin MySQL** (capa de `mysql.connector`
stubeada y un cliente de Spotify de mentiras). Lo que mas importaba era el
doble conteo, porque ese error es silencioso y permanente: re-capturar la misma
ventana no cuenta nada; con el cursor a la mitad de la tanda solo entra lo
posterior; la misma cancion tres veces suma `plays=3` en una sola fila con
`first_played`/`last_played` correctos; el cursor se manda a Spotify como epoch
ms; una ventana vacia no truena ni mueve el cursor; items sin track no rompen la
corrida; un cursor ilegible se ignora y captura igual; y si Spotify se cae sale
un 502 legible y no un 500 pelado. Ademas se importo la app real (46 rutas, 43
antes) verificando que la ruta generica quede registrada al final, y
`npm run build` OK (1586 modulos).

`import_historial.py` se probo con `--dry-run` contra los 156 MB reales:
187,577 filas procesadas en **1.2 s**.

**DOS BUGS MAS, y los dos solo aparecieron EN PRODUCCION.** La verificacion
local (21 casos) no podia atraparlos: uno vive en el balanceador de Google y
el otro solo existe cuando la tabla tiene datos.

1. **`POST` sin body -> 411 Length Required.** Cloud Run exige
   `Content-Length`, y `curl --request POST` pelado no lo manda. El workflow
   recien escrito **habria fallado cada 30 min sin capturar nada** — con
   `--fail` se habria visto en rojo en Actions, pero jamas habria funcionado.
   Arreglado con `--data ''`. Comprobado contra produccion: pelado -> 411,
   con `--data ''` -> 200.

2. **`Decimal / float` -> TypeError en `get_listening_summary`.** MySQL
   devuelve `Decimal` para `SUM()`. Con la tabla VACIA el `COALESCE(SUM(),0)`
   entrega un 0 entero y todo pasa; en cuanto entro la primera captura real, el
   endpoint empezo a dar 500. O sea el bug se escondia exactamente hasta que
   habia datos. Confirmado leyendo el traceback de Cloud Logging antes de
   tocar nada (`database.py` linea 576), no adivinando. Arreglado con `int()`
   antes de dividir, en `get_listening_summary` y en `_listening_row`.
   Se agregaron 12 casos que simulan los tipos que MySQL devuelve DE VERDAD
   (Decimal en los SUM, datetime en las fechas): 33 comprobaciones en total.

**LA CAPTURA YA CORRIO EN VIVO Y FUNCIONA.** Primera llamada real: 50
reproducciones, 36 canciones tocadas. Y la idempotencia quedo probada contra
produccion, que era lo que mas importaba: segunda llamada seguida trajo 1 play
nuevo (Angel estaba escuchando algo en ese momento) y la tercera trajo 0.

**Nota de metodo:** el primer intento de verificar el deploy dio un falso
positivo. Se buscaba `status 200` en el endpoint nuevo, pero el fallback del
SPA devuelve `index.html` con 200 para cualquier ruta sin extension — o sea la
revision VIEJA parecia tener el endpoint. Hay que verificar que la respuesta
sea JSON, no que el status sea 200. Aparte: Cloud Build tardo ~15 min en
arrancar (antes eran 2:35 de punta a punta), y los builds de este proyecto
viven en la region `us-east4` — `gcloud builds list` sin `--region` sale vacio
y parece que no hay nada.

**PENDIENTES:**

- [ ] **Correr el import.** Lo tiene que hacer Angel, porque necesita la
      contrasena: `$env:MYSQL_PASSWORD = '...'` y luego
      `python backend/scripts/import_historial.py`. Hasta que eso pase, la tabla
      existe pero vacia y el modal dira "sin registro de escuchas".
- [ ] Cola de "califica lo que si escuchas": los 1,538 Me Gusta sin calificar,
      ordenados por reproducciones de los ultimos 12 meses.
- [ ] Vista de abandonadas (las 721) para limpiar Me Gusta.
- [ ] Vista de las 317 que escucha y no tiene likeadas.
- [ ] Seccion 7: los mixes. Angel quiere el **persistente** primero (novia y un
      par de amigos, <=10 personas, sin problema en darlos de alta a mano en el
      dashboard) y el desechable de road trip despues. **Antes de disenar nada,
      verificar si `/recommendations` sigue vivo para esta app** — se deprecio en
      nov 2024 para apps en development mode, y de eso depende que el mix pueda
      descubrir o solo cruzar.
- [ ] `MYSQL_PORT` sigue sin leerse. **No se toco a proposito**: mezclarlo con
      este deploy habria complicado el diagnostico si algo fallaba. Va aparte.

---

## 2026-08-25 (sesion secreto a Secret Manager + apagado de Render)

**Maquina: PC `AngelPC`.**

Sin cambios de codigo de la app. Infraestructura y seguridad.

**Estado al abrir.** Working tree limpio, `HEAD` = `origin/main` en `5f07dcc`.
Nada de codigo desde el 22. Se reviso el deploy en vivo y de paso cayo el
pendiente #1 solo.

**El arranque en frio de Cloud Run, medido (pendiente #1 cerrado).** No hizo
falta el experimento controlado: el ping de GitHub Actions tiene los huecos de
40-90 min que ya se documentaron, asi que el servicio estaba frio y el primer
`curl` lo agarro. Dos mediciones independientes, con horas de diferencia:

```
Cloud Run  primer golpe (frio)   4.98 s  /  4.17 s
Cloud Run  siguientes (tibio)    0.15 s     0.16 s
Render     primer golpe (frio)  21.43 s
```

Dentro del estimado de 3-5 s que se hizo por los imports. Contra los 21 s de
Render son ~5x en el peor caso, sumados al ~8x en las queries. La migracion
queda justificada con numeros propios, que era lo unico que faltaba.

**Render suspendido.** Angel lo hizo desde el dashboard (Settings -> Suspend).
Verificado: `503` en 0.35 s. El workflow `keep-awake` ya apuntaba a Cloud Run
desde el 22, asi que suspenderlo no rompio el ping.

Advertencia que se le dio antes de tocar nada, porque cambia el orden correcto
de las dos tareas: **rotar la contrasena mata a Render de todos modos**, porque
se queda con la credencial vieja. Por eso Render se apago primero — si no,
quedaba un servicio prendido tirando errores contra la base. Corolario: Render
ya no es red de seguridad; revivirlo pide actualizarle la variable a mano.

**Herramienta nueva: `gcloud` en la PC.** Instalado con
`winget install Google.CloudSDK` (v582), autenticado como
`cruzangelramirez26@gmail.com`, proyecto `rateapp-506404`. Ojo: winget no
refresca el PATH de las shells ya abiertas, asi que en esta sesion se invoco
por ruta completa
(`%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`).

Nota de PowerShell 5.1: `gcloud` escribe sus mensajes de estado a stderr y
PowerShell los envuelve en `NativeCommandError` aunque el comando haya salido
en 0. "Created secret", "Updated IAM policy" y "Deploying..." aparecen como
errores rojos y **no lo son**.

**La rotacion.** El secreto `mysql-password` se creo vacio y con
`roles/secretmanager.secretAccessor` para
`1043427819721-compute@developer.gserviceaccount.com` (la cuenta default de
Compute, la misma del incidente de Developer Connect del 22).

El usuario de la app resulto ser `4CCP4ijs5Bk8TUT.root`, el root del cluster
con el prefijo de TiDB. En TiDB Serverless no hay pestana de usuarios SQL: el
reset vive dentro del dialogo *Connect*, en un link chico de "Reset Password"
al lado de "Existing connections are based on password you've set before".

**El valor nunca paso por Claude, a proposito.** Angel roto en TiDB y pego la
contrasena directo en la consola de Secret Manager (`+ Nueva version`). Se
descarto el camino por CLI justamente para eso, y de paso evita el error
clasico: `--data-file` toma los bytes tal cual, asi que un salto de linea al
final del archivo entra al secreto y la conexion falla con un error de
credenciales que no dice nada util.

Luego, un solo comando:

```
gcloud run services update rateapp --region us-east4 \
  --remove-env-vars MYSQL_PASSWORD \
  --update-secrets MYSQL_PASSWORD=mysql-password:latest
```

Revision `rateapp-00006-tpl`, 100% del trafico. Ventana real sin base: los ~3
min entre el reset y que la revision quedara arriba.

**Verificado en vivo:** `/health` 200 en 0.22 s; `/tracks/stats` 200 con datos
reales (1302 tracks) — esa es la prueba de verdad, porque pega a la base y por
lo tanto confirma que la contrasena **nueva** funciona; `/auth/status` sigue
autenticado, o sea el token de Spotify que vive en MySQL sobrevivio a la
rotacion. Y en la definicion del servicio, `MYSQL_PASSWORD` ahora sale de
`secretKeyRef: mysql-password / latest` con el valor literal vacio.

**EL HALLAZGO QUE IMPORTA, y que cambia como se piensa esto.** Las revisiones
viejas de Cloud Run son inmutables y **conservan la contrasena en texto plano**.
Comprobado sin imprimir el valor, midiendo solo su longitud:

```
rateapp-00005-5d4  ->  MYSQL_PASSWORD  longitud=16
rateapp-00004-mcm  ->  MYSQL_PASSWORD  longitud=16
```

O sea: **mover el secreto a Secret Manager, por si solo, no habria cerrado
nada.** Las 5 revisiones anteriores siguen siendo copias de la credencial
filtrada, y cualquiera con acceso a la consola las puede leer. Lo que cerro la
fuga fue la **rotacion**; el Secret Manager es lo que evita que vuelva a pasar.
Vale la pena tenerlo presente en general: cualquier secreto que se ponga alguna
vez como variable de entorno en Cloud Run queda filtrado en todas las
revisiones que lo hayan tenido, para siempre.

Efecto lateral: hacer rollback a `00005` o anterior ya no sirve de nada — esas
revisiones no pueden conectarse a la base. Borrarlas eliminaria el texto plano
por completo, pero es irreversible y se dejo a decision de Angel.

**NO ES UN SECRETO, SON TRES.** Al listar las variables del servicio salio esto:

```
FRONTEND_URL   SPOTIPY_REDIRECT_URI   MYSQL_DATABASE   MYSQL_HOST
MYSQL_PASSWORD   MYSQL_PORT   MYSQL_USER   SECRET_KEY
SPOTIPY_CLIENT_ID   SPOTIPY_CLIENT_SECRET
```

`SPOTIPY_CLIENT_SECRET` y `SECRET_KEY` siguen en texto plano y estaban igual de
expuestas. Si la captura del 22 mostraba el panel de variables completo, **las
tres salieron en la foto**, no una. Quedan sin tocar por decision pendiente de
Angel: rotar el client secret de Spotify obliga a actualizarlo en el dashboard
de Spotify, y `SECRET_KEY` hay que ver que invalida antes de moverla.

**`MYSQL_PORT` confirmado por partida doble.** El dialogo de TiDB dice
`PORT: 4000` y la variable en Cloud Run vale `4000` — y el codigo sigue sin
leerla, asi que cae al 3306 por default. Funciona de casualidad porque TiDB
tiene los dos puertos abiertos. Sigue pendiente el arreglo de 3 lineas.

**PENDIENTES QUE QUEDAN:**

- [x] **Arranque en frio de Cloud Run — MEDIDO.** 4.98 s y 4.17 s en frio,
      0.15 s tibio, contra 21.4 s de Render.
- [x] **Render — SUSPENDIDO.** Verificado en 503.
- [x] **`MYSQL_PASSWORD` — rotada y en Secret Manager.**
- [ ] **Decidir sobre `SPOTIPY_CLIENT_SECRET` y `SECRET_KEY`**, que siguen en
      texto plano y probablemente tambien salieron en la captura.
- [ ] Decidir si se borran las revisiones `00001`-`00005`, que conservan la
      contrasena vieja en texto plano (ya inservible, pero ahi esta).
- [ ] Tauri (seccion 5 del backlog). Es lo que sigue en el plan de Angel.
- [ ] `MYSQL_PORT`: el arreglo de 3 lineas, ofrecido tres veces ya.
- [ ] Sin respuesta: el link bonito (ver abajo). Anotado en `Mejoras.txt`.

**CIERRE: 6b entra en pausa hasta latte 2026, y de paso se corrige el plan.**

Angel pregunto "a que te refieres con medir A+" y al explicarselo salio un
error en el plan que traia el log del 22.

**Medir al cierre de miel 2026 no sirve.** Miel va de mayo a agosto y el
arreglo del orden entro el **21 de agosto**: mas del 90% de miel se califico
bajo el incentivo viejo. El 4.8 de hoy esta contaminado y el numero del 31 lo
estaria casi igual. El primer dato limpio es **latte 2026** (sep-dic), el
primer cuatrimestre completo despues del arreglo.

Se le ofrecio el atajo — construir el endpoint de solo lectura para cortar por
fecha de calificacion y comparar antes/despues del 21 de agosto, lo que daba la
respuesta en semanas en vez de meses. Ahi se vio que los dos pendientes que
venian sueltos en la lista eran uno solo: **el endpoint era lo que hacia
medible 6b**.

**Angel entendio otra cosa y hubo que aclararlo:** pregunto "o sea dices que
podemos recalificar canciones de ese periodo para que este sano?". No — lo
propuesto era medir. Se le separaron los dos objetivos, que es lo que
destraba la conversacion:

- *"encontrar rapido una A nueva"* -> ya esta 80% resuelto (226 -> ~47), y si
  quiere mas, la palanca es el **paso 2** (score con decaimiento): codigo, cero
  trabajo manual, reversible.
- *"que mis calificaciones signifiquen lo que dicen"* -> solo eso pide
  recalificar.

Y el argumento que mato la opcion de recalificar: son 167 A+ solo en perla
2026, y **en la DB el workaround y la calificacion sincera se ven identicos**.
Esa distincion solo vive en la cabeza de Angel, cancion por cancion.

**Su decision:** *"va entonces eso cierralo, veremos el cambio en latte"*.
Escenario **solo hacia adelante**. El endpoint de solo lectura **sale** de los
pendientes: se iba a construir para saber si hacia falta actuar, y ya se decidio
esperar el dato natural.

Que medir en enero 2027: `GET /tracks/stats` -> `by_cuatri` -> latte 2026, y
sacar A+/A. ~2 cierra 6b definitivamente; 3-4 pide evaluar el paso 2; 5-7
significa que el incentivo no era la unica causa. Referencia: 2025 iba en
1.6-2.4 y perla 2026 en 7.0. Todo quedo en `Mejoras.txt` §6b, que pasa de
`[ANALISIS, sin decidir]` a `[EN PAUSA - se decide con latte 2026]`.

**El link feo.** Angel pregunto si se puede acortar gratis. Se le explico que
un dominio propio siempre cuesta y que gratis solo hay subdominio prestado, con
la trampa de que la via "oficial" en `us-east4` puede acabar en un balanceador
global de ~$18/mes — mas caro que el dominio. Recomendacion: Firebase Hosting,
o mejor **no hacerlo**, porque instalada como PWA no vuelve a ver la URL.
Quedo sin respuesta y anotado en `Mejoras.txt`.

**TAURI: ANDAMIO ARMADO (seccion 5 del backlog).**

Angel: "dale tauri". Alcance que eligio: **solo dejar el andamio compilando**,
sin instalador ni bandeja.

**Prerrequisitos.** Node 24.13 y WebView2 151.0.4129 ya estaban; faltaban Rust y
la cadena de C++ de Microsoft, ~5 GB. Instalados con winget
(`Rustlang.Rustup` y `Microsoft.VisualStudio.2022.BuildTools` con
`--add Microsoft.VisualStudio.Workload.VCTools`). Resultado: rustc 1.98.0,
cargo 1.98.0, toolchain `stable-x86_64-pc-windows-msvc`, CLI de Tauri 2.11.4.

**La decision de arquitectura: cascaron sobre la URL de Cloud Run.** La ventana
apunta a `https://rateapp-1043427819721.us-east4.run.app`; no se empaqueta el
frontend dentro del `.exe`.

La razon que mando **no** fue el trabajo ahorrado: con este esquema **cada push
sigue actualizando la app de escritorio sola**. Empaquetando, cada cambio de
frontend obligaria a recompilar y reinstalar el `.exe` — un impuesto permanente
en una app que se toca seguido.

Y de paso esquiva dos obstaculos reales que habria que resolver en el otro
camino: `frontend/src/utils/api.js:7` tiene `BASE = ''`, o sea rutas relativas,
que dentro de Tauri resolverian contra `tauri://localhost` y **no funcionaria
nada**; y el CORS de `backend/main.py:29` no incluye el origen de Tauri.

`frontendDist` acepta una URL en Tauri v2, asi que no hace falta ni un
`index.html` local. Tampoco hace falta Vite — lo que encaja con que el backend
nunca corre en local (el proxy de `vite.config.js:8` apunta a `localhost:8000`,
que en este setup no existe).

**Donde vive: `desktop/` en la raiz, NO `frontend/src-tauri/`.** El Dockerfile
hace `COPY frontend/ ./`, asi que fuentes de Rust ahi dentro se subirian en cada
build de Cloud Build y desharian el trabajo del `.dockerignore` del 22.
Agregado `desktop/` a `.dockerignore` y `target/`+`gen/` a `.gitignore`.

**Tres cosas que `tauri init` genero mal y hubo que corregir:**

1. `identifier` venia como `com.tauri.dev`, el marcador por defecto — Tauri se
   **niega a empaquetar** con ese valor. Ahora `com.angelrg.rateapp`.
2. `beforeDevCommand` venia como `npm run dev`. Como el `package.json` de
   `desktop/` tambien tiene un script `dev` que llama a `tauri dev`, eso era una
   **recursion infinita**. Los dos comandos previos van vacios: no hay frontend
   local que construir.
3. `targets: "all"` incluia formatos de macOS y Linux, imposibles de generar en
   Windows. Ahora `["msi", "nsis"]`.

**EL HALLAZGO, y es el que mas caro habria salido.** La primera compilacion
genero **4.25 GB en 3,118 archivos DENTRO de OneDrive**.

`.gitignore` no protege de esto: **OneDrive no lo lee**. Habria intentado subir
los 4.25 GB, comerse la cuota, y — peor — OneDrive bloquea archivos mientras
sincroniza, lo que puede **tronar una compilacion a media corrida**. Cada
rebuild reescribe cientos de archivos, o sea sincronizacion perpetua.

Arreglado con `desktop/.cargo/config.toml` que manda `build.target-dir` a
`%LOCALAPPDATA%
ateapp-rust-target`, fuera del arbol sincronizado. Se borro el
directorio viejo y se recompilo: **1m23s** (la primera vez fueron 2m23s).

Es una trampa general del repo, no de Tauri: **este proyecto vive en OneDrive**,
asi que cualquier herramienta que genere artefactos pesados necesita que se le
diga explicitamente donde escribir.

**Verificacion.** Ventana abierta con titulo `RateApp`, 36 MB, y 6 procesos de
WebView2 colgando de `app.exe`. Angel confirmo por captura: **carga la app
completa con datos reales** — 18 pendientes, portadas, el tema oscuro, todo.

Ojo con el metodo: se intento verificar por red y **el chequeo salio
inconcluso** — la conexion establecida salia hacia un rango latinoamericano
(`2806:2f0:...`) y no hacia los `2600:1900:...` que devuelve el DNS de Cloud
Run; lo mas probable es un nodo cache de Google dentro del ISP, pero es una
suposicion. La verificacion valida fue la captura de Angel, no el forense.

**Y confirma, otra vez, el trabajo del token en MySQL:** la app de escritorio
quedo **autenticada sin un solo login**. Si el token siguiera en disco, aqui
habria hecho falta re-loguear.

**PENDIENTES DE TAURI (para la fase siguiente):**

- [ ] Icono propio. Hoy usa el generico de Tauri, y se ve en la barra de titulo
      y en la de tareas. La app ya tiene su logo "A+" en el sidebar.
- [ ] Fase 1 completa: icono de bandeja, arranque con Windows, e instalador
      (`tauri build` -> msi/nsis). **Sin probar todavia.**
- [ ] Fase 2: teclas multimedia globales. Los endpoints del player ya existen
      (`/tracks/player/{play,pause,next,previous}`), asi que es trabajo del lado
      de Rust. Ojo: **el Spotify de escritorio ya captura esas teclas** y ahi
      suele estar el conflicto.
- [ ] Fase 3: ventana flotante always-on-top que reemplace el PiP.
      **BLOQUEADA por la seccion 3**: una ventana de Tauri necesita una URL a la
      que apuntar, y hoy el PiP no es una ruta — se genera con cadenas de HTML
      dentro de `NavBar.jsx`. Hace falta primero una ruta `/player` de verdad.
      Dicho de otro modo: **Tauri no se salta el trabajo del reproductor, lo
      desbloquea.**
- [ ] Dato util para la seccion 3: **`lucide-react` ya esta instalado** en el
      frontend, asi que la tarea de "iconos SVG en vez de emoji" no necesita
      dependencia nueva.
- [ ] Seccion 3 del backlog: el PiP rehecho en React (9 sub-tareas).

---

## 2026-08-22 (sesion token de Spotify a MySQL)

**Maquina: PC `AngelPC`.**

Se cerro el pendiente #1 de la sesion anterior, que era el de mas valor.

**Estado al abrir la sesion.** Working tree limpio, `HEAD` igual a
`origin/main` en `7443c89`: nada de codigo desde ayer, los 4 pendientes
intactos. Se reviso el deploy en vivo y salieron dos cosas.

`/auth/status` devolvia `{"authenticated": false}` — la sesion de Spotify
caida otra vez, o sea el pendiente #1 manifestandose en el momento. Y
`/health` tardo **21 segundos** en responder: el server estaba dormido.

**Hallazgo lateral: el ping no esta funcionando como se penso.** El workflow
corre y da `success`, pero los intervalos reales no son de 10 minutos:

```
02:13  <- ultimo (eran las 02:54 UTC, 41 min de hueco)
00:43  (90 min de hueco con el anterior)
23:52
23:36
23:14
```

El retraso del cron de GitHub Actions que se anoto como advertencia ayer
resulto peor de lo estimado: huecos de 40-90 min contra los 15 min que tarda
Render en dormirse. El ping no alcanza. cron-job.org sigue siendo la
alternativa anotada. **No se toco** — queda como pendiente.

**El cambio: `MySQLCacheHandler`.**

`backend/spotify.py` — clase nueva que subclasea el `CacheHandler` de spotipy
y lee/escribe el token en la tabla `config` bajo la clave `spotify_token`. Es
el mismo patron que ya usaban `aplus_cutoff` y el estado del Modo Virtual.
`cache_path=".spotify_cache"` se reemplaza por `cache_handler=`.

Guarda una copia en memoria a proposito: sin eso, cada request pegaria a TiDB
en `us-east-1` solo para leer el token. La DB se lee unicamente cuando el
proceso todavia no tiene ninguno.

Manejo de fallos, y las dos ramas son deliberadamente distintas:
- **Lectura** que falla devuelve `None`, que se traduce en "no autenticado".
  Es honesto: si no se puede leer el token, no hay token.
- **Escritura** que falla solo registra el error y **no relanza**. El token en
  memoria sigue sirviendo para esa instancia, asi que un fallo al guardar no
  debe tumbar una peticion que de otro modo funcionaba. Lo peor que pasa es
  volver al comportamiento viejo: perder el token al reiniciar.

`backend/database.py` — `delete_config(key)` nuevo, para el logout.

`backend/routes/auth.py` — el logout borra la fila de MySQL via
`spotify.clear_token()` en vez de `os.remove(".spotify_cache")`.

**El hoyo que abria este cambio, y que hubo que tapar en el mismo commit.**

`get_client()` hacia a mano el chequeo de expiracion. Se cambio a
`am.validate_token(am.cache_handler.get_cached_token())`, que es la forma no
deprecada y hace lo mismo **mas** una cosa: descarta el token si le faltan
scopes.

Eso no es cosmetico. Hasta ahora, cada scope nuevo que se agregaba se activaba
solo, porque el redeploy borraba el `.spotify_cache` y Angel re-logueaba de
todos modos — el bug tapaba el problema. Con el token viviendo en MySQL el
token viejo sobrevive, y como sigue siendo valido para todo lo demas, la
funcion nueva habria fallado **en silencio**. `validate_token` compara los
scopes guardados contra `SCOPE` y devuelve `None` si falta alguno, asi que
ahora agregar un scope manda a re-loguear a proposito.

Ojo con el detalle de spotipy: `is_token_expired` y `_is_scope_subset` son
`staticmethod` de `SpotifyAuthBase`. Importa al escribir stubs.

**Verificacion: 18 casos, sin red y sin MySQL** (la capa de `database`
stubeada en `sys.modules` antes de importar `spotify`, y un `SpotifyOAuth` de
mentiras que usa el `validate_token` **real** de spotipy). Roundtrip de
guardar y leer; un proceso nuevo lee el token de la DB, que es el caso del
redeploy; el memo evita lecturas repetidas (5 llamadas, 0 reads extra); token
ilegible y MySQL caido en lectura devuelven `None` sin reventar; MySQL caido
en escritura no relanza y el token en memoria sigue sirviendo; el token
expirado se refresca **y** el refrescado se persiste; a un token al que le
falta un scope se le niega el cliente sin gastar un refresh inutil; y el
logout borra la fila y deja de autenticar.

Ademas se importo la app de verdad con `DeprecationWarning` elevado a error:
`cache_handler` es `MySQLCacheHandler`, el atributo `cache_path` ya ni existe,
los 9 scopes intactos, `get_authorize_url()` bien formada, las 4 rutas de auth
registradas y las 43 del app importando.

**Documentacion.** `ARQUITECTURA.md` §6 (nueva llave `spotify_token`, y el
corolario de "nada a disco" ya sin excepciones), §7.1 (el handler completo, con
las dos ramas de fallo), §7.2 (reescrito: agregar un scope **ya no es gratis**,
y por que), el diagrama de deploy de §11 y la fila de `/auth/logout` en el mapa
de la API. `CLAUDE.md` — la linea de Deploy decia que el token se borra en cada
redeploy; ahora dice lo contrario, que es el punto.

**PENDIENTES QUE QUEDAN:**

- [x] **Confirmar el orden por novedad en Spotify — HECHO.** Angel, al final
      de la sesion: "sip, si funciona el ordenar nuevo". El paso 1 de la
      seccion 6 queda cerrado. El paso 2 (score con decaimiento) sigue en el
      backlog pero ya no es el siguiente movimiento obvio: estaba condicionado
      a que el corte del bloque se sintiera arbitrario, y no se sintio.
- [ ] Endpoint de solo lectura que liste tracks desde la DB sin token de
      Spotify. Hoy `/tracks/stats` solo da agregados y por eso no se puede
      saber **cuales** A+ son candidatas a revisar.
- [ ] Medir el ratio A+/A al cierre de Miel, antes de tocar 6b.
- [ ] El ping: los huecos reales del cron hacen que Render se duerma igual.
      Evaluar cron-job.org.
- [ ] La region de Render. Sigue sin verificarse y en `Mejoras.txt` esta
      marcado "PRIMERO ESTO, es gratis y rapido": si el web service no esta en
      Virginia, cada query cruza el continente contra TiDB en `us-east-1`, y
      `load_all()` jala la tabla completa en casi cada operacion.

**Aclaracion que hubo que hacerle a Angel al cierre.** Pregunto "entonces ya no
se apagara la app?" — no. Son dos problemas distintos y solo se cerro uno. La
app se sigue durmiendo a los 15 min y sigue tardando 30-60 s en arrancar en
frio; lo unico que cambio es que al despertar ya no hay que re-loguear en
Spotify. Quedo escrito tambien en `Mejoras.txt` §4 para que no se confunda
despues.

**Estado del backlog completo, ya que pregunto:** 4 de 9 secciones hechas — 1
(link/play contextual), 2 (modo oscuro), 4b (404 al refrescar) y 6 paso 1
(bloque de novedades). Abiertas: 3 (PiP rehecho, la pieza grande, 9 sub-tareas
sin empezar), 4 (hosting: el ping no alcanza, Cloud Run y Oracle sin tocar, y
la region de Render sin verificar), 5 (apps nativas), 6 paso 2 (probablemente
innecesario), 6b (densidad de A+: falta medir el ratio al cierre de Miel y el
endpoint de solo lectura), las decisiones chicas (`package-lock.json` sin
versionar, `railway.json` vestigio) y la Vista Play del chip `<3333>`.

**Migracion a Google Cloud Run (misma sesion, mas tarde).**

Angel eligio "hosting primero, luego Tauri" cuando se le plantearon las
opciones. La razon de fondo: una pagina web que tarda 40 s en cargar se siente
lenta, pero una app instalada que se congela 40 s al abrir se siente **rota**,
asi que arreglar el arranque en frio antes de empaquetar con Tauri.

**El hallazgo que hizo que valiera doble.** Angel mando captura de los ajustes
de Render: **Oregon (US West)**, con TiDB en Virginia. La deuda de region que
estaba anotada desde hacia dos dias, confirmada. Y como la region de un
servicio es inmutable en Render (el campo Region ni tiene boton de editar),
migrar de hosting era la oportunidad de arreglarla **gratis**: basta elegir
bien la region del servicio nuevo y no hay que mover la base de datos.

Angel tenia el formulario abierto con **`northamerica-south1` (Mexico)**
seleccionado, que era repetir el error al reves. Se le explico por que Mexico
pierde: desde ahi cada request suyo ahorra ~40 ms, pero el servidor hace varias
queries a TiDB por operacion — y `load_all()` jala la tabla completa — asi que
el lado servidor-a-base domina. Se cambio a `us-east4`.

**Medido despues, con los dos servidores despiertos y la misma DB:**

```
GET /tracks/stats     Cloud Run (Virginia)  0.25 0.29 0.27 0.25 0.26 s
                      Render    (Oregon)    2.60 2.76 2.11 1.44 1.61 s
```

~8x, y mucho mas estable. Eso era lo que costaba el viaje Oregon-Virginia.

**Configuracion del servicio** (`rateapp`, proyecto `rateapp-506404`): memoria
1 GiB, CPU 1, min instancias 0, acceso publico, facturacion *basada en
solicitudes* (CPU solo durante el request), y **entorno de ejecucion primera
generacion**, que la consola misma describe como el de "inicios en frio mas
rapidos" — no estaba en el plan, se encontro en el formulario y va justo al
problema que se estaba resolviendo.

**`.dockerignore` (nuevo).** El contexto de build eran 143 MB de los que la
imagen usa 11. Ademas del peso evita un bug latente: el Dockerfile hace
`COPY frontend/ ./` **despues** del `npm install`, asi que un `node_modules` de
Windows en el contexto pisaria el de Linux y `npm run build` tronaria con los
binarios nativos de rollup equivocados. En Render no pasaba porque
`node_modules` esta en `.gitignore` y el build sale del repo. Verificado
aplicando los patrones contra el arbol real, y confirmado en el log de Cloud
Build en produccion: `Sending build context to Docker daemon 10.97MB`.

**El primer build fallo, y no era el codigo.** Murio en `FETCHSOURCE`, antes de
clonar:

```
Error 403: Permission 'developerconnect.gitRepositoryLinks.fetchReadToken' denied
reason: "IAM_PERMISSION_DENIED"
```

La cuenta `1043427819721-compute@developer.gserviceaccount.com` (la default de
Compute Engine, que es la que corre el build) no tenia
`roles/developerconnect.readTokenAccessor`. Es un hueco conocido del flujo de
Developer Connect: conecta GitHub pero no otorga el rol solo. Para cuando se
reviso IAM el rol ya aparecia, asi que basto **reintentar** la compilacion: los
4 pasos en verde en 2:35.

**La prueba de fuego del token en MySQL.** Lo primero que devolvio el servicio
nuevo:

```
GET /auth/status -> {"authenticated":true,"user":"Angel RG"}
```

Angel se logueo en **Render**, y un servidor nuevo en **otra nube** levanto la
sesion sin un solo re-login. El cambio de la manana quedo validado de la unica
forma que importa. Ademas confirma lo que decia el log del 2026-08-21: el token
en disco era prerrequisito de cualquier migracion, no un detalle cosmetico.

**Verificado en vivo:** `/health` 200; las 5 rutas del SPA (`/`, `/recent`,
`/library`, `/tools`, `/dashboard`) devuelven 200 `text/html`, o sea el fix del
404 al refrescar funciona igual en Cloud Run; un asset inexistente sigue dando
404 honesto; `/tracks/stats` 200 con datos reales (1301 tracks, 484 A+, 170 A);
`/playlists/distribution` 200, o sea Spotify responde.

**Bug latente encontrado de paso: `MYSQL_PORT` no hace nada.** Angel lo copio a
Cloud Run con valor 4000 (el puerto de TiDB), pero `config.py` no lo lee y
`database.py:18-27` nunca pasa `port` al pool. Se probaron los dos puertos
contra el host de TiDB y **3306 y 4000 estan ambos abiertos**, asi que el
conector cae al 3306 por default y funciona de casualidad. Si TiDB cierra el
3306 algun dia, revienta con un error confuso. Ofrecido el arreglo (3 lineas),
sin respuesta todavia.

**Nota de seguridad:** `MYSQL_PASSWORD` se ve en texto plano en la pantalla del
servicio de Cloud Run y quedo en una captura. Recomendado moverla a Secret
Manager con el boton "Crea una referencia a un Secret" que esta en la misma
pestana de variables, y rotarla en TiDB. Pendiente de Angel.

**Lo que falta de la migracion:**

- [x] **Redirect URI registrado en Spotify — HECHO.** Angel lo puso al cierre
      de la sesion. Verificado sin necesidad de loguearse: `/auth/login` manda
      `redirect_uri=https://rateapp-1043427819721.us-east4.run.app/callback` y
      Spotify devuelve su pantalla de login normal en lugar de
      `INVALID_CLIENT: Invalid redirect URI`, que es lo que saldria si no
      estuviera dado de alta. Los 9 scopes van intactos.
- [ ] Medir el arranque en frio REAL de Cloud Run. Los 0.25 s medidos son con
      instancia tibia; hace falta dejarlo ~15 min sin trafico. Estimado por los
      imports (~2.3 s solo `import main`): 3-5 s.
- [ ] Apagar Render cuando la migracion se confirme. Hoy los dos corren contra
      la misma base.
- [ ] `MYSQL_PORT` y el secreto en Secret Manager (arriba).

**CIERRE DE SESION (2026-08-22).** Angel: "ya puse el url. guarda logs manana
seguimos".

Estado con el que queda la app: corriendo en Cloud Run `us-east4`, con la
sesion de Spotify viva, el orden por novedad confirmado por el en Spotify, y
Render encendido en paralelo contra la misma base como red de seguridad.

**POR DONDE EMPEZAR MANANA**, en orden:

1. **Medir el arranque en frio real de Cloud Run.** Es el unico numero que
   quedo sin verificar y es el que justifica toda la migracion. Los 0.25 s
   medidos son con instancia tibia. Hay que dejarlo ~15 min sin trafico —
   ojo, el ping de GitHub Actions lo mantiene despierto, asi que hay que
   desactivar el workflow un rato o medir justo antes de que entre un ping.
   Estimado por los imports (~2.3 s solo `import main`): 3-5 s.
2. **Seguir con la seccion 5 del backlog: Tauri.** Es lo que Angel eligio
   despues del hosting, y el hosting ya quedo. Ojo con el encuadre acordado:
   Tauri NO reemplaza el trabajo del reproductor, solo el `<PiPHost>`. El
   backend de progreso/seek y el componente `<PlayerPanel>` se necesitan
   igual — en Tauri sigue siendo React en un WebView, y el celular sigue
   usando la version web.
3. **Los dos pendientes chicos de Cloud Run**: mover `MYSQL_PASSWORD` a Secret
   Manager (y rotarla en TiDB, porque salio en una captura), y decidir si se
   apaga Render.
4. **`MYSQL_PORT`**: el arreglo de 3 lineas quedo ofrecido dos veces y sin
   respuesta. No es urgente — funciona porque TiDB tiene el 3306 abierto — pero
   es una dependencia accidental sin documentar en el codigo (si esta en el
   `.env.example`).

Commits: `e30339d` (token a MySQL), `bb74bc4` (log), `f69e8f4` (.dockerignore),
`a1d61be` (backlog), `2cd4637` (migracion a Cloud Run).

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

**Bug fix: la cancion pausada ya no desaparece del widget.**

Angel: "no me gusta que le pongo pausa a la cancion y ya sale que no estoy
escuchando nada en la app, minimo que se quede esa que esta en pausa".

Ojo con el changelog: la entrada del 2026-05-12 dice que esto ya se habia
arreglado ("ahora retorna el track aunque este pausado"). El backend si lo hacia
bien; el bug seguia por dos razones encadenadas que no estaban documentadas.

1. `sp.current_user_playing_track()` pega a `/me/player/currently-playing`, y
   Spotify responde **204 vacio** cuando el dispositivo se vuelve inactivo — que
   es justo lo que pasa un rato despues de darle pausa. El backend devolvia
   `track: null` correctamente: Spotify ya no le contaba nada.
2. `fetchNowPlaying` en `NavBar.jsx` hacia `setNowPlaying(null)` con eso, y el
   widget se renderiza detras de `{nowPlaying && ...}`, asi que desaparecia.

Arreglado en las dos capas, porque cualquiera sola se queda corta:
- `backend/routes/tracks.py` — `get_now_playing` ahora intenta primero
  `sp.current_playback()` (`/me/player`), que sigue reportando el track pausado
  bastante mas tiempo, y cae a `current_user_playing_track()` si viene vacio o
  revienta. El scope `user-read-playback-state` ya estaba desde la sesion del
  play-in-context, asi que no hace falta re-login.
- `frontend/src/components/NavBar.jsx` — `fetchNowPlaying` ya no borra el ultimo
  track conocido cuando la API no reporta nada: solo lo marca como pausado. Un
  error de red cae al mismo camino a proposito, porque un 500 pasajero tampoco
  tiene por que vaciar la barra. Comportamiento elegido por Angel: se queda
  "hasta que le de play o escoja otra".

**Efecto secundario que hubo que atender.** `player_play` llamaba a
`sp.start_playback()` sin device. Antes daba igual, porque el widget desaparecia
y no habia boton que apretar; con el fix el ▶ queda visible justo en el estado de
dispositivo idle, que es donde Spotify contesta `NO_ACTIVE_DEVICE`. Se le cableo
el `_resolve_device_id()` que ya existia y solo usaba `play-in-context`: si el
primer intento falla, resuelve el dispositivo (prefiere el activo, si no el
primero) y reintenta; si no hay ninguno, 400 con mensaje legible en espanol.

Verificado con 9 casos y el cliente de Spotify stubeado (sin red ni MySQL):
pausado devuelve el track, sonando devuelve `is_playing=True`, el fallback a
currently-playing entra tanto si `/me/player` viene vacio como si lanza
excepcion, sin nada devuelve `track: None`; y en play, el camino feliz usa una
sola llamada sin device, el idle reintenta con el device **activo** (no el
primero de la lista), sin activo toma el primero, y sin dispositivos levanta 400.
`npm run build` OK.

**Nota:** los cuatro handlers del player en el frontend tragan el error con
`catch {}`, asi que si el play falla no hay feedback visual. Es de antes y no se
toco, pero ahora es mas alcanzable.

**Sobre el orden por rating (seccion 6 del backlog): no se toco codigo.** Angel
dijo "espera, hay que plantearlo bien" cuando se le pregunto a que playlist
aplicarlo, asi que quedo abierto a proposito. Lo que si quedo decidido es la
ventana de "novedad", y es mejor que las tres opciones que se le ofrecieron: no
es global ni el cuatrimestre, es **por playlist y proporcional a lo que la
playlist dura** — 2 meses en las de cuatrimestre (que duran 4) y 4 meses en la
Galeria Anual (que dura 12). Su razon: "por el simple hecho de que las playlists
duran". Eso implica que `_order_playlist` tiene que recibir los meses de ventana
como parametro y no una constante global, y de paso mata el filo del 1 de enero
que preocupaba antes, porque al ser ventana rodante nunca se vacia de golpe.
Anotado en `Mejoras.txt` con lo que falta antes de volver a preguntar: cuantas
canciones tiene A+ hoy y cuantas Galeria Anual.

**Feature: bloque de novedades arriba (paso 1 de la seccion 6 del backlog).**

Angel abrio la sesion pidiendo "quisiera ver esa posibilidad" y, cuando se le
pregunto a que playlist aplicarlo, contesto "espera, hay que plantearlo bien".
Asi que primero se saco el dato que faltaba, y ahi cambio el diagnostico.

**Los numeros de la DB** (`GET /tracks/stats`, que solo toca MySQL y por eso se
pudo consultar sin token de Spotify). Los 5 periodos suman exacto al global en
los 7 ratings, y `count` resulta ser el total sin D:

```
periodo       no-D     A+   %A+    A   A+ por cada A
perla 2025     170     56   33%   28       2.0
miel  2025     362    105   29%   65       1.6
latte 2025     268     98   37%   41       2.4
perla 2026     280    167   60%   24       7.0
miel  2026     130     58   45%   12       4.8
GLOBAL        1210    484   40%  170       2.8
```

Galeria Anual 2026 = TOP_SET del ano = 225 A+ + 36 A + 34 B+ = 295 canciones.
La primera A estaba en la **posicion 226**. El scroll que reportaba, confirmado.

**Lo que los numeros desmienten.** La hipotesis era "las A+ muy viejitas pesan
mas que una A nueva". Falso por dos lados: no hay nada anterior a 2025 (las
"viejitas" tienen ano y medio como maximo) y **225 de las 484 A+ son de este
ano**. Las A+ que tapan una A nueva son, en su mayoria, igual de recientes que
la A — asi que ninguna formula de recencia las mueve. Y A+ no se saturo con los
anos: se saturo de golpe en 2026, donde el ratio A+ por A salta de 1.6-2.4 a
5-7. En perla 2026, 6 de cada 10 canciones calificadas fueron A+.

Eso quedo en `Mejoras.txt` como seccion **6b**, con una hipotesis que hay que
verificar antes de degradar nada: el salto de perla 2026 coincide con el periodo
del flujo "A+ Instantaneo", que aplica A+ en bloque a los Me Gusta. Si esas 167
salieron de un bulk y no de escuchar una por una, el arreglo es limpiar un bulk
mal aplicado y no pedirle a Angel que degrade canciones que si juzgo.

**Las reglas que eligio, que son mejores que las opciones que se le ofrecieron.**
La ventana de "novedad" no es global ni es el cuatrimestre: es **por playlist y
proporcional a lo que la playlist dura** — 45 dias (mes y medio) en la del
cuatrimestre, que dura 4 meses, y 90 dias (tres meses) en la Galeria Anual, que
dura 12. Su razon: "por el simple hecho de que las playlists duran". De paso mata
el filo del 1 de enero, porque al ser ventana rodante nunca se vacia de golpe.
Reviso a la baja sus propios numeros iniciales (venia de 2 y 4 meses).

Y una regla que agrego el: **solo TOP_SET puede subir**. "No quisiera que las c+
y c se queden arriba de esas". B tambien queda fuera por la misma logica; se le
aviso que lo estaba asumiendo, porque el solo nombro C+ y C.

**Implementacion.** `config.NOVEDAD_DIAS_CUATRI` / `NOVEDAD_DIAS_ANUAL`, mas
`_novedad_dias(playlist_id)` y `aplicar_novedad(df, playlist_id)` en
`routes/tracks.py`. El sort pasa de dos llaves a tres:

```python
["es_novedad", "rating_order", "added_at_dt"], ascending=[False, False, False]
```

Dos decisiones de diseno que evitaron bugs:

La ventana **se deriva del `playlist_id`** y no se pasa en cada llamada. Asi los
6 puntos que llaman a `_order_playlist` la heredan sin tocarlos — incluido
`POST /playlists/order/{id}`, que es el de los botones "Ordenar" de
Herramientas. Si se hubiera pasado a mano, apretar ese boton habria deshecho el
orden. Y las playlists de cuatrimestres pasados caen a `None` solas, que es
exactamente la regla de que las historicas son intocables.

`rebuild_anual` en `playlists.py` tenia su **propio sort duplicado** y no usaba
`_order_playlist`, asi que "Reconstruir Galeria" tambien habria deshecho el
orden — de forma intermitente, que es la peor manera de que un bug vuelva. Se
extrajo el criterio a `aplicar_novedad` y ahora los dos lo comparten.

Detalle que habria roto en produccion: `added_at` es `DATETIME` de MySQL (sin
zona) y los dos llamadores lo parsean **sin** `utc=True`, o sea tz-naive.
`utils.now_utc()` es tz-aware, y comparar naive contra aware lanza `TypeError`
en pandas. El corte se construye con `.replace(tzinfo=None)`.

**Verificacion: 17 casos, todo stubeado (sin red ni MySQL).** `_novedad_dias`
devuelve 90 para anual, 45 para miel (el cuatri actual, porque hoy es agosto),
`None` para perla (historica) y `None` para una playlist desconocida. En Galeria
Anual la A nueva queda **arriba** de la A+ vieja; en perla sigue **debajo**, o
sea el comportamiento de siempre quedo intacto. En el cuatri actual, ni la C+ ni
la B recien calificadas se trepan arriba de la A+ vieja. Una cancion de 60 dias
es novedad en anual (90d) pero no en cuatri (45d), asi que la diferencia de
ventana se nota de verdad. Una fecha ilegible no revienta y no sube (NaT >= corte
da False). Y `rebuild_anual` produce el mismo orden que `_order_playlist`.

**Efecto:** la primera A en Galeria Anual pasa de la posicion 226 a ~47. El techo
del paso 1 es ese ~47, porque dentro de la propia ventana siguen habiendo ~46 A+
sobre 12 A; bajarlo mas es trabajo de 6b, no de calibrar la ventana.

**Nota operativa:** el orden nuevo no se aplica solo. Entra cuando algo dispara
un reorder — calificar una cancion, o los botones de Herramientas. Angel puede
forzarlo con "Ordenar" / "Reconstruir Galeria".

**Cierre de sesion — la causa real del A+ inflado, dicha por Angel.**

Al final de la sesion Angel explico el origen de la densidad de A+, y descarta
la hipotesis del "A+ Instantaneo" que se habia planteado con los agregados:

  "me malacostumbre a ponerlas en a+ solo porque las queria mero arriba"

No fue un bulk ni un cambio de criterio: era un **workaround del propio bug del
orden**. A+ era la unica palanca que existia para subir una cancion, asi que la
uso como boton de "ponme esto arriba". Eso explica que el salto sea de 2026 y
no gradual, y que el ratio A+/A se vaya a 7 justo ahi.

Dos consecuencias, las dos buenas, y las dos anotadas en `Mejoras.txt` §6b:

1. **La densidad deberia dejar de crecer sola.** Con el bloque de novedades el
   incentivo desaparecio. Antes de planear cualquier cupo hay que **medir el
   ratio A+/A al cierre del proximo cuatrimestre**. Si baja a los ~2 de 2025,
   6b se cierra casi solo. El escenario "solo hacia adelante" pasa de ultimo
   recurso a primera opcion.
2. **Lo historico deja de ser doloroso.** No es "degrada canciones que juzgaste
   A+", es "deshaz un workaround que tu mismo llamas mala costumbre". Quedo
   escrito que 6b **no** se vuelva a plantear como cupo duro ni como
   revalidacion dolorosa.

Se corrigio tambien la memoria `project-aplus-saturacion`, que ya iba por la
hipotesis equivocada.

**Por que Angel no vio cambio en las playlists.** Dos razones, y la primera
bloquea todo:

1. Su sesion de Spotify estaba muerta — `/tracks/now-playing` devolvia 500. Los
   redeploys de hoy (cuatro) borraron el `.spotify_cache` cada vez. Sin token no
   se puede escribir en Spotify.
2. El orden nuevo **no se aplica solo**: entra cuando algo dispara un reorder.
   Las 295 canciones que ya estaban en Galeria Anual siguen con el orden que
   Spotify tiene guardado.

Se le indico: re-login, y luego en Herramientas apretar **"Ordenar Galeria
Anual"** (`orderPlaylist(dist.anual, 4)`) y **"Ordenar Miel"**. Se aclaro que
"Ordenar" basta y que "Reconstruir" no hace falta para esto. Aviso dado: si esta
escuchando esa playlist mientras se reordena, Spotify salta de posicion.

**PENDIENTE PARA LA PROXIMA SESION** (en orden de valor):

- [ ] **El token de Spotify a MySQL.** Es la deuda que mas molesto hoy: tumbo la
      sesion de Angel cuatro veces, una por redeploy, y fue lo que impidio ver
      el orden nuevo funcionando al final. `backend/spotify.py:29` usa
      `cache_path=".spotify_cache"` y el filesystem de Render es efimero. El
      patron ya existe dos veces en el proyecto (`aplus_cutoff` y el estado del
      Modo Virtual viven en la tabla `config`), asi que es un `CacheHandler` de
      spotipy leyendo y escribiendo ahi. Nada mas.
- [ ] Confirmar que el orden nuevo se ve bien en Spotify una vez que Angel
      apriete "Ordenar". Lo unico que no se pudo verificar en vivo esta sesion.
- [ ] Endpoint de solo lectura que liste tracks desde la DB sin token de
      Spotify. Hoy `/tracks/stats` solo da agregados, y por eso no se pudo saber
      **cuales** A+ son candidatas a revisar.
- [ ] Medir el ratio A+/A al cierre del cuatrimestre, antes de tocar 6b.

**Nota de proceso:** a mitad de sesion `Mejoras.txt` aparecio modificado en el
working tree despues de un commit, con la seccion 6 reescrita. No fue OneDrive
pisando el archivo — las ediciones de esta sesion quedaron intactas, o sea quien
escribio tenia esta version en mano. Editor concurrente (otra sesion o Angel).
No se perdio nada y se preservo tal cual, pero conviene tenerlo presente: el
repo vive en OneDrive y Angel trabaja en dos maquinas.

Commits: `782220f` (ping), `65fe434` (log), `d3b7a93` (fallback SPA),
`58fb493` (pausa), `efd71e1` (orden), `9b37c66` (causa real del A+).

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
