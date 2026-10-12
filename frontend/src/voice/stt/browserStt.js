import { Stt } from './base.js';

export class BrowserStt extends Stt {
  constructor({ lang } = {}) {
    super();
    this.SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    this.supported = !!this.SR;
    const systemLang = (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || 'en-US';
    this.lang = lang || systemLang;
    this.rec = null;
    this.active = false;
    this._restartTimer = null;
    this._networkErrorCount = 0;
  }

  start() {
    if (!this.supported) return;
    this.active = true;
    this._networkErrorCount = 0;
    this._start();
  }

  _start() {
    if (!this.active) return;
    clearTimeout(this._restartTimer);

    // Clean up existing instance so its abort doesn't fire stale callbacks
    if (this.rec) {
      const prev = this.rec;
      this.rec = null;
      prev.onstart = null;
      prev.onspeechstart = null;
      prev.onspeechend = null;
      prev.onresult = null;
      prev.onerror = null;
      prev.onend = null;
      try { prev.abort(); } catch {}
    }

    try {
      const r = new this.SR();
      r.lang = this.lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;

      r.onstart = () => {
        if (this.rec !== r) return;
        console.log('[BrowserStt] Listening active (lang: ' + this.lang + ')');
      };

      r.onresult = (e) => {
        if (this.rec !== r) return;
        this._networkErrorCount = 0;
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            console.log('[BrowserStt] Final transcript:', text);
            if (text.trim()) this.onFinal(text.trim());
          } else {
            interim += text;
          }
        }
        if (interim.trim()) {
          console.log('[BrowserStt] Interim transcript:', interim);
          this.onInterim(interim.trim());
        }
      };

      r.onerror = (e) => {
        if (this.rec !== r) return;
        const err = e?.error || '';
        console.warn('[BrowserStt] SpeechRecognition error:', err);
        if (err === 'no-speech' || err === 'aborted') return;
        if (err === 'network') {
          this._networkErrorCount++;
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.onError('mic-denied');
          return;
        }
        if (err === 'audio-capture') {
          this.onError('mic-unavailable');
          return;
        }
      };

      r.onend = () => {
        if (this.rec !== r) return;
        this.rec = null;
        console.log('[BrowserStt] SpeechRecognition session ended');
        if (this.active) {
          // Restart recognition session automatically
          const delay = this._networkErrorCount > 0 ? Math.min(400 * this._networkErrorCount, 1500) : 100;
          clearTimeout(this._restartTimer);
          this._restartTimer = setTimeout(() => {
            if (this.active) this._start();
          }, delay);
        } else {
          this.onEnd();
        }
      };

      r.start();
      this.rec = r;
    } catch (err) {
      console.warn('[BrowserStt] Failed to start recognition:', err);
      this.rec = null;
      if (this.active) {
        clearTimeout(this._restartTimer);
        this._restartTimer = setTimeout(() => {
          if (this.active) this._start();
        }, 300);
      }
    }
  }

  stop() {
    this.active = false;
    clearTimeout(this._restartTimer);
    this._networkErrorCount = 0;
    const r = this.rec;
    this.rec = null;
    if (r) {
      r.onstart = null;
      r.onspeechstart = null;
      r.onspeechend = null;
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try { r.abort(); } catch {}
    }
    this.onEnd();
  }
}
