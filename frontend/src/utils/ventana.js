/**
 * La barra de título propia de la app de escritorio (Tauri).
 *
 * La ventana nace SIN la barra de Windows (`decorations: false`) y la app pinta
 * la suya, para que el encabezado sea parte de la app — pedido de Angel del
 * 2026-09-23, "como aquí Claude".
 *
 * **LA ÚNICA PUERTA QUE SE LE ABRE A LA PÁGINA REMOTA.** Mover, minimizar,
 * maximizar y cerrar la ventana necesitan hablar con Tauri, y la página viene de
 * Cloud Run. Hasta hoy nunca se le dio ningún permiso (por eso los atajos van
 * por HTTP y el botón del reproductor por una navegación que Rust cancela). Se
 * decidió abrir SOLO esto, y nada más:
 * `desktop/src-tauri/capabilities/ventana-remota.json`. Lo peor que puede hacer
 * la página con eso es mover o esconder su propia ventana.
 *
 * `@tauri-apps/api` se importa de forma perezosa: en el navegador nunca se carga.
 */

/**
 * ¿Hay que pintar la barra? La marca la inyecta Rust (lib.rs), y es DISTINTA de
 * `__RATEAPP_ESCRITORIO__` a propósito: la página se actualiza con cada push,
 * pero el instalador no. Un escritorio viejo —con la barra de Windows y sin los
 * permisos— tiene la marca vieja y no la nueva, así que no se le pinta una
 * segunda barra con botones que no harían nada.
 */
export const tieneBarraPropia = () =>
  typeof window !== 'undefined' && window.__RATEAPP_BARRA__ === true;

let actual = null;
function ventana() {
  actual ||= import('@tauri-apps/api/window').then((m) => m.getCurrentWindow());
  return actual;
}

function llamar(fn) {
  return ventana()
    .then(fn)
    .catch((err) => console.error('[ventana]', err));
}

export const minimizar = () => llamar((w) => w.minimize());
export const alternarMaximizar = () => llamar((w) => w.toggleMaximize());
/** No destruye: dispara el CloseRequested, y Rust oculta la ventana a la bandeja. */
export const cerrar = () => llamar((w) => w.close());
export const estaMaximizada = () => llamar((w) => w.isMaximized());
