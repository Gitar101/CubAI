import React from 'react';
import ContextDisplay from './ContextDisplay';

const InputForm = ({
  inputValue,
  handleInputChange,
  handleKeyPress,
  handlePaste,
  isLoading,
  generationMode,
  canvasMode,
  toggleCanvasMode,
  mode,
  handleSend,
  toggleModeMenu,
  showModeMenu,
  selectMode,
  toggleTabsMenu,
  showTabsMenu,
  setShowTabsMenu,
  availableTabs,
  addTabContext,
  handleCaptureFullPage,
  toggleGenerationMode,
  selectedModel,
  showModelMenu,
  setShowModelMenu,
  setShowModeMenu,
  setSelectedModel,
  capturedImage,
  capturedSlices,
  captureMeta,
  setCapturedImage,
  setCapturedSlices,
  setCaptureMeta,
  contextPreview,
  setContextPreview,
  isAbruptlyStopped,
  setIsAbruptlyStopped,
  handleContinueChat,
}) => {

  return (
    <div
      className="floating-input-bar"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 16, display: 'flex', justifyContent: 'center', zIndex: 2 }}
      onClick={(e) => {
        console.log('[InputForm] Outer div clicked');
        e.stopPropagation?.();
      }}
    >
      <div
        className="curved-input-wrapper"
        style={{
          width: '92%',
          maxWidth: 820,
        }}
      >
        <ContextDisplay contextPreview={contextPreview} setContextPreview={setContextPreview} />
        {(capturedImage || capturedSlices.length > 0) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.10)',
              border: '1px solid #7D8D86'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {capturedImage && (
              <div style={{ width: 58, height: 38, borderRadius: 6, overflow: 'hidden', background: '#111317' }}>
                <img
                  src={capturedImage}
                  alt="Page capture preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            )}
            {capturedSlices.length > 0 && (
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 200 }}>
                {capturedSlices.map((slice, idx) => (
                  <div key={idx} style={{ flexShrink: 0, width: 58, height: 38, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.2)', background: '#111317' }}>
                    <img
                      src={slice.url}
                      alt={`Page capture slice ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#1b1b1b' }}>
                Page screenshot
              </div>
              <div style={{ fontSize: 12, color: '#3E3F29' }}>
                {capturedSlices.length > 0 ?
                  `${capturedSlices.length} slices${captureMeta?.kb ? ` • ~${captureMeta.kb} KB` : ''}` :
                  `${captureMeta?.w}×${captureMeta?.h}${captureMeta?.kb ? ` • ~${captureMeta.kb} KB` : ''}`
                }
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setCapturedImage(null); setCapturedSlices([]); setCaptureMeta(null); }}
              aria-label="Remove screenshot"
              title="Remove screenshot"
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#3E3F29', cursor: 'pointer' }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div
          className="input-surface"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 14,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.12)',
            border: '1px solid #7D8D86',
            boxShadow: '0 2px 12px rgba(0,0,0,0.20)',
            position: 'relative'
          }}
        >
          {isAbruptlyStopped && (
            <button
              onClick={handleContinueChat}
              style={{
                marginBottom: 10,
                padding: '8px 16px',
                borderRadius: 8,
                background: '#4CAF50', /* Green background */
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                alignSelf: 'flex-start', /* Align to the left */
              }}
            >
              Continue
            </button>
          )}
          <textarea
            className="chatlike-input"
            placeholder={
              generationMode === 'image'
                ? 'Describe an image to generate...'
                : canvasMode
                  ? 'Draw on the canvas...'
                  : mode === 'chat'
                    ? 'Chat with CubAI…'
                    : 'Ask with page context…'
            }
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            disabled={isLoading}
            rows="1"
            style={{
              background: 'transparent',
              border: `1px solid #7D8D86`,
              outline: 'none',
              color: '#1b1b1b',
              fontSize: 16,
              fontWeight: 500,
              fontFamily: `"Segoe UI", Roboto, "Inter", system-ui, -apple-system, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif`,
              letterSpacing: 0.2,
              borderRadius: 8,
              padding: '8px 10px',
              backgroundColor: 'rgba(255,255,255,0.6)',
              transition: 'height 0.3s ease-out' /* Added transition for smooth resizing */
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative' }} data-trigger="mode">
                <button
                  className="icon-button"
                  onClick={toggleModeMenu}
                  disabled={isLoading}
                  aria-label="Switch system prompt"
                  title={`Mode: ${mode === 'chat' ? 'Chat' : mode === 'summarize' ? 'Summarize' : 'Explain'}`}
                  style={{
                    width: 30, height: 30, display: 'grid', placeItems: 'center',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="5" y="5" width="14" height="14" rx="3" />
                    <path d="M9 15l6-6" />
                  </svg>
                </button>
                {showModeMenu && (
                  <div
                    data-menu="mode"
                    style={{
                      position: 'absolute',
                      bottom: 38,
                      left: 0,
                      background: 'rgba(20,20,21,0.98)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10,
                      boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                      padding: 6,
                      minWidth: 160,
                      zIndex: 5
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="menu-item"
                      onClick={() => selectMode('summarize')}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                        background: 'transparent', color: '#e5e7eb', border: 'none',
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer'
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: mode==='summarize' ? '#43cea2' : '#6b7280' }} />
                      Summarize (with context)
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => selectMode('explain')}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                        background: 'transparent', color: '#e5e7eb', border: 'none',
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer'
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: mode==='explain' ? '#43cea2' : '#6b7280' }} />
                      Explain (with context)
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => selectMode('chat')}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                        background: 'transparent', color: '#e5e7eb', border: 'none',
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer'
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: mode==='chat' ? '#43cea2' : '#6b7280' }} />
                      Chat (no context)
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => selectMode('Tutor')}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                        background: 'transparent', color: '#e5e7eb', border: 'none',
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer'
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: mode==='Tutor' ? '#43cea2' : '#6b7280' }} />
                      Tutor (PCM problems)
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }} data-trigger="tabs">
                  <button
                    className="icon-button"
                    onClick={toggleTabsMenu}
                    disabled={isLoading}
                    aria-label="Add page context"
                    title="Add page context"
                    style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent' }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M7 12h10" />
                      <path d="M12 7v10" />
                    </svg>
                  </button>
                  {showTabsMenu && (
                    <div
                      data-menu="tabs"
                      style={{
                        position: 'absolute',
                        bottom: 38,
                        left: 0,
                        background: 'rgba(20,20,21,0.98)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                        padding: 6,
                        minWidth: 240,
                        maxHeight: 260,
                        overflowY: 'auto',
                        zIndex: 5
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(availableTabs && availableTabs.length ? availableTabs : []).map(t => (
                        <button
                          key={t.id}
                          className="menu-item"
                          onClick={() => addTabContext(t.id)}
                          style={{
                            display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                            background: 'transparent', color: '#e5e7eb', border: 'none',
                            padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left'
                          }}
                          title={t.title || t.url}
                        >
                          {t.favIconUrl ? (
                            <img
                              src={t.favIconUrl}
                              alt=""
                              style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', background: '#1f2937' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline-grid'; }}
                            />
                          ) : null}
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              display: t.favIconUrl ? 'none' : 'inline-grid',
                              placeItems: 'center',
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.25)'
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="#9ca3af"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <path d="M3 12h18" />
                              <path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
                            </svg>
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.title || t.url}
                          </span>
                        </button>
                      ))}
                      {(!availableTabs || availableTabs.length === 0) && (
                        <div style={{ color: '#9ca3af', padding: '8px 10px' }}>No tabs available</div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    className="icon-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('[UI] Screenshot button clicked');
                      handleCaptureFullPage();
                    }}
                    disabled={isLoading}
                    aria-label="Capture page screenshot"
                    title="Attach full-page screenshot"
                    style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent' }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3E3F29" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="18" height="12" rx="2" />
                      <circle cx="9" cy="12" r="2.2" />
                      <path d="M3 9h4l2-2h6l2 2h4" />
                    </svg>
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    className="icon-button"
                    onClick={toggleGenerationMode}
                    disabled={isLoading}
                    aria-label="Toggle Image Generation Mode"
                    title="Toggle Image Generation Mode"
                    style={{
                      width: 30, height: 30, display: 'grid', placeItems: 'center',
                      borderRadius: 8,
                      background: generationMode === 'image' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                      border: '1px solid',
                      borderColor: generationMode === 'image' ? '#A855F7' : 'rgba(255,255,255,0.2)',
                      transition: 'background-color 0.2s, border-color 0.2s',
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3E3F29" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    className="icon-button"
                    onClick={toggleCanvasMode}
                    disabled={isLoading}
                    aria-label="Toggle Canvas Mode"
                    title="Toggle Canvas Mode"
                    style={{
                      width: 30, height: 30, display: 'grid', placeItems: 'center',
                      borderRadius: 8,
                      background: canvasMode ? 'rgba(168, 85, 247, 0.3)' : 'transparent',
                      border: '1px solid',
                      borderColor: canvasMode ? '#A855F7' : 'rgba(255,255,255,0.2)',
                      transition: 'background-color 0.2s, border-color 0.2s',
                      boxShadow: canvasMode ? '0 0 0 2px #A855F7, 0 0 0 5px rgba(168, 85, 247, 0.6)' : 'none',
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3E3F29" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil-line"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m19 12-2-2"/><path d="M15 6l2 2"/></svg>
                  </button>
                </div>
                <div style={{ position: 'relative' }} data-trigger="model">
                  <button
                    className="icon-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('[ModelSelector] Button clicked');
                      // Removed setShowModeMenu(false) from here as it's handled by toggleModeMenu
                      if (typeof setShowModelMenu === 'function') {
                        setShowModelMenu(!showModelMenu); // Simplified state update
                      } else {
                        console.error('[ModelSelector] setShowModelMenu is not a function:', setShowModelMenu);
                      }
                      console.log('[ModelSelector] Toggle menu. Now:', !showModelMenu);
                    }}
                    disabled={isLoading}
                    aria-label="Select model"
                    title={`Model: ${selectedModel}`}
                    style={{ height: 30, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', padding: '0 8px' }}
                  >
                    <span style={{ fontSize: 12, color: '#3E3F29', fontWeight: 600 }}>
                      {selectedModel === 'gemini-2.5-flash-lite' ? 'G2 Flash Lite' : selectedModel === 'chutes-glm-4.5-air' ? 'GLM 4.5 Air' : 'G2 Flash'}
                    </span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {showModelMenu && (
                    <React.Fragment>
                      <div
                        data-menu="model"
                        style={{
                          position: 'absolute',
                          bottom: 38,
                          left: 0,
                          background: 'rgba(20,20,21,0.98)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 10,
                          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                          padding: 6,
                          minWidth: 200,
                          zIndex: 5
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select gemini-2.5-flash'); } catch {}
                            setSelectedModel('gemini-2.5-flash');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='gemini-2.5-flash' ? '#43cea2' : '#6b7280' }} />
                          gemini-2.5-flash
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select gemini-2.5-flash-lite'); } catch {}
                            setSelectedModel('gemini-2.5-flash-lite');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='gemini-2.5-flash-lite' ? '#43cea2' : '#6b7280' }} />
                          gemini-2.5-flash-lite
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select chutes-glm-4.5-air'); } catch {}
                            setSelectedModel('chutes-glm-4.5-air');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='chutes-glm-4.5-air' ? '#43cea2' : '#6b7280' }} />
                          zai-org/GLM-4.5-Air
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select deepseek-r1-distill-llama-70b'); } catch {}
                            setSelectedModel('deepseek-r1-distill-llama-70b');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='deepseek-r1-distill-llama-70b' ? '#43cea2' : '#6b7280' }} />
                          deepseek-r1-distill-llama-70b
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select meta-llama/llama-4-maverick-17b-128e-instruct'); } catch {}
                            setSelectedModel('meta-llama/llama-4-maverick-17b-128e-instruct');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='meta-llama/llama-4-maverick-17b-128e-instruct' ? '#43cea2' : '#6b7280' }} />
                          meta-llama/llama-4-maverick-17b-128e-instruct
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select llama-3.3-70b-versatile'); } catch {}
                            setSelectedModel('llama-3.3-70b-versatile');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='llama-3.3-70b-versatile' ? '#43cea2' : '#6b7280' }} />
                          llama-3.3-70b-versatile
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select openai/gpt-oss-120b'); } catch {}
                            setSelectedModel('openai/gpt-oss-120b');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='openai/gpt-oss-120b' ? '#43cea2' : '#6b7280' }} />
                          openai/gpt-oss-120b
                        </button>
                      </div>
                    </React.Fragment>
                  )}
                </div>
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button
                className="send-fab"
                onClick={handleSend}
                disabled={isLoading || (!inputValue.trim() && !capturedImage)}
                aria-label="Send"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 12l15-7-7 15-2-6-6-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputForm;