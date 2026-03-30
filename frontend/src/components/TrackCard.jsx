/**
 * TrackCard — a single song row with album art, metadata, and rating buttons.
 */
import RatingButtons from './RatingButtons';
import { ExternalLink } from 'lucide-react';

export default function TrackCard({ track, onRate, style, index = 0 }) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        animationDelay: `${Math.min(index * 40, 400)}ms`,
        ...style,
      }}
    >
      {/* Album art */}
      {track.image ? (
        <img
          src={track.image}
          alt=""
          loading="lazy"
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
        }}>
          🎵
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {track.name}
          </span>
          {track.spotify_url && (
            <a
              href={track.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--spotify)', flexShrink: 0, lineHeight: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
        <div style={{
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {track.artist}
          {track.album ? ` · ${track.album}` : ''}
        </div>
      </div>

      {/* Ratings */}
      <RatingButtons
        current={track.rating}
        onRate={(r) => onRate(track, r)}
        compact={true}
      />
    </div>
  );
}
