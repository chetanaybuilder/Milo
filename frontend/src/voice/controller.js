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
  delayMs: 900,
  phrases: ["Mm-hm.", "Right.", "Okay.", "Let me think."],
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
    this.errTimer = null;
    this._greeted = false;         // true after greeting has been spoken
    this._hasUserInput = false;    // true if user has already typed or spoken
    this._fillerTimer = null;      // backchannel timeout id
    this._lastFiller = '';         // avoid repeating the same filler
    this._fillerThisTurn = false;  // max one filler per turn
    this._firstTokenArrived = false;

    stt.onInterim = (t) => {
      if (!this.live) return;
      this._hasUserInput = true;
      if (this.state === S.SPEAKING) {
        if (this.isEcho(t) || norm(t).length < 2) return;
        this.bargeIn();
      }
      this.on.interim?.(t);
    };
    stt.onFinal = (t) => {
      if (!this.live) return;
      this._hasUserInput = true;
      if (this.state === S.SPEAKING) {
        if (this.isEcho(t)) return;
        this.bargeIn();
      }
      this.on.interim?.('');
      this.on.final?.(t);
      this._scheduleFiller(t);
    };
    stt.onError = (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') this.fail('mic-denied');
      else if (code === 'audio-capture') this.fail('mic-unavailable');
      else if (code === 'network') this.setError('network');
    };
    stt.onEnd = () => {
      // Browsers end recognition sessions on their own; keep Live Mode going.
      if (this.live) setTimeout(() => { if (this.live) this.stt.start(); }, 200);
    };
  }

  get support() { return { stt: this.stt.supported, tts: this.tts.supported }; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.on.state?.(s);
  }

  isEcho(t) { const n = norm(t); return n.length > 0 && this.spoken.includes(n); }

  async startLive() {
    if (!this.stt.supported) { this.on.error?.('unsupported'); return false; }
    try { await this.meter.start(); }
    catch (e) { this.on.error?.(e?.name === 'NotAllowedError' ? 'mic-denied' : 'mic-unavailable'); return false; }
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
    // Add greeting to echo filter so MILO doesn't hear itself
    this.spoken = (this.spoken + ' ' + norm(GREETING_TEXT)).slice(-500);
    this.tts.speak(GREETING_TEXT, {
      onStart: () => { if (gen === this.gen) this.setState(S.SPEAKING); },
      onBoundary: () => { if (gen === this.gen) this.pulse = 1; },
      onEnd: () => {
        if (gen === this.gen) {
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
    this.spoken = (this.spoken + ' ' + norm(text)).slice(-500);
    this.tts.speak(text, {
      onStart: () => { if (gen === this.gen) this.setState(S.SPEAKING); },
      onBoundary: () => { if (gen === this.gen) this.pulse = 1; },
      onEnd: () => { if (gen === this.gen) { this.pending--; this.maybeFinish(); } },
    });
  }

  cancelSpeech() { this.gen++; this.pending = 0; this.tts.cancel(); }

  bargeIn() {
    this.cancelSpeech();
    this._cancelFiller();
    this.on.barge?.();          // lets the app abort the in-flight response
    this.responding = false;
    this.setState(S.LISTENING);
  }

  getLevel() {
    if (this.state === S.SPEAKING) { this.pulse *= 0.93; return 0.12 + this.pulse * 0.7; }
    if (this.state === S.LISTENING) return this.meter.read();
    return 0;
  }

  // ---- Natural backchannel ("mm-hm", "right") ----
  _scheduleFiller(transcript) {
    this._cancelFiller();
    if (!FILLER_CONFIG.enabled) return;
    const words = transcript.trim().split(/\s+/).length;
    if (words < FILLER_CONFIG.minWords) return;

    this._fillerTimer = setTimeout(() => {
      this._fillerTimer = null;
      // Skip if first real token already arrived, or already used filler this turn,
      // or we're in a tool-use state (weather/search has its own status)
      if (this._firstTokenArrived) return;
      if (this._fillerThisTurn) return;
      if (this.state === S.TOOL_USE) return;
      if (this.state !== S.THINKING) return;

      // Pick a random filler, avoid repeating the previous one
      const pool = FILLER_CONFIG.phrases.filter((p) => p !== this._lastFiller);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      this._lastFiller = pick;
      this._fillerThisTurn = true;

      // Add filler to echo filter so it can't trigger barge-in
      this.spoken = (this.spoken + ' ' + norm(pick)).slice(-500);

      const gen = this.gen;
      this.pending++;
      this.tts.speak(pick, {
        onStart: () => { if (gen === this.gen) this.setState(S.SPEAKING); },
        onBoundary: () => {},
        onEnd: () => {
          if (gen !== this.gen) return;
          this.pending--;
          // Return to THINKING if the real response hasn't arrived
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
