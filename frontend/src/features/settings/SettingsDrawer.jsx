import { useEffect, useState } from 'react';

/**
 * SettingsDrawer modal for voice personalization.
 * Allows adjusting Web Speech Synthesis pitch, playback rate, and selecting preferred system voices.
 *
 * @param {object} props
 * @param {{ voice: string, rate: number, pitch: number }} props.prefs - Current voice preferences
 * @param {Function} props.setPrefs - State setter for preferences
 * @param {{ stt: boolean, tts: boolean }} props.support - Device API support flags
 */
export default function SettingsDrawer({ prefs, setPrefs, support }) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState([]);

  // Load available system voices asynchronously (onvoiceschanged fires as voices load in Chromium)
  useEffect(() => {
    if (!support?.tts || typeof window === 'undefined') return;

    const loadVoices = () => {
      try {
        setVoices(window.speechSynthesis.getVoices());
      } catch {
        setVoices([]);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [support?.tts]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const previewVoice = () => {
    if (!support?.tts || typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('This is what I sound like.');
      const selected = voices.find((v) => v.voiceURI === prefs.voice);
      if (selected) utterance.voice = selected;
      utterance.rate = prefs.rate;
      utterance.pitch = prefs.pitch;
      window.speechSynthesis.speak(utterance);
    } catch {}
  };

  const update = (key, value) => setPrefs((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <button
        className="ghost settings-btn"
        onClick={() => setOpen(true)}
        aria-label="Open settings"
      >
        Settings
      </button>
      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div
            className="drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Voice Settings"
          >
            <div className="drawer-header">
              <h2>Voice Settings</h2>
              <button className="ghost" onClick={() => setOpen(false)} aria-label="Close settings">
                Close
              </button>
            </div>

            <label className="drawer-row">
              <span>Voice</span>
              <select value={prefs.voice || ''} onChange={(e) => update('voice', e.target.value)}>
                <option value="">Default Voice</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="drawer-row">
              <span>Speed ({prefs.rate.toFixed(1)}x)</span>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={prefs.rate}
                onChange={(e) => update('rate', parseFloat(e.target.value))}
              />
            </label>

            <label className="drawer-row">
              <span>Pitch ({prefs.pitch.toFixed(1)})</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={prefs.pitch}
                onChange={(e) => update('pitch', parseFloat(e.target.value))}
              />
            </label>

            <button className="ghost preview-btn" onClick={previewVoice}>
              Preview Voice
            </button>
          </div>
        </div>
      )}
    </>
  );
}
