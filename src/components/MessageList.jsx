import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain } from 'lucide-react'; // Import Brain icon
import { convertLatexCodeBlocks } from '../utils/latex';
import CodeBlock from './CodeBlock';

const MessageList = ({ messages, remarkPlugins, rehypePlugins, isStreaming }) => {
  // State to manage expanded/collapsed status for each thinking message
  const [thinkingStates, setThinkingStates] = useState({});

  // Handler to toggle expanded state
  const toggleThinking = (msgId) => {
    setThinkingStates(prev => ({
      ...prev,
      [msgId]: {
        ...prev[msgId],
        isExpanded: !prev[msgId]?.isExpanded,
      }
    }));
  };

  useEffect(() => {
    if (!isStreaming) {
      setThinkingStates(prev => {
        const newStates = { ...prev };
        messages.forEach(msg => {
          if (msg.role === 'ai' && msg.reasoning) {
            const currentState = newStates[msg.id];
            // If it's currently expanded, collapse it
            if (currentState?.isExpanded) {
              newStates[msg.id] = {
                ...currentState,
                isExpanded: false,
              };
            }
          }
        });
        return newStates;
      });
    }
  }, [isStreaming, messages]);

  return (
    <main className="main-content" style={{ position: 'relative', zIndex: 1 }}>
      <div className="chat-area">
        {messages.map((msg) => {
          const textParts = msg.content.filter(p => p.type === 'text');
          const imageParts = msg.content.filter(p => p.type === 'image');
          const hasImage = imageParts.length > 0;
          const hasText = textParts.length > 0;

          if (!hasText && !hasImage) {
            return null;
          }

          const isAiImageMsg = msg.role === 'ai' && hasImage;

          if (isAiImageMsg) {
            return (
              <React.Fragment key={msg.id}>
                <div
                  className="message ai-message"
                  style={{
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.6)',
                    border: '1px solid #3E3F29',
                    borderRadius: '12px',
                    color: '#1b1b1b'
                  }}
                >
                  <div
                    className="image-container"
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: 'none',
                      maxWidth: '100%',
                      height: 'auto',
                    }}
                  >
                    {imageParts.map((part, i) => (
                      <a
                        key={`${msg.id}-img-link-${i}`}
                        href={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', width: '100%', height: 'auto' }}
                      >
                        <img
                          key={`${msg.id}-img-${i}`}
                          src={part.url}
                          alt="Content"
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            maxWidth: '100%',
                          }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
                {hasText && (
                  <div
                    key={`${msg.id}-text`}
                    className="message ai-message"
                    style={{
                      border: '1px solid #3E3F29',
                      background: 'rgba(255,255,255,0.55)',
                      color: '#1b1b1b'
                    }}
                  >
                    {textParts.map((part, i) => {
                      const key = `${msg.id}-${i}`;
                      const text = part.text || '';
                      return (
                        <ReactMarkdown
                          key={key + '-md'}
                          remarkPlugins={remarkPlugins}
                          rehypePlugins={rehypePlugins}
                          components={{
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            table: ({node, ...props}) => (
                              <table style={{
                                borderCollapse: 'collapse',
                                width: '100%',
                                margin: '12px 0',
                                backgroundColor: 'rgb(107 79 59)',
                                borderRadius: '8px',
                                overflow: 'hidden'
                              }} {...props} />
                            ),
                            th: ({node, ...props}) => (
                              <th style={{
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                padding: '8px 12px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                fontWeight: 600,
                                color: '#f0f0f0'
                              }} {...props} />
                            ),
                            td: ({node, ...props}) => (
                              <td style={{
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                padding: '8px 12px',
                                color: '#e0e0e0'
                              }} {...props} />
                            )
                          }}
                        >
                          {convertLatexCodeBlocks(text)}
                        </ReactMarkdown>
                      );
                    })}
                  </div>
                )}
              </React.Fragment>
            );
          }

          const state = thinkingStates[msg.id] || { isExpanded: true };
          const isThinkingVisible = msg.role === 'ai' && msg.reasoning && state.isExpanded;

          return (
            <div
              key={msg.id}
              className={`message ${msg.role}-message`}
              style={{
                border: '1px solid #3E3F29',
                background: 'rgba(255,255,255,0.55)',
                color: '#1b1b1b'
              }}
            >
              {msg.role === 'ai' && msg.reasoning && (
                <div
                  className="thinking-message-container"
                  onClick={() => toggleThinking(msg.id)} // Make it clickable
                  style={{
                    cursor: 'pointer',
                    marginBottom: '10px',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid #8B4513', // Brown border
                    borderRadius: '8px',
                    overflow: 'hidden', // Important for transition
                    transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
                    maxHeight: isThinkingVisible ? '500px' : '40px', // Approximate max height for content, min for icon
                    opacity: isThinkingVisible ? 1 : 0.9,
                    padding: '8px 12px', // Consistent padding
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Brain size={18} color="#8B4513" style={{ flexShrink: 0 }} /> {/* Brown Brain icon */}
                    {isThinkingVisible ? (
                      <span style={{ color: '#8B4513', fontWeight: 500, fontStyle: 'italic' }}> {/* Brown text */}
                        {msg.reasoning}
                      </span>
                    ) : (
                      <span style={{ color: '#8B4513', fontWeight: 500, fontStyle: 'italic' }}> {/* Brown text */}
                        Reasoning...
                      </span>
                    )}
                  </div>
                </div>
              )}
              {hasImage && (
                <div
                  className="image-container"
                  style={{
                    marginBottom: hasText ? '12px' : '0',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: 'none',
                    maxWidth: '100%',
                    height: 'auto',
                  }}
                >
                  {imageParts.map((part, i) => (
                    <a
                      key={`${msg.id}-img-link-${i}`}
                      href={part.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'block', width: '100%', height: 'auto' }}
                    >
                      <img
                        key={`${msg.id}-img-${i}`}
                        src={part.url}
                        alt="Content"
                        style={{
                          width: '100%',
                          height: 'auto',
                          display: 'block',
                          maxWidth: '100%',
                        }}
                      />
                    </a>
                  ))}
                </div>
              )}
              {hasText && (
                <>
                  {msg.contexts && msg.contexts.length > 0 && (
                    <div className="context-pills-container" style={{ marginBottom: '10px' }}>
                      {msg.contexts.map((context, index) => (
                        <div key={index} className="context-pill" style={{ padding: '8px 12px', marginBottom: '5px', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', border: '1px solid #7D8D86', color: '#1b1b1b', fontSize: '14px' }}>
                          <p style={{ margin: '0', fontStyle: 'italic' }}>{context}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {textParts.map((part, i) => {
                    const key = `${msg.id}-${i}`;
                    const raw = part.text || '';
                    const hiddenTokenMatch = raw.match(/^\/\/context-url:\s*(https?:\/\/[^\s)]+)\s*$/i);
                    if (hiddenTokenMatch) {
                      const url = hiddenTokenMatch[1];
                      let hostname = '';
                      let origin = '';
                      try {
                        const u = new URL(url);
                        hostname = u.hostname;
                        origin = u.origin;
                      } catch {
                        hostname = url.replace(/^https?:\/\//i, '');
                        origin = null;
                      }
                      const favicon = origin ? `${origin}/favicon.ico` : '';
                      const title = hostname ? hostname : (url.length > 60 ? url.slice(0, 57) + '…' : url);

                      return (
                        <a
                          key={key + '-card'}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 8,
                            padding: 10,
                            borderRadius: 12,
                            background: '#111317',
                            color: '#e8e8e8',
                            textDecoration: 'none',
                            border: '1px solid #22252b',
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              overflow: 'hidden',
                              background: '#23262d',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flex: '0 0 auto',
                            }}
                          >
                            {favicon ? (
                              <img
                                src={favicon}
                                alt=""
                                width="20"
                                height="20"
                                style={{ display: 'block' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#444' }} />
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                color: '#f1f5f9',
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                              }}
                              title={title}
                            >
                              {title}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: '#a1a1aa',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginTop: 2,
                                maxWidth: '100%',
                              }}
                              title={hostname || url}
                            >
                              {hostname || url}
                            </div>
                          </div>
                        </a>
                      );
                    }

                    const text = raw;
                    const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
                    const url = urlMatch ? urlMatch[0] : null;

                    const textNode = (
                      <ReactMarkdown
                        key={key + '-md'}
                        remarkPlugins={remarkPlugins}
                        rehypePlugins={rehypePlugins}
                        components={{
                          code({ node, inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                          table: ({node, ...props}) => (
                            <table style={{
                              borderCollapse: 'collapse',
                              width: '100%',
                              margin: '12px 0',
                              backgroundColor: 'rgb(107 79 59)',
                              borderRadius: '8px',
                              overflow: 'hidden'
                            }} {...props} />
                          ),
                          th: ({node, ...props}) => (
                            <th style={{
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              padding: '8px 12px',
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              fontWeight: 600,
                              color: '#f0f0f0'
                            }} {...props} />
                          ),
                          td: ({node, ...props}) => (
                            <td style={{
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              padding: '8px 12px',
                              color: '#e0e0e0'
                            }} {...props} />
                          )
                        }}
                      >
                        {convertLatexCodeBlocks(text)}
                      </ReactMarkdown>
                    );

                    if (!url) {
                      return textNode;
                    }

                    let hostname = '';
                    let origin = '';
                    try {
                      const u = new URL(url);
                      hostname = u.hostname;
                      origin = u.origin;
                    } catch {
                      hostname = url.replace(/^https?:\/\//i, '');
                      origin = null;
                    }
                    const favicon = origin ? `${origin}/favicon.ico` : '';
                    const title = hostname ? hostname : (url.length > 60 ? url.slice(0, 57) + '…' : url);

                    const card = (
                      <a
                        key={key + '-card'}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 12,
                          background: '#111317',
                          color: '#e8e8e8',
                          textDecoration: 'none',
                          border: '1px solid #22252b',
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: '#23262d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: '0 0 auto',
                          }}
                        >
                          {favicon ? (
                            <img
                              src={favicon}
                              alt=""
                              width="20"
                              height="20"
                              style={{ display: 'block' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#444' }} />
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              color: '#f1f5f9',
                              lineHeight: 1.2,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '100%',
                            }}
                            title={title}
                          >
                            {title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#a1a1aa',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 2,
                              maxWidth: '100%',
                            }}
                            title={hostname || url}
                          >
                            {hostname || url}
                          </div>
                        </div>
                      </a>
                    );

                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column' }}>
                        {textNode}
                        {card}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
};

export default MessageList;