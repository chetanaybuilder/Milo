// Voice state machine: owns STT, TTS, mic meter, barge-in, echo cancellation.
export const S = {
  IDLE: 'IDLE', LISTENING: 'LISTENING', THINKING: 'THINKING',
  TOOL_USE: 'TOOL_USE', SPEAKING: 'SPEAKING', ERROR: 'ERROR',
};
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

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
    this.errTimer = null;
    this._spokenHistory = '';
    this._lastSpokeAt = 0;

    stt.onInterim = (t) => {
      if (!this.live) return;

      // If user speaks while MILO is speaking, allow barge-in only if not echoing Milo
      if (this.state === S.SPEAKING || this.pending > 0) {
        if (this._isMiloEcho(t)) {
          return;
        }
        if (norm(t).length >= 4) {
          this.bargeIn();
        } else {
          return;
        }
      }

      this.on.interim?.(t);
    };

    stt.onFinal = (t) => {
      if (!this.live) return;

      // If Milo is currently speaking, filter out echo
      if (this.state === S.SPEAKING || this.pending > 0) {
        if (this._isMiloEcho(t)) {
          console.log('[VoiceController] Filtered speaker echo:', t);
          return;
        }
        this.bargeIn();
      }

      // If speech finished very recently, filter trailing reverberation echo
      if (Date.now() - this._lastSpokeAt < 1200 && this._isMiloEcho(t)) {
        console.log('[VoiceController] Filtered trailing room echo:', t);
        return;
      }

      const text = t.trim();
      if (!text) return;

      this.on.interim?.('');
      this.on.final?.(text);
    };

    stt.onError = (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.fail('mic-denied');
      } else if (code === 'audio-capture') {
        this.fail('mic-unavailable');
      }
    };

    stt.onEnd = () => {
      // Browser ends recognition sessions; BrowserStt auto-restarts when live
    };
  }

  get support() { return { stt: this.stt.supported, tts: this.tts.supported }; }

  _isMiloEcho(text) {
    const input = norm(text);
    if (!input) return false;
    const history = norm(this._spokenHistory || '');
    if (!history) return false;
    if (history.includes(input)) return true;
    const words = input.split(' ').filter(Boolean);
    if (words.length >= 2) {
      const matchCount = words.filter((w) => history.includes(w)).length;
      if (matchCount / words.length >= 0.7) return true;
    }
    return false;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.on.state?.(s);
  }

  async startLive() {
    if (!this.stt.supported) {
      this.on.error?.('unsupported');
      this.setError('unsupported');
      return false;
    }

    this.live = true;
    this.pending = 0;
    this.responding = false;
    this.on.live?.(true);

    // Enter LISTENING state and start microphone STT immediately
    this.setState(S.LISTENING);
    this.stt.start();

    // Start level meter non-blockingly for visual animations
    try {
      await this.meter.start();
    } catch (e) {
      console.warn('[VoiceController] Audio level meter failed to start:', e);
    }

    return true;
  }

  stopLive() {
    this.live = false;
    this.stt.stop();
    this.meter.stop();
    this.cancelSpeech();
    this.responding = false;
    this.pending = 0;
    this.on.interim?.('');
    this.on.live?.(false);
    this.setState(S.IDLE);
  }

  fail(code) {
    this.stopLive();
    this.on.error?.(code);
    this.setError(code);
  }

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
    this.setState(S.THINKING);
  }

  notifyFirstToken() {
    // LLM response stream has started
  }

  endResponse() {
    this.responding = false;
    this.maybeFinish();
  }

  maybeFinish() {
    if (this.pending <= 0 && !this.responding && this.state !== S.ERROR) {
      this.pending = 0;
      this.setState(this.live ? S.LISTENING : S.IDLE);
    }
  }

  speak(text) {
    if (!this.live || !text.trim()) return;
    const gen = this.gen;
    this.pending++;
    this._spokenHistory = ((this._spokenHistory || '') + ' ' + norm(text)).slice(-1000);
    this._lastSpokeAt = Date.now();
    this.setState(S.SPEAKING);

    // Safety watchdog: ensure pending never stays stuck if speech synthesis drops onEnd
    const wordCount = text.split(/\s+/).length;
    const timeoutMs = Math.max(5000, wordCount * 650);
    setTimeout(() => {
      if (gen === this.gen && this.pending > 0) {
        console.warn('[VoiceController] Watchdog timeout resetting speech state');
        this.pending = Math.max(0, this.pending - 1);
        this.maybeFinish();
      }
    }, timeoutMs);

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
          this.pending = Math.max(0, this.pending - 1);
          this.maybeFinish();
        }
      },
    });
  }

  cancelSpeech() {
    this.gen++;
    this.pending = 0;
    this._lastSpokeAt = Date.now();
    this.tts.cancel();
  }

  bargeIn() {
    this.cancelSpeech();
    this.on.barge?.();
    this.responding = false;
    this.setState(S.LISTENING);
  }

  getLevel() {
    if (this.state === S.SPEAKING) {
      this.pulse *= 0.93;
      return 0.12 + this.pulse * 0.7;
    }
    if (this.state === S.LISTENING) {
      return this.meter.read();
    }
    return 0;
  }
}
