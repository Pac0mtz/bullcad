import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { loadConfig, saveConfig, isConfigured } from '../ai/config.js';
import { runAssistant } from '../ai/assistant.js';
import { planHeadline } from '../ai/summary.js';
import { IconSparkle, IconSend, IconSettings, IconImage } from './Icons.jsx';

const EXAMPLES = [
  'Draw a 24 by 16 ft room',
  'Add a 3 ft door centered on the north wall',
  'Make all exterior walls 8 inches thick',
  'How many square feet of floor are there?',
];

// Read an image file and downscale it to keep the request small/cheap while
// staying sharp enough for the model to read dimension labels.
function fileToScaledDataURL(file, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')); };
    img.src = url;
  });
}

export default function AssistantPanel() {
  const open = useStore((s) => s.aiOpen);
  const setOpen = useStore((s) => s.setAiOpen);

  const [config, setConfig] = useState(loadConfig);
  const [showSettings, setShowSettings] = useState(!isConfigured(loadConfig()));
  const [messages, setMessages] = useState([]); // {role, content, image?}
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null); // data URL of the attached photo/sketch
  const [imageName, setImageName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const listRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, status]);

  if (!open) return null;

  const ready = isConfigured(config);

  const pickImage = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ready) { setShowSettings(true); return; }
    try {
      setImage(await fileToScaledDataURL(file));
      setImageName(file.name);
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', content: String(err?.message || err) }]);
    }
  };

  const send = async (text) => {
    const userText = (text ?? input).trim();
    const img = image;
    if ((!userText && !img) || busy) return;
    if (!ready) { setShowSettings(true); return; }
    setInput(''); setImage(null); setImageName('');
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: userText || 'Trace this drawing into the plan.', image: img || undefined }]);
    setBusy(true); setStatus(img ? 'Reading the image…' : 'Thinking…');
    try {
      const { text: reply } = await runAssistant({
        userText, image: img, history, config,
        onStep: ({ tool }) => setStatus(`Running ${tool.replace(/_/g, ' ')}…`),
      });
      setMessages((m) => [...m, { role: 'assistant', content: reply || '(done)' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', content: String(e?.message || e) }]);
    } finally {
      setBusy(false); setStatus('');
    }
  };

  const saveAndClose = () => { saveConfig(config); setShowSettings(false); };
  const canSend = !busy && (!!input.trim() || !!image);

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <span className="ai-title"><IconSparkle style={{ width: 16, height: 16 }} /> AI Assistant</span>
        <div className="ai-head-actions">
          <button className="ai-icon" title="Settings" aria-label="AI settings" onClick={() => setShowSettings((v) => !v)}>
            <IconSettings style={{ width: 16, height: 16 }} />
          </button>
          <button className="ai-icon" title="Close" aria-label="Close assistant" onClick={() => setOpen(false)}>✕</button>
        </div>
      </div>

      {showSettings ? (
        <div className="ai-settings">
          <p className="ai-note">Connect an OpenAI (or compatible) API. The key is stored only in this browser and sent directly to the endpoint below. Photo/sketch import needs a vision model (e.g. gpt-4o or gpt-4o-mini).</p>
          <label>API key
            <input type="password" value={config.apiKey} placeholder="sk-…"
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} />
          </label>
          <label>Model
            <input type="text" value={config.model} placeholder="gpt-4o-mini"
              onChange={(e) => setConfig({ ...config, model: e.target.value })} />
          </label>
          <label>API base URL <span className="ai-muted">(OpenAI, Azure, or a proxy)</span>
            <input type="text" value={config.baseURL} placeholder="https://api.openai.com/v1"
              onChange={(e) => setConfig({ ...config, baseURL: e.target.value })} />
          </label>
          <div className="ai-settings-actions">
            <button className="ai-btn primary" onClick={saveAndClose} disabled={!isConfigured(config)}>Save</button>
            {isConfigured(config) && <button className="ai-btn ghost" onClick={() => setShowSettings(false)}>Cancel</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="ai-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                <p>Tell me what to build or change — I edit the plan directly. <span className="ai-muted">({planHeadline(useStore.getState())})</span></p>
                <div className="ai-examples">
                  <button className="ai-chip import" onClick={pickImage}>
                    <IconImage style={{ width: 15, height: 15 }} /> Import a photo or sketch…
                  </button>
                  {EXAMPLES.map((ex) => (
                    <button key={ex} className="ai-chip" onClick={() => send(ex)}>{ex}</button>
                  ))}
                </div>
                <p className="ai-tip ai-muted">Importing a drawing reads its dimensions to set scale, then traces walls/rooms. Cleaner, labeled drawings work best.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={'ai-msg ' + m.role}>
                {m.image && <img className="ai-msg-img" src={m.image} alt="attached drawing" />}
                {m.content}
              </div>
            ))}
            {busy && <div className="ai-msg status">{status || 'Working…'}</div>}
          </div>

          {image && (
            <div className="ai-attach">
              <img src={image} alt="attachment preview" />
              <span className="ai-attach-name">{imageName || 'image'}</span>
              <button type="button" className="ai-attach-x" onClick={() => { setImage(null); setImageName(''); }} aria-label="Remove image">✕</button>
            </div>
          )}

          <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <button type="button" className="ai-attach-btn" onClick={pickImage} disabled={busy} title="Attach a photo or sketch" aria-label="Attach image">
              <IconImage style={{ width: 18, height: 18 }} />
            </button>
            <input value={input} disabled={busy}
              placeholder={ready ? (image ? 'Add a note (optional) and send' : 'Ask, instruct, or attach a drawing…') : 'Add your API key in settings ⚙'}
              onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="ai-send" disabled={!canSend} aria-label="Send">
              <IconSend style={{ width: 18, height: 18 }} />
            </button>
          </form>
          <div className="ai-foot">Changes are undoable (Ctrl/⌘+Z). The AI can misjudge — review its edits.</div>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
    </div>
  );
}
