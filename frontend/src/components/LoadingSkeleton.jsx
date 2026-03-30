export default function LoadingSkeleton({ count = 6 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: '76px',
            borderRadius: 'var(--radius-md)',
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}
