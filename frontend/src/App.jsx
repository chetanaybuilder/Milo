import { useEffect, useState } from 'react';
import MiloCore from './components/MiloCore.jsx';
import VoiceInterface from './components/VoiceInterface.jsx';
import ChatInterface from './components/ChatInterface.jsx';
import ToolStatus from './components/ToolStatus.jsx';
import { useMilo } from './useMilo.js';
import SettingsDrawer from './components/SettingsDrawer.jsx';

function useReducedMotion() {
  const [r, setR] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = (e) => setR(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return r;
}

export default function App() {
  const [prefs, setPrefs] = useState(() => {
    try { return { voice: '', rate: 1.0, pitch: 1.0, ...JSON.parse(localStorage.getItem('milo_prefs')) }; }
    catch { return { voice: '', rate: 1.0, pitch: 1.0 }; }
  });
  useEffect(() => { localStorage.setItem('milo_prefs', JSON.stringify(prefs)); }, [prefs]);

  const milo = useMilo(prefs);
  const reduced = useReducedMotion();
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 900);
  const busy = ['THINKING', 'TOOL_USE', 'SPEAKING'].includes(milo.state);

  return (
    <div className={`app${chatOpen ? ' chat-open' : ''}`}>
      <header>
        <h1>MILO</h1>
        <div className="header-actions">
          <SettingsDrawer prefs={prefs} setPrefs={setPrefs} support={milo.support} />
          <button className="ghost" onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen} aria-controls="chat-panel">
            {chatOpen ? 'Hide chat' : 'Chat'}
          </button>
        </div>
      </header>
      <main>
        <MiloCore state={milo.state} getLevel={milo.getLevel} reduced={reduced} />
        <div className="hud">
          <ToolStatus state={milo.state} tool={milo.tool} />
          <VoiceInterface live={milo.live} onToggle={milo.toggleLive} interim={milo.interim}
            notice={milo.notice} support={milo.support} />
        </div>
      </main>
      <aside id="chat-panel" className="panel" hidden={!chatOpen} aria-label="Chat">
        <ChatInterface messages={milo.messages} onSend={milo.send} busy={busy} />
      </aside>
    </div>
  );
}
