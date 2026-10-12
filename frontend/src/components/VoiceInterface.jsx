export default function VoiceInterface({ live, onToggle, interim, notice, support, state }) {
  let statusText = '';
  if (interim) {
    statusText = interim;
  } else if (live) {
    if (state === 'SPEAKING') statusText = 'MILO is speaking...';
    else if (state === 'THINKING' || state === 'TOOL_USE') statusText = 'Thinking...';
    else statusText = 'Listening... Speak anytime';
  }

  return (
    <div className="voice">
      <p className="interim" aria-live="polite">{statusText}</p>
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
