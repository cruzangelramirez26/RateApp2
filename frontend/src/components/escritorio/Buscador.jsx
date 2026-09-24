import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import Nota from './Nota';

/**
 * El buscador de la barra de arriba (Ctrl+K).
 *
 * Busca en lo que la app YA tiene en memoria —los Me Gusta y lo calificado
 * reciente, que App.jsx precarga al arrancar— así que no le pega al backend
 * por cada tecla. Son las mismas claves de preloadCache: si ya se cargaron,
 * sale instantáneo; si no, espera a esa misma petición en vez de lanzar otra.
 *
 * Elegir un resultado abre la canción en Spotify.
 */
const MAX = 8;

const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Buscador() {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState(0);
  const [pool, setPool] = useState(null);
  const input = useRef(null);

  // Ctrl+K (o ⌘K) enfoca desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cargar = () => {
    if (pool) return;
    Promise.all([
      preloadCache.load('likedAll', () => api.getLikedAll(500, 0)).catch(() => null),
      preloadCache.load('recent', () => api.getRecent(100)).catch(() => null),
    ]).then(([liked, recent]) => {
      const vistos = new Set();
      const todo = [];
      [...(recent || []), ...(liked?.tracks || liked || [])].forEach((t) => {
        if (!t?.id || vistos.has(t.id)) return;
        vistos.add(t.id);
        todo.push({ ...t, _clave: normal(`${t.name} ${t.artist}`) });
      });
      setPool(todo);
    });
  };

  const resultados = useMemo(() => {
    const n = normal(q.trim());
    if (!n || !pool) return [];
    return pool.filter((t) => t._clave.includes(n)).slice(0, MAX);
  }, [q, pool]);

  useEffect(() => setSel(0), [q]);

  const abrir = (t) => {
    window.open(t.spotify_url || `https://open.spotify.com/track/${t.id}`, '_blank', 'noopener');
    setAbierto(false);
    input.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQ(''); input.current?.blur(); return; }
    if (!resultados.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % resultados.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + resultados.length) % resultados.length); }
    if (e.key === 'Enter') { e.preventDefault(); abrir(resultados[sel]); }
  };

  const mostrar = abierto && q.trim().length > 0;

  return (
    <div className="esc-buscador">
      <label className="esc-buscador-caja">
        <Search size={13} strokeWidth={2} />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setAbierto(true); cargar(); }}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Buscar canción o artista"
          aria-label="Buscar canción o artista"
        />
        <span className="esc-kbd">Ctrl K</span>
      </label>
      {mostrar && (
        <div className="esc-buscador-lista" role="listbox">
          {!pool && <div className="esc-buscador-vacio">Cargando tu biblioteca…</div>}
          {pool && !resultados.length && <div className="esc-buscador-vacio">Nada con “{q.trim()}” en tus Me Gusta ni en lo calificado.</div>}
          {resultados.map((t, i) => (
            <button
              key={t.id}
              role="option"
              aria-selected={i === sel}
              className={`esc-buscador-fila${i === sel ? ' activa' : ''}`}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => abrir(t)}
            >
              {t.image ? <img src={t.image} alt="" /> : <span className="esc-buscador-sin-img" />}
              <span className="esc-buscador-texto">
                <span className="esc-buscador-nombre">{t.name}</span>
                <span className="esc-buscador-artista">{t.artist}</span>
              </span>
              <Nota rating={t.rating} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
