import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../services/api.js';
import { VoiceController, S } from '../features/voice/controller.js';
import { BrowserStt } from '../features/voice/stt/browserStt.js';
import { BrowserTts } from '../features/voice/tts/browserTts.js';
import { LevelMeter } from '../features/voice/audio/levelMeter.js';
import { CHAT_CONFIG, NOTICES, SENTENCE_DELIMITER_RE } from '../config/constants.js';

export { NOTICES };

/**
 * Primary React orchestrator hook for MILO.
 * Coordinates conversation message history, LLM streaming, voice controller state,
 * sentence buffering for real-time text-to-speech, and barge-in interruptions.
 *
 * @param {object} prefs - User voice settings (pitch, rate, voiceURI)
 * @returns {object} MILO state and interaction handlers
 */
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

  const [voice] = useState(
    () =>
      new VoiceController({
        stt: new BrowserStt(),
        tts: new BrowserTts(prefs),
        meter: new LevelMeter(),
        on: {
          state: setState,
          interim: setInterim,
          live: setLive,
          final: (t) => sendRef.current(t),
          barge: () => {
            abortRef.current?.abort();
            reqRef.current++;
            setTool(null);
          },
          error: (code) => setNotice(NOTICES[code] || ''),
        },
      })
  );

  useEffect(() => {
    voice.tts.setOptions(prefs);
  }, [prefs, voice]);

  useEffect(
    () => () => {
      voice.stopLive();
      abortRef.current?.abort();
    },
    [voice]
  );

  /**
   * Dispatches a user query to the backend and streams the spoken/visual response.
   */
  const send = useCallback(
    async (raw) => {
      const text = raw.trim().slice(0, CHAT_CONFIG.MAX_INPUT_CHARS);
      if (!text) return;

      voice.tts.unlock?.();
      abortRef.current?.abort();
      voice.cancelSpeech();

      const id = ++reqRef.current;
      const ac = new AbortController();
      abortRef.current = ac;

      const t0 = performance.now();
      const history = messagesRef.current
        .filter((m) => m.text && !m.error)
        .map((m) => ({ role: m.role, content: m.text }));

      const aid = `a${id}`;
      setNotice('');
      setMessages((m) => [
        ...m,
        { id: `u${id}`, role: 'user', text },
        { id: aid, role: 'assistant', text: '', streaming: true },
      ]);

      const patch = (p) => setMessages((m) => m.map((x) => (x.id === aid ? { ...x, ...p } : x)));
      voice.beginResponse();
      setTool(null);

      let full = '';
      let buf = '';
      let failed = false;
      let firstToken = true;

      const say = (s) => {
        if (s.trim()) voice.speak(s);
      };

      // Flushes buffered tokens into complete sentences for natural speech prosody
      const flush = (force) => {
        let m;
        while ((m = buf.match(SENTENCE_DELIMITER_RE))) {
          say(buf.slice(0, m.index + 1));
          buf = buf.slice(m.index + 1);
        }
        if (force && buf.trim()) {
          say(buf);
        }
      };

      try {
        await streamChat(text, history, ac.signal, (ev) => {
          if (id !== reqRef.current) return;

          if (ev.type === 'tool') {
            setTool(ev.tool);
            voice.setState(S.TOOL_USE);
          } else if (ev.type === 'sources') {
            patch({ sources: ev.data });
          } else if (ev.type === 'weather') {
            patch({ weather: ev.data });
          } else if (ev.type === 'token') {
            if (firstToken) {
              firstToken = false;
              voice.notifyFirstToken();
            }
            if (voice.state === S.TOOL_USE) {
              voice.setState(S.THINKING);
            }
            setTool(null);
            full += ev.text;
            buf += ev.text;
            patch({ text: full });
            flush(false);
          } else if (ev.type === 'error') {
            failed = true;
            patch({ text: ev.message, error: true });
            voice.setError(ev.message);
          }
        });
      } catch {
        if (ac.signal.aborted || id !== reqRef.current) return;
        failed = true;
        patch({ text: "Milo's brain is temporarily unavailable.", error: true, streaming: false });
        voice.setError('request');
      }

      if (id !== reqRef.current) return;
      setTool(null);
      const t2 = performance.now();
      const totalLatency = t2 - t0;

      patch({ streaming: false, latency: totalLatency });
      if (!failed) flush(true);
      voice.endResponse();
    },
    [voice]
  );

  sendRef.current = send;

  const toggleLive = useCallback(
    () => (live ? voice.stopLive() : voice.startLive()),
    [live, voice]
  );
  const getLevel = useCallback(() => voice.getLevel(), [voice]);
  const interrupt = useCallback(() => voice.bargeIn(), [voice]);

  return {
    messages,
    state,
    tool,
    live,
    interim,
    notice,
    send,
    toggleLive,
    getLevel,
    interrupt,
    support: voice.support,
  };
}
