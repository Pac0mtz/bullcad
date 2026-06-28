import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store.js';
import Toolbar from './components/Toolbar.jsx';
import LeftPanel from './components/LeftPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import Canvas2D from './components/Canvas2D.jsx';
import Scene3D from './components/Scene3D.jsx';
import ElevationCanvas from './components/ElevationCanvas.jsx';
import ExportModal from './components/ExportModal.jsx';
import PageTabs from './components/PageTabs.jsx';
import { IconCollapseLeft, IconCollapseRight, IconTools, IconSettings } from './components/Icons.jsx';

export default function App() {
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);
  const elevationTarget = useStore((s) => s.elevationTarget);
  const openElevation = useStore((s) => s.openElevation);
  const closeElevation = useStore((s) => s.closeElevation);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  const fileRef = useRef(null);
  // which side panel is open as an overlay drawer (mobile only)
  const [drawer, setDrawer] = useState(null); // 'left' | 'right' | null

  // mobile: picking a tool closes the Tools/Properties drawer so the canvas is
  // immediately usable (no extra tap to dismiss). No-op on desktop (drawer null).
  useEffect(() => { setDrawer(null); }, [tool]);
  // desktop: collapse a side panel out of view to give the canvas more room
  const [leftHidden, setLeftHidden] = useState(false);
  const [rightHidden, setRightHidden] = useState(false);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        if (useStore.getState().elevationTarget) closeElevation();
        else setTool('select');
      } else if (e.key === 'e' || e.key === 'E') {
        const sel = useStore.getState().selection;
        if (sel && (sel.type === 'wall' || sel.type === 'fence')) openElevation(sel.type, sel.id);
      } else if (e.key.startsWith('Arrow')) {
        // nudge the selected element by one grid unit
        if (useStore.getState().selection) {
          e.preventDefault();
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (d) useStore.getState().nudgeSelected(d[0], d[1]);
        }
      } else {
        // single-letter tool shortcuts (shown as badges on the tool tiles)
        const keyMap = { v: 'select', h: 'pan', w: 'wall', r: 'room', d: 'door', i: 'window', o: 'opening', f: 'fence', g: 'gate', p: 'post', m: 'measure', s: 'stairs', l: 'label', z: 'zoom' };
        const t = keyMap[e.key.toLowerCase()];
        if (t) setTool(t);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelected, setTool, openElevation, closeElevation]);

  // reflect the active theme onto <html> so CSS variables switch
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app" data-drawer={drawer || undefined}>
      <Toolbar fileRef={fileRef} />
      <div className="body" data-left-hidden={leftHidden || undefined} data-right-hidden={rightHidden || undefined}>
        {!leftHidden && <LeftPanel onCollapse={() => setLeftHidden(true)} />}
        {/* desktop-only: slim tab to re-open a hidden panel */}
        {leftHidden && (
          <button className="panel-reopen left" onClick={() => setLeftHidden(false)} title="Show tools panel" aria-label="Show tools panel">
            <IconCollapseRight />
          </button>
        )}
        <div className="canvas-wrap">
          {elevationTarget ? <ElevationCanvas /> : mode === '2d' ? <Canvas2D /> : <Scene3D />}
          {!elevationTarget && <PageTabs />}
        </div>
        {rightHidden && (
          <button className="panel-reopen right" onClick={() => setRightHidden(false)} title="Show properties panel" aria-label="Show properties panel">
            <IconCollapseLeft />
          </button>
        )}
        {!rightHidden && <RightPanel onCollapse={() => setRightHidden(true)} />}
        {/* mobile-only: dim canvas behind an open drawer */}
        <div className="drawer-backdrop" onClick={() => setDrawer(null)} />
      </div>

      {/* mobile-only: icon FAB stacked on the lower-right — Tools + Properties */}
      <div className="drawer-fab">
        <button className={'fab-btn' + (drawer === 'left' ? ' active' : '')} aria-label="Tools"
          onClick={() => setDrawer((d) => (d === 'left' ? null : 'left'))}>
          <IconTools style={{ width: 22, height: 22 }} />
        </button>
        <button className={'fab-btn' + (drawer === 'right' ? ' active' : '')} aria-label="Properties"
          onClick={() => setDrawer((d) => (d === 'right' ? null : 'right'))}>
          <IconSettings style={{ width: 22, height: 22 }} />
        </button>
      </div>

      <ExportModal />
      {/* hidden import input, triggered from Toolbar */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              useStore.getState().loadPlan(JSON.parse(reader.result));
            } catch (err) {
              alert('Could not read plan file: ' + err.message);
            }
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
