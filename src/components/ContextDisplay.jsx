import React from 'react';

const ContextDisplay = ({ contextPreview, setContextPreview }) => {
  if (!contextPreview) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.10)',
        border: '1px solid #7D8D86',
        height: '44px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {contextPreview.favIconUrl ? (
        <img
          src={contextPreview.favIconUrl}
          alt=""
          style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover', background: '#1f2937' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline-grid'; }}
        />
      ) : null}
      <span
        style={{
          width: 22, height: 22, borderRadius: 6, display: contextPreview.favIconUrl ? 'none' : 'inline-grid',
          placeItems: 'center', background: 'transparent', border: '1px solid rgba(0,0,0,0.25)'
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
        </svg>
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#1b1b1b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {contextPreview.title}
        </div>
        <div style={{ fontSize: 12, color: '#3E3F29', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {contextPreview.origin}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setContextPreview(null); }}
        aria-label="Remove context"
        title="Remove context"
        style={{
          marginLeft: 'auto',
          background: 'transparent',
          border: 'none',
          color: '#3E3F29',
          cursor: 'pointer'
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
};

export default ContextDisplay;