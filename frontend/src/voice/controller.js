// Voice state machine: owns STT, TTS, mic meter, barge-in, greeting, backchannel.
export const S = {
  IDLE: 'IDLE', LISTENING: 'LISTENING', THINKING: 'THINKING',
  TOOL_USE: 'TOOL_USE', SPEAKING: 'SPEAKING', ERROR: 'ERROR',
};
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// ---- Premium greeting (spoken once on first "Go live") ----
export const GREETING_TEXT = "Hey sir, how can I help you today?";

// ---- Natural backchannel config ----
export const FILLER_CONFIG = {
  enabled: true,
  delayMs: 1100,
  phrases: ["Right.", "Okay.", "Let me check."],
  minWords: 4,          // skip filler for short utterances
};

export class VoiceController {
  // on: { state, interim, final, barge, live, error }
  constructor({ stt, tts, meter, on = {} }) {
    Object.assign(this, { stt, tts, meter, on });
    this.state = S.IDLE;
    this.live = false;
    this.gen = 0;          // bumps on cancel so stale TTS callbacks are ignored
    this.pending = 0;      // queued utterances not yet finished
    this.responding = false;
    this.pulse = 0;
    this.spoken = '';      // recent MILO speech, used to ignore its own echo
    this._lastSpokeAt = 0; // timestamp when MILO finished speaking
    this.errTimer = null;
    this._greeted = false;         // true after greeting has been spoken
    this._hasUserInput = false;    // true if user has already typed or spoken
    this._fillerTimer = null;      // backchannel timeout id
    this._lastFiller = '';         // avoid repeating the same filler
    this._fillerThisTurn = false;  // max one filler per turn
    this._firstTokenArrived = false;

    stt.onInterim = (t) => {
      if (!this.live) return;
      const now = Date.now();
      // Drop audio while MILO is speaking or within 900ms after speech ends (acoustic echo window)
      if (this.pending > 0 || (now - this._lastSpokeAt) < 900) {
        return;
      }
      if (this.isEcho(t) || norm(t).length < 2) return;
      this._hasUserInput = true;
      this.on.interim?.(t);
    };

    stt.onFinal = (t) => {
      if (!this.live) return;
      const now = Date.now();
      // Drop audio while MILO is speaking or within 900ms after speech ends (acoustic echo window)
      if (this.pending > 0 || (now - this._lastSpokeAt) < 900) {
        return;
      }
      if (this.isEcho(t)) {
        return;
      }
      this._hasUserInput = true;
      this.on.interim?.('');
      this.on.final?.(t);
      this._scheduleFiller(t);
    };

    stt.onError = (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.fail('mic-denied');
      } else if (code === 'audio-capture') {
        this.fail('mic-unavailable');
      }
    };

