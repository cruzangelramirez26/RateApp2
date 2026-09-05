import { useState, useEffect, useCallback, useRef } from 'react';
import { Headphones, ArrowUp, X, RefreshCw, Play } from 'lucide-react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { ratingColor, ratingDim } from '../utils/theme';
import { useToast } from '../hooks/useToast';

/**
 * Cola de "califica lo que sí escuchas".
 *
 * 1,537 de los 2,328 Me Gusta (66%) nunca pasaron por RateApp: la app está
 * ciega a dos tercios de lo que Angel escucha. Esto es PendingPage pero
 * alimentada por escuchas reales en vez de por la playlist <3333>.
 *
 * LA REGLA QUE MANDA EL DISEÑO: 1,520 de esas canciones son de antes de 2026.
 * Calificarlas con el flujo normal las metería a Latte 2026 y a la Galería
 * Anual — encima arriba de todo, porque el bloque de novedades las vería recién
 * llegadas. Por eso hay DOS acciones distintas y visibles:
 *
 *   Calificar (los 7 botones) -> cataloga: modo soft, y se guarda con la fecha
 *     de la PRIMERA escucha real, así la canción queda en su época y no toca
 *     ninguna playlist.
 *   "▲ a mi rotación" -> el flujo completo, como una canción nueva: entra a
 *     Latte + MMG + Galería + like.
 *
 * El default es el seguro. Nada entra a una playlist por descuido.
 */

const CACHE_KEY = 'backfillQueue';
const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const TOP_SET = ['A+', 'A', 'B+'];   // subir solo tiene sentido con TOP_SET

