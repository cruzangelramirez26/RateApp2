import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { api } from './utils/api';
import { preloadCache } from './utils/preloadCache';
import { setCuatriMap } from './utils/cuatrimestres';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
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

  useEffect(() => {
    api.authStatus()
      .then(data => {
        const authenticated = data.authenticated ? data : false;
        setAuth(authenticated);
        if (authenticated) {
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

  if (auth === null) {
    return (
      <ThemeProvider>
        <div style={{
          minHeight: '100dvh',
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
        <LoginPage />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* /player va FUERA del layout a proposito: es la ventana flotante
                del escritorio (y el PiP), mide ~360px y no tiene por que
                cargar el sidebar ni la barra de tabs. */}
            <Route path="/player" element={<PlayerPage />} />
            <Route path="*" element={
          <div className="app-layout">
            <NavBar />
            <div className="main-content">
              <Routes>
                <Route path="/" element={<PendingPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/recent" element={<RecentPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                {/* Sin tab propia: la barra movil ya tiene 5 items. Se entra
                    desde Herramientas. */}
                <Route path="/backfill" element={<BackfillPage />} />
                <Route path="/window" element={<WindowPage />} />
                <Route path="/abandoned" element={<CleanupPage />} />
                <Route path="/dashboard" element={<StatsPage />} />
              </Routes>
            </div>
          </div>
            } />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
