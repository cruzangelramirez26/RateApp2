/**
 * Tema claro / oscuro.
 *
 * El modo que elige el usuario ('light' | 'dark' | 'system') vive en
 * localStorage; lo que se aplica al DOM es siempre el tema *resuelto*
 * (light u dark) en `document.documentElement[data-theme]`. Por eso
 * global.css solo necesita un bloque [data-theme="dark"] y no duplica
 * nada dentro de un @media (prefers-color-scheme).
 *
 * El primer valor lo escribe un script inline en index.html, antes del
 * primer paint, para que no haya destello blanco al cargar en oscuro.
 */

export const THEME_KEY = 'rateapp_theme';
export const MODES = ['light', 'dark', 'system'];

// Color de la barra del navegador / status bar en móvil, por tema.
const THEME_COLOR = { light: '#f5f4f0', dark: '#121110' };

export function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function loadMode() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return MODES.includes(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function saveMode(mode) {
  try { localStorage.setItem(THEME_KEY, mode); } catch {}
}

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme] || THEME_COLOR.light);
}

// ── Tokens para las ventanas de Picture-in-Picture ──────────────────
// Un documento de PiP es un documento aparte: no hereda las custom
// properties del documento principal. Se leen los valores ya resueltos
// y se inyectan como un bloque :root propio, así el HTML del PiP puede
// usar var(--…) igual que el resto de la app y sigue el tema vigente.

const PIP_TOKENS = [
  '--bg-deep', '--bg-surface', '--bg-card', '--bg-card-hover', '--bg-elevated',
  '--border-subtle', '--border-medium', '--border-accent',
  '--text-primary', '--text-secondary', '--text-muted',
  '--accent', '--accent-dim', '--accent-glow', '--on-accent',
  '--font-body', '--font-mono',
  '--radius-sm', '--radius-md', '--radius-lg',
  '--shadow-sm', '--shadow-md', '--shadow-lg',
  ...['a-plus', 'a', 'b-plus', 'b', 'c-plus', 'c', 'd'].flatMap(r => [
    `--rating-${r}`, `--rating-${r}-dim`, `--rating-${r}-soft`,
  ]),
];

/** Bloque CSS con los tokens del tema actual, para inyectar en un PiP. */
export function pipThemeCss() {
  const cs = getComputedStyle(document.documentElement);
  const decls = PIP_TOKENS
    .map(t => `${t}:${cs.getPropertyValue(t).trim()}`)
    .filter(d => !d.endsWith(':'))
    .join(';');
  return `:root{${decls}}
html,body{margin:0;padding:0;height:100%;background:var(--bg-deep);color:var(--text-primary);}
*{box-sizing:border-box;}`;
}

// ── Ratings ─────────────────────────────────────────────────────────
// Los 7 colores ya son tokens en global.css. Estos helpers devuelven la
// referencia var(...) en vez de un hex, para que los estilos inline de
// React cambien con el tema sin JS extra.

const SLUG = {
  'A+': 'a-plus', 'A': 'a', 'B+': 'b-plus', 'B': 'b',
  'C+': 'c-plus', 'C': 'c', 'D': 'd',
};

/** Color sólido del rating, o `undefined` si no es un rating válido. */
export const ratingColor = (r) => (SLUG[r] ? `var(--rating-${SLUG[r]})` : undefined);
/** Fondo tenue del rating (para chips y bloques). */
export const ratingDim = (r) => (SLUG[r] ? `var(--rating-${SLUG[r]}-dim)` : undefined);
/** Borde suave del rating. */
export const ratingSoft = (r) => (SLUG[r] ? `var(--rating-${SLUG[r]}-soft)` : undefined);
