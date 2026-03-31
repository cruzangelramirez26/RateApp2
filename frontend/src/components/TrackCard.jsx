/**
 * TrackCard — a single song row with album art, metadata, and rating buttons.
 * On mobile: stacks vertically (info top, ratings bottom).
 * On desktop: horizontal layout.
 */
import RatingButtons from './RatingButtons';
import { ExternalLink } from 'lucide-react';

export default function TrackCard({ track, onRate, style, index = 0 }) {
  return (
    <div
      className="card track-card"
      style={{
        animationDelay: `${Math.min(index * 40, 400)}ms`,
        ...style,
      }}
    >
      {/* Top row: art + info */}
      <div className="track-card-info">
        {track.image ? (
          <img
            src={track.image}
            alt=""
            loading="lazy"
            className="track-card-art"
          />
        ) : (
          <div className="track-card-art track-card-art-placeholder">
            🎵
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="track-card-name">
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
          <div className="track-card-artist">
            {track.artist}
            {track.album ? ` · ${track.album}` : ''}
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="track-card-ratings">
        <RatingButtons
          current={track.rating}
          onRate={(r) => onRate(track, r)}
          compact={true}
        />
      </div>
    </div>
  );
}
