/**
 * RatingButtons — row of rating pills for a track.
 * Handles optimistic UI: lights up immediately, rolls back on error.
 */
import { useState } from 'react';

const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];

export default function RatingButtons({ current, onRate, compact = false }) {
  const [pending, setPending] = useState(null);

  const handleClick = async (rating) => {
    if (rating === current && !pending) return;
    setPending(rating);
    try {
      await onRate(rating);
    } catch {
      // rolled back by parent
    }
    setPending(null);
  };

  const active = pending || current;

  return (
    <div style={{
      display: 'flex',
      gap: compact ? '4px' : '5px',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
    }}>
      {RATINGS.map(r => (
        <button
          key={r}
          className="rating-btn"
          data-active={r === active ? 'true' : 'false'}
          data-rating={r}
          onClick={() => handleClick(r)}
          style={compact ? { minWidth: '32px', height: '30px', fontSize: '0.72rem' } : undefined}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
