# Changelog de sesiones

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
