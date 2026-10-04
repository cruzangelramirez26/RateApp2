/**
 * La marca de Rated (la 03 del lienzo): la R+ crema sobre su cuadro oscuro.
 * Misma geometria que `recursos/logo/generar_iconos.py`, en una reticula de
 * 100; abajo de 24 px el trazo engorda (11 / 8, la proporcion del original)
 * para que no se pierda, y el asta arranca a ras de la barra de arriba.
 *
 * `pointer-events: none` a proposito: en las barras de Tauri el arrastre lo
 * decide el elemento que recibe el clic, y tiene que ser el que lleva
 * `data-tauri-drag-region`, no el svg.
 */
export default function LogoRated({ size = 20, className, style }) {
  const chico = size <= 24;
  const w = chico ? 11 : 9;
  const wp = chico ? 8 : 6.5;
  const clip = `logo-rated-${size}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none', ...style }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}><rect x="0" y="0" width="100" height="74" /></clipPath>
      </defs>
      <rect width="100" height="100" rx="23" fill="#141210" />
      <rect x=".5" y=".5" width="99" height="99" rx="22.5" fill="none" stroke="#f3efe7" strokeOpacity=".12" />
      <g transform="translate(-3 0)">
        <g fill="none" stroke="#f3efe7" strokeWidth={w} clipPath={`url(#${clip})`}>
          <path d={`M30 ${30.5 - w / 2}V74`} />
          <path d="M30 30.5H46A11.5 11.5 0 0 1 46 53.5H30" />
          <path d="M44 53.5L57 76" />
        </g>
        <path d="M73 24V38M66 31H80" fill="none" stroke="#f3efe7" strokeWidth={wp} />
      </g>
    </svg>
  );
}
