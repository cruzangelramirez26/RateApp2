/**
 * EL reproductor flotante: una sola ventana de Picture-in-Picture para toda la
 * app, con dos pestañas (Sonando y Cola).
 *
 * Antes había dos PiP distintos —el de Now Playing en el sidebar y el de la
 * cola en Pendientes—, cada uno con su HTML en cadenas. Angel: "me causa
 * conflicto que sean dos diferentes". Ahora el sidebar y Pendientes piden la
 * MISMA ventana a este módulo; si ya está abierta, solo le cambian la pestaña.
 *
 * La ventana no dibuja nada propio: es un iframe a /player (PlayerPage.jsx),
 * la misma ruta que usa la ventana flotante del escritorio.
 */
import { pipThemeCss } from './theme';

const TAMANO_KEY = 'rateapp_np_pip_size';
const TAMANO_DEFAULT = [360, 330];
const MIN_W = 220;
const MIN_H = 130;

let ventana = null;       // la ventana de PiP, si está abierta
let modoActual = null;    // 'sonando' | 'cola'
let timerTamano = null;
const oyentes = new Set();

function avisar() {
  const estado = { abierto: !!ventana, modo: modoActual };
  oyentes.forEach((fn) => fn(estado));
}

/** Suscribirse a abierto/modo (para pintar los botones activos). Devuelve la baja. */
export function suscribirReproductor(fn) {
  oyentes.add(fn);
  fn({ abierto: !!ventana, modo: modoActual });
  return () => oyentes.delete(fn);
}

export const soportaPiP = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

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
  modoActual = null;
  avisar();
}

/** Cambiar la pestaña de la ventana ya abierta, sin recargarla. */
function cambiarModo(modo) {
  modoActual = modo;
  const marco = ventana?.document.querySelector('iframe');
  marco?.contentWindow?.postMessage({ tipo: 'rateapp:modo', modo }, window.location.origin);
  avisar();
}

/**
 * Abre el reproductor en `modo`. Si ya está abierto en otro modo, cambia de
 * pestaña; si ya está en ese modo, lo cierra (el botón funciona como toggle).
 * Devuelve false si el navegador no soporta PiP.
 */
export async function alternarReproductor(modo) {
  if (!soportaPiP()) return false;

  if (ventana && !ventana.closed) {
    if (modoActual === modo) {
      const pip = ventana;
      alCerrar(pip);
      pip.close();
    } else {
      cambiarModo(modo);
    }
    return true;
  }

  try {
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
    modoActual = modo;
    avisar();

    pip.addEventListener('resize', () => {
      clearTimeout(timerTamano);
      timerTamano = setTimeout(() => guardarTamano(pip), 400);
    });
    pip.addEventListener('pagehide', () => alCerrar(pip));
    // La pestana tambien se cambia DESDE ADENTRO de la ventana.
    pip.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin || ventana !== pip) return;
      if (e.data?.tipo === 'rateapp:modo-actual' && (e.data.modo === 'sonando' || e.data.modo === 'cola')) {
        modoActual = e.data.modo;
        avisar();
      }
    });
    return true;
  } catch {
    return true; // el usuario canceló: no es "no soportado"
  }
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