    stt.onEnd = () => {
      // Browser ends recognition sessions; keep Live Mode going cleanly
      if (this.live && !this.stt.rec) {
        setTimeout(() => { if (this.live) this.stt.start(); }, 250);
      }
    };
  }

  get support() { return { stt: this.stt.supported, tts: this.tts.supported }; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.on.state?.(s);
  }

  isEcho(t) {
    const n = norm(t);
    if (!n) return true;
    if (this.spoken.includes(n)) return true;
    const words = n.split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return true;
    let matchCount = 0;
    for (const w of words) {
      if (this.spoken.includes(w)) matchCount++;
    }
    // If 50%+ of words match recent spoken text, it's an echo from speakers
    return (matchCount / words.length) >= 0.5;
  }

  async startLive() {
    if (!this.stt.supported) {
      this.on.error?.('unsupported');
      this.setError('unsupported');
      return false;
    }
    try {
      await this.meter.start();
    } catch (e) {
      const code = e?.name === 'NotAllowedError' ? 'mic-denied' : 'mic-unavailable';
      this.on.error?.(code);
      this.setError(code);
      return false;
    }
    this.live = true;
    this.stt.start();
    this.on.live?.(true);
    if (this.state === S.IDLE || this.state === S.ERROR) this.setState(S.LISTENING);

    // Premium greeting: speak once after mic+recognition are ready
    if (!this._greeted && !this._hasUserInput) {
      this._greeted = true;
      this._speakGreeting();
    }
    return true;
  }

  _speakGreeting() {
    const gen = this.gen;
    this.pending++;
    this._lastSpokeAt = Date.now();
    this.spoken = (this.spoken + ' ' + norm(GREETING_TEXT)).slice(-1000);
    this.tts.speak(GREETING_TEXT, {
      onStart: () => {
        if (gen === this.gen) {
          this._lastSpokeAt = Date.now();
          this.setState(S.SPEAKING);
        }
      },
      onBoundary: () => {
        if (gen === this.gen) {
          this._lastSpokeAt = Date.now();
          this.pulse = 1;
        }
      },
      onEnd: () => {
        if (gen === this.gen) {
          this._lastSpokeAt = Date.now();
          this.pending--;
          this.maybeFinish();
        }
      },
    });
  }

  stopLive() {
    this.live = false;
    this.stt.stop();
    this.meter.stop();
    this.cancelSpeech();
    this.responding = false;
    this._cancelFiller();
    this.on.interim?.('');
    this.on.live?.(false);
    this.setState(S.IDLE);
  }

  fail(code) { this.stopLive(); this.on.error?.(code); this.setError(code); }

  setError(code) {
    this.setState(S.ERROR);
    clearTimeout(this.errTimer);
    this.errTimer = setTimeout(() => {
      if (this.state === S.ERROR) this.setState(this.live ? S.LISTENING : S.IDLE);
    }, 3500);
    return code;
  }

  // ---- response lifecycle (driven by the assistant flow) ----
  beginResponse() {
    this.responding = true;
    this._firstTokenArrived = false;
    this.setState(S.THINKING);
  }

  /** Called by useMilo when the first real token arrives from the stream. */
  notifyFirstToken() {
    this._firstTokenArrived = true;
    this._cancelFiller();
  }

  endResponse() {
    this.responding = false;
    this._fillerThisTurn = false;
    this._cancelFiller();
    this.maybeFinish();
  }

  maybeFinish() {
    if (this.pending === 0 && !this.responding && this.state !== S.ERROR) {
      this.setState(this.live ? S.LISTENING : S.IDLE);
    }
  }

  speak(text) {
    if (!this.live || !text.trim()) return;
    const gen = this.gen;
    this.pending++;
    this._lastSpokeAt = Date.now();
    this.spoken = (this.spoken + ' ' + norm(text)).slice(-1000);
    this.tts.speak(text, {
      onStart: () => {
        if (gen === this.gen) {
          this._lastSpokeAt = Date.now();
          this.setState(S.SPEAKING);
        }
      },
      onBoundary: () => {
        if (gen === this.gen) {
          this._lastSpokeAt = Date.now();
          this.pulse = 1;
        }
      },
      onEnd: () => {
        if (gen === this.gen) {
          this._lastSpokeAt = Date.now();
          this.pending--;
          this.maybeFinish();
        }
      },
    });
  }

  cancelSpeech() { this.gen++; this.pending = 0; this._lastSpokeAt = Date.now(); this.tts.cancel(); }

  bargeIn() {
    this.cancelSpeech();
    this._cancelFiller();
    this.on.barge?.();
    this.responding = false;
    this.setState(S.LISTENING);
  }

  getLevel() {
    if (this.state === S.SPEAKING) { this.pulse *= 0.93; return 0.12 + this.pulse * 0.7; }
    if (this.state === S.LISTENING) return this.meter.read();
    return 0;
  }

  // ---- Natural backchannel ("Right.", "Okay.") ----
  _scheduleFiller(transcript) {
    this._cancelFiller();
    if (!FILLER_CONFIG.enabled) return;
    const words = transcript.trim().split(/\s+/).length;
    if (words < FILLER_CONFIG.minWords) return;

    this._fillerTimer = setTimeout(() => {
      this._fillerTimer = null;
      if (this._firstTokenArrived) return;
      if (this._fillerThisTurn) return;
      if (this.state === S.TOOL_USE) return;
      if (this.state !== S.THINKING) return;

      const pool = FILLER_CONFIG.phrases.filter((p) => p !== this._lastFiller);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      this._lastFiller = pick;
      this._fillerThisTurn = true;

      this.spoken = (this.spoken + ' ' + norm(pick)).slice(-1000);

      const gen = this.gen;
      this.pending++;
      this._lastSpokeAt = Date.now();
      this.tts.speak(pick, {
        onStart: () => {
          if (gen === this.gen) {
            this._lastSpokeAt = Date.now();
            this.setState(S.SPEAKING);
          }
        },
        onBoundary: () => {},
        onEnd: () => {
          if (gen !== this.gen) return;
          this._lastSpokeAt = Date.now();
          this.pending--;
          if (this.responding && this.pending === 0 && this.state !== S.ERROR) {
            this.setState(S.THINKING);
          }
          this.maybeFinish();
        },
      });
    }, FILLER_CONFIG.delayMs);
  }

  _cancelFiller() {
    if (this._fillerTimer) {
      clearTimeout(this._fillerTimer);
      this._fillerTimer = null;
    }
  }
}
