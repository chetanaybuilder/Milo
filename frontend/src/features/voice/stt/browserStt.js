import { Stt } from './base.js';

export class BrowserStt extends Stt {
  constructor({ lang } = {}) {
    super();
    this.SR =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;
    this.supported = !!this.SR;
    const systemLang =
      (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) ||
      'en-US';
    this.lang = lang || systemLang;
    this.rec = null;
    this.active = false;
    this._restartTimer = null;
    this._networkErrorCount = 0;
    this._sessionSeq = 0;
    this._currentSessionId = 0;
  }

  /**
   * Helper to detect iOS Safari / WebKit which has strict audio session requirements.
   */
  _isIOS() {
    if (typeof navigator === 'undefined') return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  _isMobile() {
    if (typeof navigator === 'undefined') return false;
    return this._isIOS() || /Android/i.test(navigator.userAgent);
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

    // Bump session sequence to invalidate any stale pending callbacks
    const sessionId = ++this._sessionSeq;
    this._currentSessionId = sessionId;

    // Clean up previous instance and detach all callbacks so stale abort/end events are ignored
    if (this.rec) {
      const prev = this.rec;
      this.rec = null;
      prev.onstart = null;
      prev.onspeechstart = null;
      prev.onspeechend = null;
      prev.onresult = null;
      prev.onerror = null;
      prev.onend = null;
      try {
        prev.abort();
      } catch {}
    }

    try {
      const r = new this.SR();
      r.lang = this.lang;

      // iOS Safari and mobile WebViews require continuous = false; desktop browsers handle continuous = true
      const isMobile = this._isMobile();
      r.continuous = !isMobile;
      r.interimResults = true;
      r.maxAlternatives = 1;

      r.onstart = () => {
        if (this._currentSessionId !== sessionId || !this.active) return;
        this._networkErrorCount = 0;
      };

      r.onresult = (e) => {
        if (this._currentSessionId !== sessionId || !this.active) return;
        this._networkErrorCount = 0;

        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            if (text.trim()) this.onFinal(text.trim());
          } else {
            interim += text;
          }
        }
        if (interim.trim()) {
          this.onInterim(interim.trim());
        }
      };

      r.onerror = (e) => {
        if (this._currentSessionId !== sessionId || !this.active) return;
        const err = e?.error || '';

        // Ignore harmless expected errors
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

        console.warn('[BrowserStt] SpeechRecognition warning:', err);
      };

      r.onend = () => {
        // Discard if this onend belongs to a past session
        if (this._currentSessionId !== sessionId) return;
        this.rec = null;

        if (this.active) {
          // Restart recognition session automatically with adaptive backoff
          const baseDelay = this._isIOS() ? 200 : 90;
          const delay =
            this._networkErrorCount > 0
              ? Math.min(350 * Math.pow(1.5, this._networkErrorCount), 2000) + Math.random() * 80
              : baseDelay;

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
      console.warn('[BrowserStt] SpeechRecognition start failed:', err.message);
      this.rec = null;
      if (this.active) {
        clearTimeout(this._restartTimer);
        const retryDelay = this._isIOS() ? 300 : 180;
        this._restartTimer = setTimeout(() => {
          if (this.active) this._start();
        }, retryDelay);
      }
    }
  }

  stop() {
    this.active = false;
    this._currentSessionId = ++this._sessionSeq; // Invalidate any incoming callbacks
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
      try {
        r.abort();
      } catch {}
    }
    this.onEnd();
  }
}
