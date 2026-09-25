# Rediseño móvil — plan

Aprobado por Angel el 2026-09-25. Lienzo (artifact privado, versión 4):
https://claude.ai/artifact/QqD3Qi5ZZPi4gW2NnMqJGS

El lienzo manda: medidas, colores y comportamiento salen de ahí. Este
documento dice **cómo** se construye y en qué orden, y guarda las decisiones
que no están en el lienzo.

---

## 1. Decisiones de Angel

| Tema | Decisión |
|---|---|
| Fondo | La portada de lo que está enfrente (o sonando), difuminada. No un rojo fijo. |
| Tipografía | Como la web: DM Sans; Geist Mono para números; Instrument Serif solo en el "01" de Escuchas. |
| Tema | **Solo oscuro**, igual que el escritorio. |
| Deslizar | Solo te mueve entre canciones. **Nunca califica.** |
| Notas | **Una fila de 7** (opción A), en Calificar y en la hoja de las listas. **Sin relleno**: A+/A/B+ con borde claro fino, B/C+/C contorno casi invisible, D punteada. Solo se rellena la nota que ya tiene la canción. |
| Barra de abajo | Calificar, Recientes, Escuchas y **Más** (hoja con Biblioteca, Resumen, Herramientas). |
| Notificaciones | Muy poco texto: una línea y un botón. Nada de "A+ → …". |
| Cola pendiente | Notificación **cada 3 días a las 10:00 a. m.**, solo si hay pendientes. |
| Sin nota | Aviso con **5 escuchas en un mes** sin calificar, **una vez por canción**. |
| Notificación de calificar | Sale al cambiar de canción, reemplaza a la anterior, se puede deslizar. Basta con que funcione en su S24 (Android 16). |
| Widgets | 4x2 lo que suena, 2x2 tu cola, 4x1 solo notas. El "vidrio" se simula con la portada difuminada como imagen de fondo (Android no difumina detrás de un widget). |

### Qué diseño toca: por dispositivo, no por ancho

Angel: *"no me gusta que no sepa si está en la app escritorio o en un móvil"*.
Hoy `useEscritorio()` decide por ancho (>= 1024 px). Pasa a decidir por
**tipo de dispositivo**:

- **Escritorio**: la app de Tauri, o un navegador con mouse
  (`(hover: hover) and (pointer: fine)`). Siempre el diseño de escritorio,
  aunque la ventana sea angosta.
- **Móvil**: la app de Android (Capacitor), un teléfono o una tablet
  (puntero táctil). Siempre el diseño móvil; en pantallas anchas va
  **centrado** (columna de ~480 px) sobre el fondo difuminado.

Consecuencia: el diseño de escritorio se verificó de 1024 px para arriba.
Con una ventana de escritorio más angosta ya no cae a la app vieja, así que
hay que revisar que no se rompa (y quizá poner un ancho mínimo a la ventana de
Tauri, que pide reinstalar). Se revisa en la fase 1.

---

## 2. Arquitectura

Mismo patrón que el escritorio (ver `CLAUDE_LOG.md`, fases 1-6):

- `frontend/src/components/movil/` — las vistas nuevas.
- `frontend/src/styles/movil.css` — tokens y estilos, colgados de
  `html.movil` para no chocar con `global.css` ni con `escritorio.css`.
- La lógica **no se duplica**: sale de los hooks que ya existen
  (`useCalificar`, `useRecientes`, `useEscuchas`, `useBiblioteca`,
  `useHerramientas`). Resumen no tiene hook (solo llama `/tracks/stats`).
- `App.jsx` elige marco y pantalla por el tipo de dispositivo.
- Las páginas viejas (`PendingPage`, `RecentPage`, ...) se borraron el
  2026-09-26, cuando la fase 4 terminó. Solo quedan `BackfillPage` y
  `CleanupPage`, que se rediseñan aparte.

Reglas que no cambian (y hay que verificar en cada fase):

- **Calificar y Recientes** califican con el flujo completo.
- **Escuchas y Me Gusta** catalogan en soft con la primera escucha real
  (`suggested_added_at`), nunca con la fecha de la ventana.
