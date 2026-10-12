import { VOICE_CONFIG, VOICE_STATES as S } from '../../config/constants.js';

export { S };

// Timing and tuning constants from centralized configuration
const ROOM_REVERB_WINDOW_MS = VOICE_CONFIG.ROOM_REVERB_WINDOW_MS;
const MIC_RESUME_DELAY_MS = VOICE_CONFIG.MIC_RESUME_DELAY_MS;
const ERROR_RESET_DELAY_MS = VOICE_CONFIG.ERROR_RESET_DELAY_MS;
const SPOKEN_HISTORY_LIMIT = VOICE_CONFIG.SPOKEN_HISTORY_LIMIT;
const PULSE_DECAY_FACTOR = VOICE_CONFIG.PULSE_DECAY_FACTOR;

const normalizeText = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * VoiceController coordinates speech recognition (STT), speech synthesis (TTS),
 * microphone level metering, acoustic echo cancellation, and user barge-in interruptions.
 */
export class VoiceController {
  /**
   * @param {object} options
   * @param {import('./stt/base.js').Stt} options.stt - Speech recognition provider
   * @param {import('./tts/base.js').Tts} options.tts - Speech synthesis provider
   * @param {import('./audio/levelMeter.js').LevelMeter} options.meter - Audio level analyzer
   * @param {object} [options.on] - Event callback map (state, interim, final, barge, live, error)
   */
  constructor({ stt, tts, meter, on = {} }) {
    Object.assign(this, { stt, tts, meter, on });
    this.state = S.IDLE;
    this.live = false;
    this.gen = 0; // Monotonic generation counter to invalidate stale speech synthesis callbacks
    this.pending = 0; // Count of queued spoken utterances not yet finished
    this.responding = false;
    this.pulse = 0;
    this.errTimer = null;
    this._spokenHistory = '';
    this._lastSpokeAt = 0;
    this._micResumeTimer = null;

    stt.onInterim = (t) => {
      if (!this.live) return;
      // Reject interim text when not actively listening or if it matches Milo's output
      if (this.state !== S.LISTENING) return;
      if (this._isMiloEcho(t)) return;

      this.on.interim?.(t);
    };

    stt.onFinal = (t) => {
      if (!this.live) return;

      // Drop any late transcript if Milo has moved out of listening state
      if (this.state !== S.LISTENING) return;

      // Filter acoustic speaker echo of Milo's own synthesized voice
      if (this._isMiloEcho(t)) return;

      // Filter trailing acoustic room reverberation
      if (Date.now() - this._lastSpokeAt < ROOM_REVERB_WINDOW_MS && this._isMiloEcho(t)) return;

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
      // Browser ends recognition sessions; BrowserStt auto-restarts while active
    };
  }

  get support() {
    return { stt: this.stt.supported, tts: this.tts.supported };
  }

  /**
   * Determines whether recognized text matches recent assistant speech output (acoustic echo).
   * Uses fuzzy word overlap against normalized recent spoken history.
   *
   * @param {string} text - Transcript from speech recognition
   * @returns {boolean} True if text is identified as echo
   */
  _isMiloEcho(text) {
    const input = normalizeText(text);
    if (!input) return false;
    const history = normalizeText(this._spokenHistory || '');
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

  /**
   * Starts live continuous voice mode.
   * Unlocks mobile audio context and initializes microphone listening.
   */
  async startLive() {
    if (!this.stt.supported) {
      this.on.error?.('unsupported');
      this.setError('unsupported');
      return false;
    }

    // Audio unlock required within direct user tap event for iOS Safari
    this.tts.unlock?.();

    clearTimeout(this._micResumeTimer);
    this.live = true;
    this.pending = 0;
    this.responding = false;
    this.on.live?.(true);

    this.setState(S.LISTENING);
    this.stt.start();

    // Start level meter ONLY on desktop; mobile browsers lock exclusive microphone on getUserMedia
    const isIOS =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const isMobile =
      isIOS || (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent));

    if (!isMobile) {
      try {
        await this.meter.start();
      } catch (e) {
        console.warn('[VoiceController] Audio level meter failed to start:', e);
      }
    }

    return true;
  }

  /**
   * Stops live continuous voice mode and cancels any active playback.
   */
  stopLive() {
    clearTimeout(this._micResumeTimer);
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
      if (this.state === S.ERROR) {
        this.setState(this.live ? S.LISTENING : S.IDLE);
      }
    }, ERROR_RESET_DELAY_MS);
    return code;
  }

  // ---- Response lifecycle (driven by assistant streaming flow) ----

  beginResponse() {
    this.responding = true;
    clearTimeout(this._micResumeTimer);
    // Pause STT completely while Milo is thinking to prevent hearing noise/echo
    this.stt.stop();
    this.setState(S.THINKING);
  }

  notifyFirstToken() {
    // LLM response stream has begun receiving tokens
  }

  endResponse() {
    this.responding = false;
    this.maybeFinish();
  }

  maybeFinish() {
    if (this.pending <= 0 && !this.responding && this.state !== S.ERROR) {
      this.pending = 0;
      this.setState(this.live ? S.LISTENING : S.IDLE);
      if (this.live) {
        // Wait for room acoustics and speaker output to settle before opening mic
        clearTimeout(this._micResumeTimer);
        this._micResumeTimer = setTimeout(() => {
          if (this.live && this.state === S.LISTENING && this.pending <= 0 && !this.responding) {
            this.stt.start();
          }
        }, MIC_RESUME_DELAY_MS);
      }
    }
  }

  /**
   * Enqueues a sentence for text-to-speech output.
   * Pauses microphone listening while speaking to prevent self-triggering feedback.
   *
   * @param {string} text - Sentence to speak
   */
  speak(text) {
    if (!this.live || !text.trim()) return;
    const gen = this.gen;
    this.pending++;
    this._spokenHistory = ((this._spokenHistory || '') + ' ' + normalizeText(text)).slice(
      -SPOKEN_HISTORY_LIMIT
    );
    this._lastSpokeAt = Date.now();
    clearTimeout(this._micResumeTimer);

    // Stop mic while Milo is speaking so Milo never hears his own voice
    this.stt.stop();
    this.setState(S.SPEAKING);

    // Safety watchdog: ensure pending never stays stuck if speech synthesis drops onEnd event
    const wordCount = text.split(/\s+/).length;
    const timeoutMs = Math.max(5000, wordCount * 650);
    setTimeout(() => {
      if (gen === this.gen && this.pending > 0) {
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

  /**
   * User barge-in: immediately aborts active speech synthesis and backend streams,
   * transitioning state back to LISTENING.
   */
  bargeIn() {
    clearTimeout(this._micResumeTimer);
    this.cancelSpeech();
    this.on.barge?.();
    this.responding = false;
    this.pending = 0;
    this.setState(this.live ? S.LISTENING : S.IDLE);
    if (this.live) {
      this.stt.start();
    }
  }

  getLevel() {
    if (this.state === S.SPEAKING) {
      this.pulse *= PULSE_DECAY_FACTOR;
      return 0.12 + this.pulse * 0.7;
    }
    if (this.state === S.LISTENING) {
      return this.meter.read();
    }
    return 0;
  }
}
