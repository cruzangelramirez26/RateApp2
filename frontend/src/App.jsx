import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { api } from './utils/api';
import { preloadCache } from './utils/preloadCache';
import { setCuatriMap } from './utils/cuatrimestres';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';
import { useEscritorio } from './hooks/useEscritorio';
import Movil from './components/movil/Movil';
import CalificarMovil from './components/movil/Calificar';
import BarraVentana from './components/BarraVentana';
import Shell from './components/escritorio/Shell';
import CalificarEscritorio from './components/escritorio/Calificar';
import EscuchasEscritorio from './components/escritorio/Escuchas';
import BibliotecaEscritorio from './components/escritorio/Biblioteca';
import ResumenEscritorio from './components/escritorio/Resumen';
import HerramientasEscritorio from './components/escritorio/Herramientas';
import RecientesEscritorio from './components/escritorio/Recientes';
import LoginPage from './pages/LoginPage';
import LibraryPage from './pages/LibraryPage';
import RecentPage from './pages/RecentPage';
import StatsPage from './pages/StatsPage';
import ToolsPage from './pages/ToolsPage';
import BackfillPage from './pages/BackfillPage';
import CleanupPage from './pages/CleanupPage';
import WindowPage from './pages/WindowPage';
import PlayerPage from './pages/PlayerPage';

export default function App() {
  const [auth, setAuth] = useState(null);
  const escritorio = useEscritorio();

  useEffect(() => {
    api.authStatus()
      .then(data => {
        const authenticated = data.authenticated ? data : false;
        setAuth(authenticated);
        // /player NO precarga nada. Es la ventana flotante del escritorio y el
        // PiP: solo necesita now-playing, y la precarga son 9 peticiones
        // (incluidos 500 Me Gusta de Spotify) — la misma rafaga que agotaba el
        // pool el 2026-09-21. Sin esto, cada vez que se abre la flotante se
        // pagaba la carga completa de la app para no usar nada de ella.
        if (authenticated && window.location.pathname !== '/player') {
          preloadCache.prime('likedAll', () => api.getLikedAll(500, 0));
          preloadCache.prime('recent', () => api.getRecent(100));
          preloadCache.prime('recentlyPlayed', () => api.getRecentlyPlayed());
          preloadCache.prime('distribution', async () => {
            const dist = await api.getDistribution();
            // Los nombres de los cuatrimestres viajan aqui: una sola peticion,
            // la que ya se hacia. Ver utils/cuatrimestres.js.
            setCuatriMap(dist);
            ['perla', 'miel', 'latte', 'anual'].forEach(k => {
              if (dist[k]) preloadCache.prime(`playlist_${k}`, () => api.getPlaylistTracks(dist[k]));
            });
            if (dist.calificar) preloadCache.prime('playlist_calificar', () => api.getPlaylistTracks(dist.calificar));
            return dist;
          });
        }
      })
      .catch(() => setAuth(false));
  }, []);

  // La barra de título del escritorio va en TODOS los estados (cargando, login
  // y la app): sin ella la ventana no se podría mover ni cerrar. /player trae
  // la suya, dentro del reproductor.
  // En el diseño de escritorio, ya dentro de la app, la barra la pinta el
  // Shell (con el buscador); ahí no van las dos.
  const barra = window.location.pathname !== '/player' && !(escritorio && auth)
    ? <BarraVentana />
    : null;

  if (auth === null) {
    return (
      <ThemeProvider>
        {barra}
        <div style={{
          minHeight: 'calc(100dvh - var(--barra-h))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-deep)',
        }}>
          <div style={{
            fontSize: '2.5rem',
            animation: 'pulse-glow 1.5s ease-in-out infinite',
          }}>
            🎵
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!auth) {
    return (
      <ThemeProvider>
        {barra}
        <LoginPage />
      </ThemeProvider>
    );
  }

  // Lo que cambia entre los dos diseños es el marco y, conforme llega cada
  // fase del rediseño, la pantalla. El escritorio ya tiene todas; el móvil
  // (REDISENO_MOVIL.md) va llegando por fases y mientras tanto usa las
  // pantallas de siempre dentro de su marco.
  const rutas = (
    <Routes>
      <Route path="/" element={escritorio ? <CalificarEscritorio /> : <CalificarMovil />} />
      <Route path="/library" element={escritorio ? <BibliotecaEscritorio /> : <LibraryPage />} />
      <Route path="/recent" element={escritorio ? <RecientesEscritorio /> : <RecentPage />} />
      <Route path="/tools" element={escritorio ? <HerramientasEscritorio /> : <ToolsPage />} />
      {/* Sin tab propia: la barra movil ya tiene 5 items. Se entra
          desde Herramientas. */}
      <Route path="/backfill" element={<BackfillPage />} />
      <Route path="/window" element={escritorio ? <EscuchasEscritorio /> : <WindowPage />} />
      <Route path="/abandoned" element={<CleanupPage />} />
      <Route path="/dashboard" element={escritorio ? <ResumenEscritorio /> : <StatsPage />} />
    </Routes>
  );

  return (
    <ThemeProvider>
      <ToastProvider>
        {barra}
        <BrowserRouter>
          <Routes>
            {/* /player va FUERA del layout a proposito: es la ventana flotante
                del escritorio (y el PiP), mide ~360px y no tiene por que
                cargar el sidebar ni la barra de tabs. */}
            <Route path="/player" element={<PlayerPage />} />
            <Route path="*" element={
              escritorio ? (
                <Shell usuario={auth.user}>{rutas}</Shell>
              ) : (
                <Movil>{rutas}</Movil>
              )
            } />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
