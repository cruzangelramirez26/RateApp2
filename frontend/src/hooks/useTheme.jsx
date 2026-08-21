import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadMode, saveMode, resolveTheme, applyTheme } from '../utils/theme';

/**
 * Estado del tema, compartido por toda la app.
 *
 *   mode     'light' | 'dark' | 'system'  — lo que eligió el usuario
 *   theme    'light' | 'dark'             — lo que se está pintando
 *   setMode  fija un modo
 *   cycle    rota light → dark → system → light
 *
 * Se emite un evento `rateapp:themechange` en window cada vez que cambia el
 * tema resuelto, para que quien viva fuera de React (las ventanas de PiP, que
 * se dibujan con innerHTML) pueda repintarse.
 */

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(loadMode);
  const [theme, setTheme] = useState(() => resolveTheme(loadMode()));

  // Aplica al DOM y avisa a los de afuera
  useEffect(() => {
    const resolved = resolveTheme(mode);
    setTheme(resolved);
    applyTheme(resolved);
    window.dispatchEvent(new CustomEvent('rateapp:themechange', { detail: resolved }));
  }, [mode]);

  // En modo "sistema", seguir los cambios del SO en vivo
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved = resolveTheme('system');
      setTheme(resolved);
      applyTheme(resolved);
      window.dispatchEvent(new CustomEvent('rateapp:themechange', { detail: resolved }));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next) => {
    setModeState(next);
    saveMode(next);
  }, []);

  const cycle = useCallback(() => {
    setModeState(prev => {
      const next = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light';
      saveMode(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, theme, setMode, cycle }), [mode, theme, setMode, cycle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback defensivo: que un componente fuera del provider no truene.
    return { mode: 'system', theme: 'light', setMode: () => {}, cycle: () => {} };
  }
  return ctx;
}
