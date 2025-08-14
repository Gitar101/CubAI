import React from 'react';
import ShinyText from './ShinyText';

const Header = ({ clearChat }) => {
  return (
    <header
      className="header"
      style={{
        position: 'relative',
        zIndex: 1,
        backgroundColor: '#9E876D',
        borderBottom: '1px solid #3E3F29'
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src="/cubai2.png"
          alt=""
          aria-hidden="true"
          width="28"
          height="28"
          style={{ display: 'block', filter: 'brightness(1) contrast(1)', borderRadius: 6 }}
        />
        <ShinyText text="CubAI" speed={5} />
        <div style={{ flex: 1 }} />
        <button
          onClick={clearChat}
          aria-label="Clear chat"
          title="Clear chat"
          style={{
            background: '#F5EFE6',
            border: '1px solid #7D8D86',
            color: '#a17f51ff',
            cursor: 'pointer',
            fontSize: '20px',
            fontWeight: 'bold',
            padding: '4px 12px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          +
        </button>
      </div>
    </header>
  );
};

export default Header;