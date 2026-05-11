/**
 * LoginPage — Shown when Spotify auth is needed.
 */
import { api } from '../utils/api';

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      textAlign: 'center',
      background: 'var(--bg-deep)',
    }}>
      {/* Decorative glow */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(29,185,84,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="fade-in" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: '3.5rem',
          marginBottom: '8px',
          filter: 'drop-shadow(0 0 20px rgba(29,185,84,0.3))',
        }}>
          🎵
        </div>

        <h1 style={{
          fontSize: '2rem',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          marginBottom: '6px',
        }}>
          RateApp
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.95rem',
          marginBottom: '32px',
          maxWidth: '280px',
        }}>
          Califica tus canciones de Spotify y organízalas automáticamente
        </p>

        <a
          href={api.loginUrl()}
          className="btn btn-spotify"
          style={{
            padding: '14px 32px',
            fontSize: '1rem',
            borderRadius: 'var(--radius-lg)',
            gap: '10px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Conectar con Spotify
        </a>
      </div>
    </div>
  );
}
