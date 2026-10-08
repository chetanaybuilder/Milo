import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from './lib/api.js';
import { VoiceController, S } from './voice/controller.js';
import { BrowserStt } from './voice/stt/browserStt.js';
import { BrowserTts } from './voice/tts/browserTts.js';
import { LevelMeter } from './voice/audio/levelMeter.js';

export const NOTICES = {
  'mic-denied': 'Microphone access is required for voice interaction.',
  'mic-unavailable': 'No working microphone was found.',
  unsupported: 'Voice input is not supported in this browser. Try Chrome, Edge or Safari, or type instead.',
  network: 'Speech recognition lost its connection. Try again.',
};

export function useMilo(prefs) {
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState(S.IDLE);
  const [tool, setTool] = useState(null);
  const [live, setLive] = useState(false);
  const [interim, setInterim] = useState('');
  const [notice, setNotice] = useState('');
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const abortRef = useRef(null);
  const reqRef = useRef(0);
  const sendRef = useRef(() => {});

  const [voice] = useState(() => new VoiceController({
    stt: new BrowserStt(), tts: new BrowserTts(prefs), meter: new LevelMeter(),
    on: {
      state: setState,
      interim: setInterim,
      live: setLive,
      final: (t) => sendRef.current(t),
      barge: () => { abortRef.current?.abort(); reqRef.current++; setTool(null); },
      error: (code) => setNotice(NOTICES[code] || ''),
    },
  }));

  useEffect(() => { voice.tts.setOptions(prefs); }, [prefs, voice]);
  useEffect(() => () => { voice.stopLive(); abortRef.current?.abort(); }, [voice]);

  const send = useCallback(async (raw) => {
    const text = raw.trim().slice(0, 2000);
    if (!text) return;
    // Mark that user has interacted (skip greeting if Go Live comes later)
    voice._hasUserInput = true;
    abortRef.current?.abort();
    voice.cancelSpeech();
    const id = ++reqRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const t0 = performance.now();
    let t1 = null;
    const history = messagesRef.current.filter((m) => m.text && !m.error)
      .map((m) => ({ role: m.role, content: m.text }));
    const aid = `a${id}`;
    setNotice('');
    setMessages((m) => [...m, { id: `u${id}`, role: 'user', text },
      { id: aid, role: 'assistant', text: '', streaming: true }]);
    const patch = (p) => setMessages((m) => m.map((x) => (x.id === aid ? { ...x, ...p } : x)));
    voice.beginResponse();
    setTool(null);

    let full = '', buf = '', failed = false, firstToken = true;
    const say = (s) => { if (s.trim()) voice.speak(s); };
    const flush = (force) => {
      let m;
      while ((m = buf.match(/[.!?\n]\s/))) {
        say(buf.slice(0, m.index + 1));
        buf = buf.slice(m.index + 1);
      }
      if (force && buf.trim()) { say(buf); buf = ''; }
    };

    try {
      await streamChat(text, history, ac.signal, (ev) => {
        if (id !== reqRef.current) return;
        if (ev.type === 'tool') { setTool(ev.tool); voice.setState(S.TOOL_USE); }
        else if (ev.type === 'sources') patch({ sources: ev.data });
        else if (ev.type === 'weather') patch({ weather: ev.data });
        else if (ev.type === 'token') {
          // Notify controller of first real token (cancels filler, prevents delay)
          if (firstToken) {
            firstToken = false;
            t1 = performance.now();
            voice.notifyFirstToken();
          }
          if (voice.state === S.TOOL_USE) voice.setState(S.THINKING);
          setTool(null);
          full += ev.text; buf += ev.text;
          patch({ text: full });
          flush(false);
        } else if (ev.type === 'error') {
          failed = true;
          patch({ text: ev.message, error: true });
          voice.setError(ev.message);
        }
      });
    } catch (e) {
      if (ac.signal.aborted || id !== reqRef.current) return;
      failed = true;
      patch({ text: "Milo's brain is temporarily unavailable.", error: true, streaming: false });
      voice.setError('request');
    }
    if (id !== reqRef.current) return;
    setTool(null);
    const t2 = performance.now();
    const total = t2 - t0;
    if (total > 2000 && t1) {
      console.log(`Latency breakdown: t0->t1: ${(t1 - t0).toFixed(0)}ms, t1->t2: ${(t2 - t1).toFixed(0)}ms, total: ${total.toFixed(0)}ms`);
    }
    patch({ streaming: false, latency: total });
    if (!failed) flush(true);
    voice.endResponse();
  }, [voice]);
  sendRef.current = send;

  const toggleLive = useCallback(() => (live ? voice.stopLive() : voice.startLive()), [live, voice]);
  const getLevel = useCallback(() => voice.getLevel(), [voice]);

  return { messages, state, tool, live, interim, notice, send, toggleLive, getLevel, support: voice.support };
}
