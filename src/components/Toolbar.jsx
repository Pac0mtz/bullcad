import React from 'react';
import { useStore } from '../store.js';
import {
  IconUndo, IconRedo, IconExport, IconImport, IconNew,
  IconSun, IconMoon, IconPdf, IconSparkle,
} from './Icons.jsx';
// All tools — including Select/Pan — now live in the left "Tools" sidebar; the
// header keeps only history (undo/redo), view, and file actions.

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Toolbar({ fileRef }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const newPlan = useStore((s) => s.newPlan);
  const exportPlan = useStore((s) => s.exportPlan);
  const setExportOpen = useStore((s) => s.setExportOpen);
  const aiOpen = useStore((s) => s.aiOpen);
  const setAiOpen = useStore((s) => s.setAiOpen);

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">📐</span>
        <span className="brand-name">
          PlanForge
          <small>Wall &amp; Fence Layout</small>
        </span>
      </div>

      {/* History — tools themselves live in the left sidebar now */}
      <div className="tbar-group tools">
        <button className="tool-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <IconUndo /><span>Undo</span>
        </button>
        <button className="tool-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <IconRedo /><span>Redo</span>
        </button>
      </div>

      <div className="spacer" />

      {/* View controls: 2D/3D + theme */}
      <div className="tbar-cluster">
        <div className="mode-toggle">
          <button className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>2D</button>
          <button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>3D</button>
        </div>
        <button
          className="btn ghost icon-only"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label="Toggle color theme"
        >
          {theme === 'light' ? <IconMoon /> : <IconSun />}
        </button>
      </div>

      <button className={'btn ghost ai-toggle' + (aiOpen ? ' active' : '')} onClick={() => setAiOpen(!aiOpen)} title="AI assistant — build & edit by chat">
        <IconSparkle /> <span className="btn-label">AI</span>
      </button>

      <div className="tbar-sep" />

      {/* File actions: secondary (icon) + primary Export */}
      <div className="tbar-cluster">
        <button className="btn ghost icon-only hide-phone" onClick={() => { if (confirm('Clear the plan and start over?')) newPlan(); }} title="New / Clear plan" aria-label="New plan">
          <IconNew />
        </button>
        <button className="btn ghost icon-only hide-phone" onClick={() => fileRef.current?.click()} title="Import JSON plan" aria-label="Import plan">
          <IconImport />
        </button>
        <button className="btn ghost" onClick={() => setExportOpen(true)} title="Export a print-ready PDF (with legend)">
          <IconPdf /> <span className="btn-label">PDF</span>
        </button>
        <button className="btn" onClick={() => download('plan.json', JSON.stringify(exportPlan(), null, 2))} title="Export plan as JSON">
          <IconExport /> <span className="btn-label">Export</span>
        </button>
      </div>
    </header>
  );
}
