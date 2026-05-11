import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { api } from './utils/api';
import { ToastProvider } from './hooks/useToast';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import LibraryPage from './pages/LibraryPage';
import RecentPage from './pages/RecentPage';
import StatsPage from './pages/StatsPage';
import ToolsPage from './pages/ToolsPage';

export default function App() {
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    api.authStatus()
      .then(data => setAuth(data.authenticated ? data : false))
      .catch(() => setAuth(false));
  }, []);

  if (auth === null) {
    return (
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
    );
  }

  if (!auth) {
    return <LoginPage />;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="app-layout">
          <NavBar />
          <div className="main-content">
            <Routes>
              <Route path="/" element={<PendingPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/recent" element={<RecentPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/dashboard" element={<StatsPage />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}
