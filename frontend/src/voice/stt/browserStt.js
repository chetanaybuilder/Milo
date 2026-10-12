import { Stt } from './base.js';

export class BrowserStt extends Stt {
  constructor({ lang = 'en-US' } = {}) {
    super();
    this.SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    this.supported = !!this.SR;
    this.lang = lang;
    this.rec = null;
    this.active = false;
    this.networkErrorCount = 0;
    this._restartTimer = null;
  }

  start() {
    if (!this.supported) return;
    this.active = true;
    this.networkErrorCount = 0;
    this._startRecognition();
  }

  _startRecognition() {
    if (!this.active || this.rec) return;
    clearTimeout(this._restartTimer);

    try {
      const r = new this.SR();
      r.lang = this.lang;
      r.continuous = true;
      r.interimResults = true;

      r.onresult = (e) => {
        // Reset network error counter on any successful speech reception
        this.networkErrorCount = 0;
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0].transcript;
          if (res.isFinal) {
            if (text.trim()) this.onFinal(text.trim());
          } else {
            interim += text;
          }
        }
        if (interim.trim()) this.onInterim(interim.trim());
      };

      r.onerror = (e) => {
        const err = e?.error || '';
        // Harmless events in Web Speech API
        if (err === 'no-speech' || err === 'aborted') {
          return;
        }

        if (err === 'network') {
          this.networkErrorCount++;
          console.warn(`Speech recognition network notice (attempt ${this.networkErrorCount})`);
          // Only alert user if network fails repeatedly 4+ times without success
          if (this.networkErrorCount >= 4) {
            this.onError('network');
          }
          return;
        }

        // Fatal errors (e.g. not-allowed, audio-capture)
        this.onError(err);
      };

      r.onend = () => {
        this.rec = null;
        if (this.active) {
          // Automatic resilient restart with backoff if network issues occurred
          const delay = this.networkErrorCount > 0 ? Math.min(600 * this.networkErrorCount, 2500) : 200;
          this._restartTimer = setTimeout(() => {
            if (this.active) this._startRecognition();
          }, delay);
        } else {
          this.onEnd();
        }
      };

      r.start();
      this.rec = r;
    } catch {
      this.rec = null;
      if (this.active) {
        this._restartTimer = setTimeout(() => {
          if (this.active) this._startRecognition();
        }, 500);
      }
    }
  }

  stop() {
    this.active = false;
    clearTimeout(this._restartTimer);
    this.networkErrorCount = 0;
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    r.onend = null;
    r.onerror = null;
    r.onresult = null;
    try { r.abort(); } catch { /* ignore */ }
    this.onEnd();
  }
}
