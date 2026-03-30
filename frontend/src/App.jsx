import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { api } from './utils/api';
import { ToastProvider } from './hooks/useToast';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import RecentPage from './pages/RecentPage';
import StatsPage from './pages/StatsPage';

export default function App() {
  const [auth, setAuth] = useState(null); // null = loading, false = need login, object = logged in

  useEffect(() => {
    api.authStatus()
      .then(data => setAuth(data.authenticated ? data : false))
      .catch(() => setAuth(false));
  }, []);

  // Loading state
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

  // Need Spotify auth
  if (!auth) {
    return <LoginPage />;
  }

  // Authenticated
  return (
    <ToastProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<PendingPage />} />
          <Route path="/recent" element={<RecentPage />} />
          <Route path="/dashboard" element={<StatsPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
