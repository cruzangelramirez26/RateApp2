/**
 * Los iconos del lienzo móvil, tal cual. Trazos de 1.8 sobre 24x24 para que
 * todo el marco tenga el mismo peso.
 */
const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IcoCalificar = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><rect x="5" y="8" width="14" height="13" rx="3" /><path d="M8 4.5h8M6.5 6.2h11" /></svg>
);
export const IcoRecientes = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IcoEscuchas = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><path d="M5 20v-8M10 20V5M15 20v-10M20 20v-5" /></svg>
);
export const IcoMas = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>
);
export const IcoBiblioteca = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="1.8" /><rect x="13.5" y="4" width="7" height="7" rx="1.8" /><rect x="3.5" y="14" width="7" height="7" rx="1.8" /><rect x="13.5" y="14" width="7" height="7" rx="1.8" /></svg>
);
export const IcoResumen = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12Z" /><path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15Z" /></svg>
);
export const IcoHerramientas = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" /></svg>
);
export const IcoRecargar = () => (
  <svg viewBox="0 0 24 24" {...trazo} aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></svg>
);
export const IcoPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
);
export const IcoPausa = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>
);
export const IcoAnterior = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 6.3v11.4a.8.8 0 0 1-1.25.66L9 13a1.2 1.2 0 0 1 0-2l7.75-5.36A.8.8 0 0 1 18 6.3Z" /><rect x="5.5" y="5.5" width="2.2" height="13" rx="1" /></svg>
);
export const IcoSiguiente = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6.3v11.4a.8.8 0 0 0 1.25.66L15 13a1.2 1.2 0 0 0 0-2L7.25 5.64A.8.8 0 0 0 6 6.3Z" /><rect x="16.3" y="5.5" width="2.2" height="13" rx="1" /></svg>
);
export const IcoCorazon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" /></svg>
);
