import { useEffect, useRef, useState } from 'react';
import Sources from './Sources.jsx';
import WeatherCard from './WeatherCard.jsx';

export default function ChatInterface({ messages, onSend, busy }) {
  const [text, setText] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <div className="chat">
      <ol className="log" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 && <li className="empty">Turn on Live Mode and start talking, or type below.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.role}${m.error ? ' err' : ''}`}>
            <p>{m.text || (m.streaming ? '…' : '')}</p>
            <WeatherCard data={m.weather} />
            <Sources items={m.sources} />
            {m.latency && <span className="latency">{m.latency.toFixed(0)}ms</span>}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>
      <form onSubmit={submit} className="composer">
        <label htmlFor="msg" className="sr">Message MILO</label>
        <input id="msg" value={text} maxLength={2000} autoComplete="off"
          onChange={(e) => setText(e.target.value)} placeholder="Type a message" />
        <button type="submit" disabled={!text.trim()} aria-label="Send message">Send</button>
      </form>
      {busy && <span className="sr">MILO is working</span>}
    </div>
  );
}
