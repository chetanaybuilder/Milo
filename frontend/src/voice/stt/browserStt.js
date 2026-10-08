import { Stt } from './base.js';

export class BrowserStt extends Stt {
  constructor({ lang = 'en-US' } = {}) {
    super();
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!this.SR;
    this.lang = lang;
    this.rec = null;
  }

  start() {
    if (!this.supported || this.rec) return;
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
        } else interim += text;
      }
      if (interim.trim()) this.onInterim(interim.trim());
    };
    r.onerror = (e) => this.onError(e.error);
    r.onend = () => { this.rec = null; this.onEnd(); };
    try { r.start(); this.rec = r; } catch { this.rec = null; }
  }

  stop() {
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    r.onend = null; r.onerror = null; r.onresult = null;
    try { r.abort(); } catch { /* already stopped */ }
  }
}