- Mandar siempre nombre, artista y álbum al calificar (bug del 2026-09-22).
- Teclas / orden de botones: A+ ... D (`utils/ratings.js`).

Las fases 1-4 son web: llegan a la app de Android con cada push, **sin
reinstalar el APK**. Las fases 5 y 6 son Java y sí piden reinstalar
(`npm run build` en `mobile/`, luego `adb install -r --user 0`).

---

## 3. Fases

### Fase 1 — Marco
- Detección por dispositivo (sección 1) en `useEscritorio` / un
  `useDispositivo` nuevo.
- `Movil.jsx`: fondo con portada difuminada que se funde al cambiar, barra
  flotante de 4 botones con el número de pendientes, hoja de "Más" que sube
  desde abajo, toasts arriba al centro.
- Lo que suena se comparte por contexto (como `sonando.js` del escritorio),
  para no abrir otro sondeo de `now-playing`.
- Mientras llega cada pantalla, las viejas se ven dentro del marco oscuro.

### Fase 2 — Calificar
- Pila de portadas (310 px, 2 cartas asomándose atrás), deslizar con el dedo
  y flechas de navegación; velo con la nota al calificar y avance solo.
- Píldora de "sonando" cuando lo que suena es otra cosa, con "Calificarla".
- Controles (barra con seek, anterior, play/pausa, siguiente pendiente, ♥)
  **solo si la de enfrente es la que suena**; si no, "Escuchar" + "Saltar".
- Notas en una fila, sin relleno.
- Verificar: flujo completo, nombre/artista/álbum en el POST, sin desborde a
  360x780, 390x844 y 412x915, y centrado en una tablet.

### Fase 3 — Recientes y Escuchas (hecha 2026-09-25)
- Recientes: pestañas Escuchadas / Calificadas, agrupadas por día con hora.
- Escuchas: chips de periodo, la #1 grande con el "01" en serifa, top 10,
  totales históricos.
- Hoja de notas desde abajo (portada + 7 notas + una línea de qué hace).

### Fase 4 — Biblioteca, Resumen y Herramientas (hecha 2026-09-26)
- Biblioteca: fila de listas, chips de nota, cuadrícula de 3.
- Resumen: tarjetas de cuatrimestre deslizables; tocar una cambia los números.
- Herramientas: tarjetas que crecen hasta ocupar la pantalla. Backfill y
  Limpieza siguen abriendo sus pantallas de siempre (se rediseñan después,
  junto con las del escritorio).

### Fase 5 — Notificaciones (Java)
- **Calificar lo que suena** (`CalificarService`): se rehace con el diseño
  nuevo (una línea + 7 notas; al calificar "Calificada B+ · canción" con
  Deshacer y se va sola). Canal silencioso de prioridad baja para quedar
  debajo del reproductor de Spotify. Deslizable en Android 14+ aunque el
  servicio siga vivo; vuelve con la siguiente canción.
- **Tu cola**: cada 3 días a las 10:00, solo si hay pendientes.
  Programada en el celular (WorkManager / AlarmManager).
- **Sin nota**: 5 escuchas en 30 días sin calificar. Hace falta un endpoint
  nuevo (sale de `listening_events`, por `match_key`) y guardar en MySQL las
  ya avisadas, para que salga una sola vez por canción.
- **Cierre de cuatrimestre**: el 1 de may, sep y ene, con el resumen del que
  acabó.
- Cada una en su propio canal, para apagarlas por separado.
- **Nunca picar una nota en pruebas**: escribe una calificación real.

### Fase 6 — Widgets (Java)
- 4x2 lo que suena (portada, canción, 7 notas), 2x2 tu cola (número +
  portadas), 4x1 solo notas.
- RemoteViews: fondo = portada difuminada generada como bitmap.
- Califican con el flujo completo (como la notificación): **no sirven para la
  cola de `/backfill`**.

---

## 4. Pendientes que salen del plan

- [ ] Revisar el escritorio en ventanas < 1024 px (fase 1).
- [ ] Backfill y Limpieza al estilo nuevo (móvil y escritorio).
- [ ] Icono propio de la app (sigue el genérico).
- [x] Borrar las páginas viejas (2026-09-26).
