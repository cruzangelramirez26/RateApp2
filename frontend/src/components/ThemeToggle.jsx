import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const MODE_ICON = { light: Sun, dark: Moon, system: Monitor };
const MODE_LABEL = { light: 'Claro', dark: 'Oscuro', system: 'Sistema' };

/**
 * variant="icon"       botón chico que rota claro → oscuro → sistema (sidebar)
 * variant="segmented"  los tres modos visibles (Herramientas, sirve en móvil)
 */
export default function ThemeToggle({ variant = 'icon' }) {
  const { mode, theme, setMode, cycle } = useTheme();

  if (variant === 'segmented') {
    return (
      <div className="theme-segmented">
        {['light', 'dark', 'system'].map(m => {
          const Icon = MODE_ICON[m];
          const active = mode === m;
          return (
            <button
              key={m}
              className={`theme-segmented-btn${active ? ' active' : ''}`}
              onClick={() => setMode(m)}
              aria-pressed={active}
            >
              <Icon size={14} />
              {MODE_LABEL[m]}
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = MODE_ICON[mode];
  return (
    <button
      className="theme-toggle-btn"
      onClick={cycle}
      title={`Tema: ${MODE_LABEL[mode]}${mode === 'system' ? ` (${theme})` : ''} — clic para cambiar`}
      aria-label={`Cambiar tema, actualmente ${MODE_LABEL[mode]}`}
    >
      <Icon size={14} />
    </button>
  );
}
