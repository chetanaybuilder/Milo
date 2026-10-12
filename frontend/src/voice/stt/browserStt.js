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
      // In Chromium, continuous: false prevents the Google Speech server from timing out on silence
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;

      r.onresult = (e) => {
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
        // Harmless browser lifecycle events
        if (err === 'no-speech' || err === 'aborted') {
          return;
        }

        if (err === 'network') {
          this.networkErrorCount++;
          // Silent retry in background - do not disrupt the UI
          return;
        }

        // Only propagate fatal device/permission errors
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
          this.onError(err);
        }
      };

      r.onend = () => {
        this.rec = null;
        if (this.active) {
          // Seamlessly restart for phrase-by-phrase natural conversation
          const delay = this.networkErrorCount > 0 ? Math.min(300 * this.networkErrorCount, 1200) : 80;
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
        }, 200);
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
