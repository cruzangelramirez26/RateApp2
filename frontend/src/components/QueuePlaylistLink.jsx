import { ExternalLink, X } from 'lucide-react';

/**
 * "La playlist de las menos escuchadas no se hace, se queda sin hacer nada".
 *
 * SÍ SE ESTABA HACIENDO. Los logs de Cloud Run tienen los tres clics de Angel
 * respondiendo 200, y el endpoint creaba/actualizaba la playlist en 0.5 s. Lo
 * que falla es la REPRODUCCIÓN: sin un dispositivo de Spotify activo,
 * start_playback no tiene dónde sonar.
 *
 * Y lo que volvía el fallo invisible: el backend devuelve el link en
 * `spotify_url` y el frontend lo tiraba a la basura. O sea la playlist quedaba
 * armada con su tramo exacto y no había forma de llegar a ella. De ahí "no hizo
 * nada".
 *
 * Esto NO reemplaza al toast, que sí existía y sí decía el error — se queda,
 * porque el toast se va en 5 s y el link tiene que sobrevivir a eso.
 */
export default function QueuePlaylistLink({ info, onClose }) {
  if (!info?.url) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--rating-d)', background: 'var(--bg-card)',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{
          fontSize: '0.68rem', color: 'var(--rating-d)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Playlist lista · {info.count} canciones
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {info.error || 'No se pudo reproducir desde aquí.'} Ábrela y dale play.
        </div>
      </div>
      <a
        className="btn"
        href={info.url}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
      >
        <ExternalLink size={14} /> Abrir en Spotify
      </a>
      <button
        className="btn"
        onClick={onClose}
        title="Ocultar"
        style={{ display: 'flex', alignItems: 'center', padding: '8px 10px' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
