export default function VoiceInterface({ live, onToggle, onInterrupt, interim, notice, support, state }) {
  let statusText = '';
  if (interim) {
    statusText = interim;
  } else if (live) {
    if (state === 'SPEAKING') statusText = 'MILO is speaking... (Tap orb or button to interrupt)';
    else if (state === 'THINKING' || state === 'TOOL_USE') statusText = 'Thinking...';
    else statusText = 'Listening... Speak anytime';
  }

  return (
    <div className="voice">
      <div className="voice-status-row">
        <p className="interim" aria-live="polite">{statusText}</p>
        {live && state === 'SPEAKING' && (
          <button className="interrupt-btn" onClick={onInterrupt} aria-label="Interrupt MILO speaking">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
            <span>Interrupt</span>
          </button>
        )}
      </div>
      <button className={`mic${live ? ' on' : ''}`} onClick={onToggle} aria-pressed={live}
        aria-label={live ? 'Turn off Live Mode' : 'Turn on Live Mode'}>
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <span>{live ? 'Live' : 'Go live'}</span>
      </button>
      {!support.stt && <p className="note">Voice input needs Chrome, Edge or Safari. Typing still works.</p>}
      {notice && <p className="note" role="alert">{notice}</p>}
    </div>
  );
}
