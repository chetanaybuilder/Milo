import { Tts } from './base.js';

// ---- Voice scoring ----
// Strongly prefer Edge "Online (Natural)" voices, then Google UK English Male, then any English male.
const EDGE_NATURAL = /\b(guy|ryan|christopher|eric)\b.*\bonline\b.*\bnatural\b/i;
const NATURAL_TAG  = /\b(natural|online)\b/i;
const GOOGLE_UK    = /google uk english male/i;
const MALE         = /(daniel|alex|aaron|arthur|oliver|guy|ryan|davis|christopher|eric|george|james|thomas|google uk english male|male)/i;
const FEMALE       = /(samantha|zira|susan|karen|moira|victoria|aria|jenny|hazel|female|fiona|tessa|serena)/i;
const PENALISE     = /\b(compact|espeak)\b/i;

export function pickVoice(voices, lang = 'en') {
  let best = null, bestScore = -Infinity;
  for (const v of voices) {
    let s = 0;
    if (v.lang?.toLowerCase().startsWith(lang)) s += 10; else s -= 10;
    if (EDGE_NATURAL.test(v.name))  s += 25;     // top preference: Edge Natural voices
    else if (NATURAL_TAG.test(v.name)) s += 12;   // any Natural/Online voice
    if (GOOGLE_UK.test(v.name))     s += 15;      // Google UK English Male
    if (MALE.test(v.name))          s += 6;
    if (FEMALE.test(v.name))        s -= 6;
    if (PENALISE.test(v.name))      s -= 20;      // strongly penalise low-quality voices
    if (v.localService)             s += 1;
    if (/en-(gb|us)/i.test(v.lang || '')) s += 1;
    if (s > bestScore) { best = v; bestScore = s; }
  }
  return best;
}

// ---- Text cleaning for TTS ----
// Strip markdown, URLs, emoji, and expand units for natural prosody.
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function cleanForSpeech(text) {
  let t = text;
  t = t.replace(/https?:\/\/\S+/g, '');          // URLs
  t = t.replace(/[*_#`>\[\]]/g, '');              // markdown chars
  t = EMOJI_RE[Symbol.replace](t, '');             // emoji
  t = t.replace(/°C\b/g, ' degrees Celsius');     // expand units
  t = t.replace(/°F\b/g, ' degrees Fahrenheit');
  return t.replace(/\s+/g, ' ').trim();
}

// Split into short phrases at sentence ends for natural prosody.
export function splitSentences(text) {
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export class BrowserTts extends Tts {
  constructor({ rate = 1.0, pitch = 1.0, volume = 1, voice = null } = {}) {
    super();
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.opts = { rate, pitch, volume, voice };
    this.voice = null;
    this._activeUtterances = new Set();
    if (this.supported) window.speechSynthesis.onvoiceschanged = () => { this.voice = null; };
  }

  get currentVoice() {
    if (this.opts.voice) {
       const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === this.opts.voice);
       if (v) return v;
    }
    if (!this.voice) this.voice = pickVoice(window.speechSynthesis.getVoices());
    return this.voice;
  }

  setOptions(opts) {
    this.opts = { ...this.opts, ...opts };
  }

  speak(rawText, { onStart, onBoundary, onEnd } = {}) {
    if (!this.supported) { onEnd?.(); return; }
    try { window.speechSynthesis.resume(); } catch {}
    const cleaned = cleanForSpeech(rawText);
    if (!cleaned) { onEnd?.(); return; }
    const sentences = splitSentences(cleaned);
    if (sentences.length === 0) { onEnd?.(); return; }

    sentences.forEach((sentence, i) => {
      const u = new SpeechSynthesisUtterance(sentence);
      this._activeUtterances.add(u);
      const v = this.currentVoice;
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = this.opts.rate; u.pitch = this.opts.pitch; u.volume = this.opts.volume;
      if (i === 0) u.onstart = () => onStart?.();
      u.onboundary = () => onBoundary?.();

      const cleanup = () => {
        this._activeUtterances.delete(u);
      };

      if (i === sentences.length - 1) {
        u.onend = () => { cleanup(); onEnd?.(); };
        u.onerror = () => { cleanup(); onEnd?.(); };
      } else {
        u.onend = cleanup;
        u.onerror = cleanup;
      }
      window.speechSynthesis.speak(u);
    });
  }

  cancel() {
    this._activeUtterances.clear();
    if (this.supported) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }
}
