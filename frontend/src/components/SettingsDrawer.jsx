import { useEffect, useState, useRef } from 'react';

export default function SettingsDrawer({ prefs, setPrefs, support }) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState([]);
  
  useEffect(() => {
    if (!support.tts) return;
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [support.tts]);

  const previewVoice = () => {
    if (!support.tts) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("This is what I sound like.");
    const v = voices.find(x => x.voiceURI === prefs.voice);
    if (v) u.voice = v;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    window.speechSynthesis.speak(u);
  };

  const update = (k, v) => setPrefs(p => ({ ...p, [k]: v }));

  return (
    <>
      <button className="ghost settings-btn" onClick={() => setOpen(true)} aria-label="Open settings">
        Settings
      </button>
      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Voice Settings</h2>
              <button className="ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
            
            <label className="drawer-row">
              <span>Voice</span>
              <select value={prefs.voice || ''} onChange={e => update('voice', e.target.value)}>
                <option value="">Default Voice</option>
                {voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
              </select>
            </label>

            <label className="drawer-row">
              <span>Speed ({prefs.rate.toFixed(1)}x)</span>
              <input type="range" min="0.5" max="2.0" step="0.1" value={prefs.rate} 
                onChange={e => update('rate', parseFloat(e.target.value))} />
            </label>

            <label className="drawer-row">
              <span>Pitch ({prefs.pitch.toFixed(1)})</span>
              <input type="range" min="0.5" max="1.5" step="0.1" value={prefs.pitch} 
                onChange={e => update('pitch', parseFloat(e.target.value))} />
            </label>

            <button className="ghost preview-btn" onClick={previewVoice}>Preview Voice</button>
          </div>
        </div>
      )}
    </>
  );
}
