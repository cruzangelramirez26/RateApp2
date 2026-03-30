import { Search, X } from 'lucide-react';

export default function SearchBar({ value, onChange, placeholder = 'Buscar...' }) {
  return (
    <div style={{ position: 'relative' }}>
      <Search
        size={16}
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      />
      <input
        className="input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: '36px', paddingRight: value ? '36px' : '14px' }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 0,
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
