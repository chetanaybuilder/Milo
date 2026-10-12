// Voice state machine: owns STT, TTS, mic meter, barge-in, greeting, backchannel.
export const S = {
  IDLE: 'IDLE', LISTENING: 'LISTENING', THINKING: 'THINKING',
  TOOL_USE: 'TOOL_USE', SPEAKING: 'SPEAKING', ERROR: 'ERROR',
};
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// ---- Premium greeting (spoken once on first "Go live") ----
export const GREETING_TEXT = "Hey sir, how can I help you today?";

// ---- Natural backchannel config (disabled to prevent audio feedback) ----
export const FILLER_CONFIG = {
  enabled: false,
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
    this.errTimer = null;
    this._greeted = false;         // true after greeting has been spoken
    this._hasUserInput = false;    // true if user has already typed or spoken

    stt.onInterim = (t) => {
      if (!this.live) return;
      this._hasUserInput = true;

      // If user speaks while MILO is speaking, allow barge-in
      if (this.state === S.SPEAKING) {
        if (norm(t).length >= 5) {
          this.bargeIn();
        } else {
          return;
        }
      }

      this.on.interim?.(t);
    };

    stt.onFinal = (t) => {
      if (!this.live) return;
      this._hasUserInput = true;

      // If user speaks while MILO is speaking, allow barge-in
      if (this.state === S.SPEAKING) {
        this.bargeIn();
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

    try {
      await this.meter.start();
    } catch (e) {
      const code = e?.name === 'NotAllowedError' ? 'mic-denied' : 'mic-unavailable';
      this.on.error?.(code);
      this.setError(code);
      return false;
    }

    this.live = true;
    this.on.live?.(true);

    // Speak greeting first if first time, then start listening
    if (!this._greeted && !this._hasUserInput) {
      this._greeted = true;
      this._speakGreeting(() => {
        if (this.live) {
          this.setState(S.LISTENING);
          this.stt.start();
        }
      });
    } else {
      this.setState(S.LISTENING);
      this.stt.start();
    }

    return true;
  }

  _speakGreeting(onDone) {
    const gen = this.gen;
    this.pending = 1;
    this.setState(S.SPEAKING);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (gen === this.gen) {
        this.pending = 0;
        onDone?.();
      }
    };

    // Safety watchdog: ensure callback fires even if browser speech drops onend
    setTimeout(finish, 4000);

    this.tts.speak(GREETING_TEXT, {
      onStart: () => {
        if (gen === this.gen) this.setState(S.SPEAKING);
      },
      onBoundary: () => {
        if (gen === this.gen) this.pulse = 1;
      },
      onEnd: finish,
    });
  }

  stopLive() {
    this.live = false;
    this.stt.stop();
    this.meter.stop();
    this.cancelSpeech();
    this.responding = false;
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
    this.setState(S.SPEAKING);

    this.tts.speak(text, {
      onStart: () => {
        if (gen === this.gen) this.setState(S.SPEAKING);
      },
      onBoundary: () => {
        if (gen === this.gen) this.pulse = 1;
      },
      onEnd: () => {
        if (gen === this.gen) {
          this.pending = Math.max(0, this.pending - 1);
          this.maybeFinish();
        }
      },
    });
  }

  cancelSpeech() {
    this.gen++;
    this.pending = 0;
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
