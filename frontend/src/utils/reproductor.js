/**
 * EL reproductor flotante: una sola ventana para toda la app, con dos
 * pestañas (Sonando y Cola), y UN solo botón que la abre: el del sidebar.
 *
 * Antes había dos PiP distintos y luego dos botones para la misma ventana.
 * Angel: "me causa conflicto que sean dos diferentes", y después "solo deja un
 * botón de pip, en el chrome y en la app". El botón es un interruptor: si la
 * ventana está abierta la cierra; si no, la abre en la pestaña que toca a la
 * pantalla actual (Cola en Pendientes, Sonando en las demás).
 *
 * La ventana no dibuja nada propio: carga /player (PlayerPage.jsx). Qué ventana
 * es depende de dónde corre la app:
 *
 *  - **Chrome**: un Picture-in-Picture de documento con un iframe a /player.
 *  - **La app de escritorio (Tauri)**: esa API NO existe en WebView2, y el
 *    botón no hacía nada (2026-09-23). Ahí se abre la ventana flotante nativa,
 *    la misma de Ctrl+Alt+P. Ver `alternarEnEscritorio`.
 */
import { pipThemeCss } from './theme';

const TAMANO_KEY = 'rateapp_np_pip_size';
const TAMANO_DEFAULT = [360, 330];
const MIN_W = 220;
const MIN_H = 130;

let ventana = null;       // la ventana de PiP de Chrome, si está abierta
let timerTamano = null;
const oyentes = new Set();

function avisar() {
  oyentes.forEach((fn) => fn(!!ventana));
}

/**
 * Suscribirse a si el PiP está abierto (para pintar el botón). Devuelve la
 * baja. En el escritorio siempre dice false: la ventana nativa la maneja Rust
 * y la página no tiene forma de preguntarle sin abrirle permisos de Tauri.
 */
export function suscribirReproductor(fn) {
  oyentes.add(fn);
  fn(!!ventana);
  return () => oyentes.delete(fn);
}

/**
 * ¿Corre dentro de la app de escritorio? La marca la inyecta Rust con un
 * script de inicialización (desktop/src-tauri/src/lib.rs) en cada carga.
 */
export const enEscritorio = () => typeof window !== 'undefined' && window.__RATEAPP_ESCRITORIO__ === true;

export const soportaPiP = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

/** La pestaña que toca a la pantalla actual. */
export const modoParaRuta = (pathname) => (pathname === '/' ? 'cola' : 'sonando');

function cargarTamano() {
  try {
    const s = JSON.parse(localStorage.getItem(TAMANO_KEY) || 'null');
    // Formato viejo del PiP de NavBar: {vertical: [w, h], horizontal: [w, h]}.
    const v = Array.isArray(s) ? s : s?.vertical;
    if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)
        && v[0] >= MIN_W && v[1] >= MIN_H) {
      return v;
    }
  } catch {}
  return TAMANO_DEFAULT;
}

function guardarTamano(pip) {
  const w = pip.outerWidth || pip.innerWidth;
  const h = pip.outerHeight || pip.innerHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < MIN_W || h < MIN_H) return;
  try { localStorage.setItem(TAMANO_KEY, JSON.stringify([Math.round(w), Math.round(h)])); } catch {}
}

function alCerrar(pip) {
  if (ventana !== pip) return;
  clearTimeout(timerTamano);
  guardarTamano(pip);
  ventana = null;
  avisar();
}

/**
 * En el escritorio la página no le habla a Rust por IPC — es REMOTA (Cloud
 * Run) y darle comandos de Tauri exigiría abrirle permisos a ese origen, la
 * misma razón por la que los atajos van por HTTP. En su lugar intenta navegar
 * a una ruta centinela; Rust intercepta la navegación, la CANCELA (la app no
 * se mueve de pantalla) y abre u oculta la ventana flotante.
 *
 * La ruta no existe en ningún otro lado a propósito: si esto corriera fuera de
 * la app, el fallback del SPA la mandaría a una pantalla vacía. Por eso solo se
 * usa con la marca de `enEscritorio()`.
 */
function alternarEnEscritorio(modo) {
  window.location.href = `/__escritorio/reproductor?modo=${modo}`;
}

/**
 * Abre el reproductor en `modo`, o lo cierra si ya está abierto.
 *
 * Devuelve false si no hay ninguna ventana posible (un navegador sin PiP).
 * Un fallo al abrir el PiP se LANZA: hasta el 2026-09-23 se lo tragaba un
 * `catch` que lo trataba como cancelación, y el botón fallaba callado.
 */
export async function alternarReproductor(modo) {
  if (enEscritorio()) {
    alternarEnEscritorio(modo);
    return true;
  }
  if (!soportaPiP()) return false;

  if (ventana && !ventana.closed) {
    const pip = ventana;
    alCerrar(pip);
    pip.close();
    return true;
  }

  const [w, h] = cargarTamano();
  const pip = await window.documentPictureInPicture.requestWindow({
    width: w,
    height: h,
    disallowReturnToOpener: false,
  });

  // Solo el marco: el fondo del tema, para no destellar blanco mientras
  // carga, y el iframe a pantalla completa. Todo lo demás es /player.
  const estilo = pip.document.createElement('style');
  estilo.textContent = pipThemeCss()
    + 'html,body{margin:0;height:100%;background:var(--bg-deep);overflow:hidden}'
    + 'iframe{display:block;border:0;width:100%;height:100%}';
  pip.document.head.appendChild(estilo);

  const marco = pip.document.createElement('iframe');
  // URL ABSOLUTA a propósito: el documento del PiP nace como about:blank, y
  // una ruta relativa dependería de que herede la base de la ventana madre.
  marco.src = `${window.location.origin}/player?modo=${modo}`;
  marco.title = 'Reproductor';
  // El teclado (1-7, S, espacio) tiene que llegar al iframe desde el inicio.
  marco.addEventListener('load', () => marco.focus());
  pip.document.body.appendChild(marco);

  ventana = pip;
  avisar();

  pip.addEventListener('resize', () => {
    clearTimeout(timerTamano);
    timerTamano = setTimeout(() => guardarTamano(pip), 400);
  });
  pip.addEventListener('pagehide', () => alCerrar(pip));
  return true;
}

// ── El canal entre ventanas ─────────────────────────────────────────
//
// El PiP, la ventana flotante del escritorio y la app son documentos aparte.
// Cuando uno califica, los otros tienen que enterarse sin esperar a su
// siguiente poll: si no, Pendientes seguiría mostrando como pendiente una
// canción que acabas de calificar en la ventanita.

const CANAL = 'rateapp';

/** Avisar a las demás ventanas que una canción se calificó. */
export function anunciarCalificada(track_id, rating) {
  try {
    const c = new BroadcastChannel(CANAL);
    c.postMessage({ tipo: 'calificada', track_id, rating });
    c.close();
  } catch {}
}

/** Escuchar calificaciones hechas en otras ventanas. Devuelve la baja. */
export function escucharCalificadas(fn) {
  let c;
  try { c = new BroadcastChannel(CANAL); } catch { return () => {}; }
  c.onmessage = (e) => {
    if (e.data?.tipo === 'calificada') fn(e.data.track_id, e.data.rating);
  };
  return () => c.close();
}
