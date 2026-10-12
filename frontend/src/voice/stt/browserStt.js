import { Stt } from './base.js';

export class BrowserStt extends Stt {
  constructor({ lang = 'en-US' } = {}) {
    super();
    this.SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    this.supported = !!this.SR;
    this.lang = lang;
    this.rec = null;
    this.active = false;
  }

  start() {
    if (!this.supported) return;
    this.active = true;
    this._start();
  }

  _start() {
    if (!this.active) return;
    if (this.rec) {
      try { this.rec.abort(); } catch {}
      this.rec = null;
    }

    try {
      const r = new this.SR();
      r.lang = this.lang;
      r.continuous = true;
      r.interimResults = true;

      r.onresult = (e) => {
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
        if (err === 'no-speech' || err === 'aborted') return;
        if (err === 'network') {
          console.warn('SpeechRecognition network event (auto-recovering on end)');
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
          this.onError(err);
        }
      };

      r.onend = () => {
        this.rec = null;
        if (this.active) {
          setTimeout(() => {
            if (this.active) this._start();
          }, 200);
        } else {
          this.onEnd();
        }
      };

      r.start();
      this.rec = r;
    } catch {
      this.rec = null;
      if (this.active) {
        setTimeout(() => {
          if (this.active) this._start();
        }, 300);
      }
    }
  }

  stop() {
    this.active = false;
    const r = this.rec;
    this.rec = null;
    if (r) {
      r.onend = null;
      r.onerror = null;
      r.onresult = null;
      try { r.abort(); } catch {}
    }
    this.onEnd();
  }
}
