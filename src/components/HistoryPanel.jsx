import React from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';

const HistoryPanel = ({ chatHistory, onLoadSession, onDeleteSession, onBack }) => {
  const [hoveredSessionId, setHoveredSessionId] = React.useState(null);

  return (
    <div className="history-panel" style={{ padding: '10px', backgroundColor: '#BCA88D', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
        <button
          onClick={onBack}
          aria-label="Back to chat"
          title="Back to chat"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F5EFE6',
          }}
        >
          <ArrowLeft size={24} />
        </button>
        <h2 style={{ color: '#F5EFE6', margin: '0 0 0 10px' }}>History</h2>
      </div>
      {chatHistory.length === 0 ? (
        <p style={{ color: '#F5EFE6' }}>No chat sessions saved yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {(chatHistory || []).map(session => (
            <li
              key={session.id}
              style={{
                backgroundColor: '#9E876D',
                border: '1px solid #7D8D86',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '10px',
                color: '#F5EFE6',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={() => {
                setHoveredSessionId(session.id);
              }}
              onMouseLeave={() => {
                setHoveredSessionId(null);
              }}
            >
              <div
                onClick={() => onLoadSession(session)}
                style={{
                  flexGrow: 1,
                  cursor: 'pointer',
                  transform: hoveredSessionId === session.id ? 'translateY(-3px)' : 'translateY(0)',
                  boxShadow: hoveredSessionId === session.id ? '0 4px 8px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                  padding: '10px', // Add padding to the clickable area
                  margin: '-10px', // Offset padding to maintain overall size
                }}
              >
                <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>{session.title}</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#D4C7B8' }}>{new Date(session.timestamp).toLocaleString()}</p>
              </div>
              {hoveredSessionId === session.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent loading chat when deleting
                    onDeleteSession(session.id);
                  }}
                  aria-label="Delete chat"
                  title="Delete chat"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'red',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: '10px',
                  }}
                >
                  <Trash2 size={20} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HistoryPanel;