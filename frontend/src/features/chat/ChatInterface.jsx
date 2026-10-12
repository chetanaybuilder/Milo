import { useEffect, useRef, useState } from 'react';
import { CHAT_CONFIG } from '../../config/constants.js';
import Sources from './Sources.jsx';
import WeatherCard from './WeatherCard.jsx';

/**
 * Chat conversation interface component.
 * Features a 3D glass dock, animated microphone state indicator, suggestions, and real-time streaming view.
 *
 * @param {object} props
 * @param {Array} props.messages - Conversation messages history
 * @param {Function} props.onSend - Submit message callback
 * @param {boolean} [props.busy] - Backend busy processing state
 * @param {boolean} [props.live] - Live voice mode state
 * @param {Function} [props.onToggleLive] - Toggle live voice mode callback
 * @param {string} [props.voiceState] - Operational voice state (IDLE, LISTENING, etc.)
 */
export default function ChatInterface({
  messages = [],
  onSend,
  busy = false,
  live = false,
  onToggleLive,
  voiceState = 'IDLE',
}) {
  const [text, setText] = useState('');
  const end = useRef(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  const handleSuggestion = (prompt) => {
    onSend(prompt);
  };

  // State-specific mic label & class
  const normalizedState = voiceState ? voiceState.toLowerCase() : 'idle';
  const micStateLabel = live
    ? `Live Mode active (${normalizedState}). Tap to turn off.`
    : 'Turn on Live Mode';

  return (
    <div className="chat">
      <ol className="log" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 && (
          <li className="chat-empty" aria-label="Welcome to MILO">
            <div className="empty-badge">
              <span className="empty-sparkle" aria-hidden="true">
                ✦
              </span>
              <span>MILO INTELLIGENCE</span>
            </div>
            <h3>How can I help you today?</h3>
            <p className="empty-subtitle">
              Talk freely with Live Mode or choose a quick prompt to start:
            </p>
            <div className="suggestions">
              {CHAT_CONFIG.SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => handleSuggestion(s.text)}
                >
                  <span className="chip-icon" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="chip-text">{s.text}</span>
                </button>
              ))}
            </div>
          </li>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isAssistant = m.role === 'assistant';

          return (
            <li key={m.id} className={`msg ${m.role}${m.error ? ' err' : ''}`}>
              {isAssistant && (
                <div className="msg-header">
                  <div className="msg-avatar" aria-hidden="true">
                    <span className="msg-avatar-orb" />
                  </div>
                  <span className="msg-author">MILO</span>
                  {m.latency && <span className="latency-badge">{m.latency.toFixed(0)}ms</span>}
                </div>
              )}

              <div className="msg-body">
                {m.text ? (
                  <p>
                    {m.text}
                    {m.streaming && <span className="streaming-cursor" aria-hidden="true" />}
                  </p>
                ) : m.streaming ? (
                  <div className="streaming-indicator" aria-label="MILO is thinking">
                    <span className="streaming-dot" />
                    <span className="streaming-dot" />
                    <span className="streaming-dot" />
                  </div>
                ) : null}
              </div>

              {m.weather && <WeatherCard data={m.weather} />}
              {m.sources && <Sources items={m.sources} />}

              {isUser && m.latency && (
                <span className="latency-user">{m.latency.toFixed(0)}ms</span>
              )}
            </li>
          );
        })}
        <li ref={end} aria-hidden="true" className="scroll-anchor" />
      </ol>

      <form onSubmit={submit} className="composer" aria-label="Message form">
        <div className="composer-dock">
          {onToggleLive && (
            <button
              type="button"
              className={`composer-mic${live ? ' live' : ''} state-${normalizedState}`}
              onClick={onToggleLive}
              aria-label={micStateLabel}
              title={micStateLabel}
            >
              {live ? (
                <div className="mic-bars" aria-hidden="true">
                  <span className="mic-bar bar-1" />
                  <span className="mic-bar bar-2" />
                  <span className="mic-bar bar-3" />
                  <span className="mic-bar bar-4" />
                </div>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              )}
              <span className="sr">{micStateLabel}</span>
            </button>
          )}

          <div className="composer-input-wrap">
            <label htmlFor="msg" className="sr">
              Message MILO
            </label>
            <input
              id="msg"
              value={text}
              maxLength={CHAT_CONFIG.MAX_INPUT_CHARS}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              placeholder={live ? 'Listening... or type here' : 'Ask MILO anything...'}
            />
          </div>

          <button
            type="submit"
            className="send-btn"
            disabled={!text.trim()}
            aria-label="Send message"
            title="Send message (Enter)"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
            <span className="send-text">Send</span>
          </button>
        </div>
      </form>
      {busy && <span className="sr">MILO is working</span>}
    </div>
  );
}