function hace(iso) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias < 30) return `hace ${dias}d`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses}m`;
  return `hace ${Math.floor(dias / 365)}a`;
}

function anio(iso) {
  return iso ? String(iso).slice(0, 4) : '—';
}

export default function BackfillPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [soloActivas, setSoloActivas] = useState(true);
  const [upliftFor, setUpliftFor] = useState(null);
  const [busy, setBusy] = useState(null);
  const [hechas, setHechas] = useState(0);
  const [visibles, setVisibles] = useState(60);
  const [sonando, setSonando] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const toast = useToast();
  const tracksRef = useRef([]);
  tracksRef.current = data?.tracks || [];

  // Se calcula antes de los handlers porque escuchar() necesita el tramo visible.
  const lista = (data?.tracks || []).filter(t => !soloActivas || t.activa);

  // Arma una playlist real con lo primero de la cola y la reproduce. Angel:
  // "no quisiera ir buscando cancion por cancion".
  async function escuchar(desde = 0) {
    setSonando(true);
    try {
      // Se manda el tramo EXACTO que se está viendo, para no obligar a
      // calificar las primeras 50 antes de poder oír las siguientes.
      const ids = lista.slice(desde, desde + 50).map(x => x.track_id);
      const r = await api.buildQueuePlaylist('backfill', 50, true, ids);
      toast(
        r.playing
          ? `Sonando ${r.count} canciones desde la #${desde + 1}`
          : (r.error || 'Playlist lista, pero no se pudo reproducir'),
        r.playing ? 'success' : 'error',
        5000,
      );
    } catch (e) {
      toast(e.message || 'No se pudo armar la playlist', 'error');
    } finally {
      setSonando(false);
    }
  }

  // Panel de "sonando ahora" DENTRO de esta página, y no es un capricho: el
  // widget del sidebar califica con el flujo completo y sin fecha, así que
  // calificar desde ahí metería la canción a Latte 2026 — justo lo que esta
  // página existe para evitar. Aquí los botones usan la lógica correcta.
  useEffect(() => {
    let vivo = true;
    const tick = () => {
      api.getNowPlaying()
        .then(np => {
          if (!vivo) return;
          const t = np?.track;
          if (!t) return setNowPlaying(null);
          // Solo interesa si es una de las que faltan por calificar.
          const enCola = tracksRef.current.find(x => x.track_id === t.id);
          setNowPlaying(enCola ? { ...enCola, image: t.image || enCola.image } : null);
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  // Cacheada en sesión: la petición recorre los ~2,300 Me Gusta de Spotify y
  // tarda. Sin esto, salir de la página y volver a entrar hacía esperar otra vez.
  const cargar = useCallback((forzar = false) => {
    setLoading(true);
    setError(null);
    if (forzar) preloadCache.invalidate(CACHE_KEY);
    preloadCache.load(CACHE_KEY, api.getBackfillQueue)
      .then(d => setData(d))
      .catch(() => setError('No se pudo cargar la cola.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Calificar = catalogar. Soft + fecha de la primera escucha: no toca Spotify.
  async function catalogar(t, rating) {
    setBusy(t.track_id);
    try {
      await api.rateTrackSoft({
        track_id: t.track_id, name: t.name, artist: t.artist,
        album: t.album || '', rating,
        added_at: t.suggested_added_at || undefined,
      });
      quitar(t.track_id);
      setHechas(h => h + 1);
    } catch {
      toast('No se pudo guardar la calificación');
    } finally {
      setBusy(null);
    }
  }

  // Flujo completo: se comporta como una canción nueva y entra a las playlists.
  async function subir(t, rating) {
    setBusy(t.track_id);
    try {
      await api.rateTrack({
        track_id: t.track_id, name: t.name, artist: t.artist,
        album: t.album || '', rating,
        added_at: t.suggested_added_at || undefined,
      });
      quitar(t.track_id);
      setHechas(h => h + 1);
      setUpliftFor(null);
      toast(`${t.name} → ${rating}, y a tu rotación de este cuatrimestre`);
    } catch {
      toast('No se pudo subir a la rotación');
    } finally {
      setBusy(null);
    }
  }

  function quitar(id) {
    setData(d => {
      if (!d) return d;
      const next = {
        ...d,
        total_pending: d.total_pending - 1,
        activas: d.activas - (d.tracks.find(x => x.track_id === id)?.activa ? 1 : 0),
        tracks: d.tracks.filter(x => x.track_id !== id),
      };
      preloadCache.set(CACHE_KEY, next);   // que el cache no quede viejo
      return next;
    });
  }

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Califica lo que sí escuchas</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Leyendo tus Me Gusta y cruzándolos con tu historial… esto tarda un poco,
          son más de 2,000 canciones.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Califica lo que sí escuchas</h1>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button className="btn" onClick={() => cargar(true)}>Reintentar</button>
      </div>
    );
  }

  const mostradas = lista.slice(0, visibles);

  return (
    <div className="page">
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            Califica lo que sí escuchas
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            {data.total_pending.toLocaleString()} Me Gusta sin calificar
            {' · '}{data.activas.toLocaleString()} los sigues oyendo
            {hechas > 0 && <> · <b style={{ color: 'var(--accent)' }}>{hechas} listas</b></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={escuchar} disabled={sonando || !data.tracks.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} /> {sonando ? 'Armando…' : 'Escuchar 50'}
          </button>
          <button className="btn" onClick={() => cargar(true)} title="Recargar de Spotify">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Sonando ahora — con los botones correctos, para no tener que calificar
          desde el widget del sidebar (que usa el flujo completo y sin fecha). */}
      {nowPlaying && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, marginTop: 12,
          padding: '10px 12px', borderRadius: 'var(--radius-md)',
          border: `1px solid var(--accent)`, background: 'var(--bg-card)',
          flexWrap: 'wrap',
        }}>
          {nowPlaying.image && (
            <img src={nowPlaying.image} alt="" style={{
              width: 42, height: 42, borderRadius: 'var(--radius-sm)',
              objectFit: 'cover', flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{
              fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Sonando ahora · {nowPlaying.plays} escuchas</div>
            <div style={{
              fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{nowPlaying.name}</div>
            <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>
              {nowPlaying.artist}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {RATINGS.map(r => (
              <button
                key={r}
                disabled={busy === nowPlaying.track_id}
                onClick={() => catalogar(nowPlaying, r)}
                style={{
                  padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                  border: `1.5px solid ${ratingColor(r)}`,
                  background: ratingDim(r), color: ratingColor(r),
                  fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700,
                }}
              >{r}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: 12, padding: '9px 12px', background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
        color: 'var(--text-muted)', lineHeight: 1.5,
      }}>
        Calificar aquí <b>solo cataloga</b>: se guarda con la fecha en que
        descubriste la canción y no entra a ninguna playlist. Si además quieres
        oírla en tu rotación de hoy, usa <ArrowUp size={11} style={{
          verticalAlign: 'middle' }} /> <b>a mi rotación</b>.
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        <button
          className="btn"
          onClick={() => { setSoloActivas(true); setVisibles(60); }}
          style={{
            background: soloActivas ? 'var(--accent)' : 'transparent',
            color: soloActivas ? 'var(--on-accent)' : 'var(--text-secondary)',
          }}
        >
          Las que sí escucho ({data.activas.toLocaleString()})
        </button>
        <button
          className="btn"
          onClick={() => { setSoloActivas(false); setVisibles(60); }}
          style={{
            background: !soloActivas ? 'var(--accent)' : 'transparent',
            color: !soloActivas ? 'var(--on-accent)' : 'var(--text-secondary)',
          }}
        >
          Todas ({data.total_pending.toLocaleString()})
        </button>
      </div>

      {lista.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
          {soloActivas
            ? 'Ya calificaste todo lo que sigues escuchando. 🎉'
            : 'No queda nada por calificar.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mostradas.map(t => (
          <div
            key={t.track_id}
            style={{
              background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)', padding: '10px 12px',
              opacity: busy === t.track_id ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              {t.image && (
                <img src={t.image} alt="" style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-sm)',
                  objectFit: 'cover', flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{t.name}</div>
                <div style={{
                  fontSize: '0.78rem', color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{t.artist}</div>
              </div>

              <button
                onClick={() => escuchar(mostradas.indexOf(t))}
                disabled={sonando}
                title="Escuchar 50 desde aquí"
                style={{
                  background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
                  padding: '4px 7px', display: 'flex', flexShrink: 0,
                }}
              ><Play size={12} /></button>

              {/* El dato que sirve para decidir: cuánto la has puesto y desde cuándo */}
              <div style={{
                textAlign: 'right', flexShrink: 0, fontSize: '0.72rem',
                color: 'var(--text-muted)', lineHeight: 1.35,
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.95rem',
                  fontWeight: 700,
                  color: t.activa ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                  {t.plays}
                </div>
                <div>desde {anio(t.first_played)}</div>
                <div style={{ opacity: 0.75 }}>{hace(t.last_played) || 'sin datos'}</div>
              </div>
            </div>

            <div style={{
              display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              {upliftFor === t.track_id ? (
                <>
                  <span style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: 2,
                  }}>
                    A tu rotación como:
                  </span>
                  {TOP_SET.map(r => (
                    <button
                      key={r}
                      disabled={busy === t.track_id}
                      onClick={() => subir(t, r)}
                      style={{
                        padding: '4px 11px', borderRadius: 7, cursor: 'pointer',
                        border: `1.5px solid ${ratingColor(r)}`,
                        background: ratingDim(r), color: ratingColor(r),
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >{r}</button>
                  ))}
                  <button
                    onClick={() => setUpliftFor(null)}
                    title="Cancelar"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', padding: 3,
                    }}
                  ><X size={14} /></button>
                </>
              ) : (
                <>
                  {RATINGS.map(r => (
                    <button
                      key={r}
                      disabled={busy === t.track_id}
                      onClick={() => catalogar(t, r)}
                      style={{
                        padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                        border: `1.5px solid var(--border-medium)`,
                        background: 'transparent', color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = ratingColor(r);
                        e.currentTarget.style.color = ratingColor(r);
                        e.currentTarget.style.background = ratingDim(r);
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border-medium)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >{r}</button>
                  ))}
                  <button
                    onClick={() => setUpliftFor(t.track_id)}
                    title="Calificar y traer a mi rotación de este cuatrimestre"
                    style={{
                      marginLeft: 'auto', display: 'flex', alignItems: 'center',
                      gap: 3, padding: '4px 9px', borderRadius: 7,
                      border: '1px solid var(--border-subtle)',
                      background: 'transparent', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: '0.72rem',
                    }}
                  >
                    <ArrowUp size={12} /> a mi rotación
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {lista.length > visibles && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn" onClick={() => setVisibles(v => v + 60)}>
            Ver 60 más ({(lista.length - visibles).toLocaleString()} restantes)
          </button>
        </div>
      )}

      {data.total_pending > 0 && lista.length > 0 && (
        <p style={{
          textAlign: 'center', marginTop: 20, fontSize: '0.75rem',
          color: 'var(--text-muted)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Headphones size={12} />
          El número grande son las veces que la has escuchado, de 2018 a hoy.
        </p>
      )}
    </div>
  );
}
