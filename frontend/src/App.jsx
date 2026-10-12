import { useEffect, useState } from 'react';
import { MiloCore, VoiceInterface } from './features/voice/index.js';
import { ChatInterface } from './features/chat/index.js';
import { ToolStatus } from './components/common/index.js';
import { SettingsDrawer } from './features/settings/index.js';
import { LandingPage } from './features/landing/index.js';
import { useMilo, useReducedMotion } from './hooks/index.js';
import { VOICE_CONFIG } from './config/constants.js';

/**
 * Root Application component.
 * Coordinates views (landing page vs voice assistant), user preferences, and keyboard shortcuts.
 */
export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'assistant'

  const [prefs, setPrefs] = useState(() => {
    try {
      return {
        ...VOICE_CONFIG.DEFAULT_PREFERENCES,
        ...JSON.parse(localStorage.getItem('milo_prefs')),
      };
    } catch {
      return { ...VOICE_CONFIG.DEFAULT_PREFERENCES };
    }
  });

  useEffect(() => {
    localStorage.setItem('milo_prefs', JSON.stringify(prefs));
  }, [prefs]);

  const milo = useMilo(prefs);
  const reduced = useReducedMotion();
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 900);
  const busy = ['THINKING', 'TOOL_USE', 'SPEAKING'].includes(milo.state);

  // Keyboard shortcut: Space or Escape interrupts speaking when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (milo.state !== 'SPEAKING') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        milo.interrupt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [milo]);

  const handleLaunch = () => {
    setView('assistant');
    // Scroll back to top when entering the assistant
    window.scrollTo(0, 0);
  };

  /* ── Landing page view ── */
  if (view === 'landing') {
    return <LandingPage onLaunch={handleLaunch} />;
  }

  /* ── Assistant view ── */
  return (
    <div className={`app${chatOpen ? ' chat-open' : ''}`}>
      <header>
        <h1>
          <button
            className="brand-back"
            onClick={() => setView('landing')}
            aria-label="Back to home"
            title="Back to home"
          >
            MILO
          </button>
        </h1>
        <div className="header-actions">
          <SettingsDrawer prefs={prefs} setPrefs={setPrefs} support={milo.support} />
          <button
            className="ghost"
            onClick={() => setChatOpen((o) => !o)}
            aria-expanded={chatOpen}
            aria-controls="chat-panel"
          >
            {chatOpen ? 'Hide chat' : 'Chat'}
          </button>
        </div>
      </header>
      <main>
        <MiloCore
          state={milo.state}
          getLevel={milo.getLevel}
          reduced={reduced}
          onInterrupt={milo.interrupt}
        />
        <div className="hud">
          <ToolStatus state={milo.state} tool={milo.tool} />
          <VoiceInterface
            live={milo.live}
            onToggle={milo.toggleLive}
            onInterrupt={milo.interrupt}
            interim={milo.interim}
            notice={milo.notice}
            support={milo.support}
            state={milo.state}
          />
        </div>
      </main>
      <aside id="chat-panel" className="panel" hidden={!chatOpen} aria-label="Chat">
        <ChatInterface
          messages={milo.messages}
          onSend={milo.send}
          busy={busy}
          live={milo.live}
          onToggleLive={milo.toggleLive}
          voiceState={milo.state}
        />
      </aside>
    </div>
  );
}
