import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { loadConfig, saveConfig, isConfigured } from '../ai/config.js';
import { runAssistant } from '../ai/assistant.js';
import { planHeadline } from '../ai/summary.js';
import { IconSparkle, IconSend, IconSettings } from './Icons.jsx';

const EXAMPLES = [
  'Draw a 24 by 16 ft room',
  'Add a 3 ft door centered on the north wall',
  'Make all exterior walls 8 inches thick',
  'How many square feet of floor are there?',
];

export default function AssistantPanel() {
  const open = useStore((s) => s.aiOpen);
  const setOpen = useStore((s) => s.setAiOpen);

  const [config, setConfig] = useState(loadConfig);
  const [showSettings, setShowSettings] = useState(!isConfigured(loadConfig()));
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant'|'error', content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, status]);

  if (!open) return null;

  const ready = isConfigured(config);

  const send = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || busy) return;
    if (!ready) { setShowSettings(true); return; }
    setInput('');
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    setMessages((m) => [...m, { role: 'user', content: userText }]);
    setBusy(true); setStatus('Thinking…');
    try {
      const { text: reply } = await runAssistant({
        userText, history, config,
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
          <p className="ai-note">Connect an OpenAI (or compatible) API. The key is stored only in this browser and sent directly to the endpoint below.</p>
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
                  {EXAMPLES.map((ex) => (
                    <button key={ex} className="ai-chip" onClick={() => send(ex)}>{ex}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={'ai-msg ' + m.role}>{m.content}</div>
            ))}
            {busy && <div className="ai-msg status">{status || 'Working…'}</div>}
          </div>

          <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={input} placeholder={ready ? 'Ask or instruct…' : 'Add your API key in settings ⚙'} disabled={busy}
              onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="ai-send" disabled={busy || !input.trim()} aria-label="Send">
              <IconSend style={{ width: 18, height: 18 }} />
            </button>
          </form>
          <div className="ai-foot">Changes are undoable (Ctrl/⌘+Z). The AI can misjudge — review its edits.</div>
        </>
      )}
    </div>
  );
}
