import React, { useState } from 'react';
import { useStore } from '../store.js';
import { exportPlanPDF } from '../utils/exportPdf.js';
import { capture3DViews, has3DView } from '../utils/scene3d.js';
import { dist, formatFeetInches, FENCE_TYPES } from '../utils/geometry.js';

const PAPERS = [
  { id: 'letter', label: 'Letter (8.5×11")' },
  { id: 'legal', label: 'Legal (8.5×14")' },
  { id: 'tabloid', label: 'Tabloid (11×17")' },
  { id: 'a4', label: 'A4 (210×297mm)' },
  { id: 'a3', label: 'A3 (297×420mm)' },
];

export default function ExportModal() {
  const open = useStore((s) => s.exportOpen);
  const setOpen = useStore((s) => s.setExportOpen);
  const storeDimMode = useStore((s) => s.dimMode);
  const dimOffset = useStore((s) => s.dimOffset);
  const mode = useStore((s) => s.mode);
  const walls = useStore((s) => s.walls);
  const fences = useStore((s) => s.fences);

  const [title, setTitle] = useState('PlanForge Plan');
  const [fileName, setFileName] = useState('planforge-plan');
  const [paper, setPaper] = useState('letter');
  const [orientation, setOrientation] = useState('landscape');
  const [includeLegend, setIncludeLegend] = useState(true);
  const [include3D, setInclude3D] = useState(true);
  const [dimMode, setDimMode] = useState(storeDimMode);
  const [dimUnit, setDimUnit] = useState('ftin'); // 'ftin' | 'in'
  const [elevSel, setElevSel] = useState([]); // [{type,id}]
  const [busy, setBusy] = useState(false);

  const elevKey = (t, id) => t + ':' + id;
  const elevOn = (t, id) => elevSel.some((e) => e.type === t && e.id === id);
  const toggleElev = (t, id) => setElevSel((prev) => elevOn(t, id) ? prev.filter((e) => !(e.type === t && e.id === id)) : [...prev, { type: t, id }]);
  const elevOptions = [
    ...walls.map((w, i) => ({ type: 'wall', id: w.id, label: `Wall ${i + 1} — ${formatFeetInches(dist(w.a, w.b))}` })),
    ...fences.map((f, i) => ({ type: 'fence', id: f.id, label: `Fence ${i + 1} — ${formatFeetInches(dist(f.a, f.b))} · ${(FENCE_TYPES[f.fenceType] || {}).label || ''}` })),
  ];

  if (!open) return null;
  const canCapture3D = mode === '3d' && has3DView();

  const close = () => { if (!busy) setOpen(false); };

  const doExport = async () => {
    const s = useStore.getState();
    setBusy(true);
    try {
      const views3d = include3D && canCapture3D ? capture3DViews() : [];
      await exportPlanPDF(
        { walls: s.walls, openings: s.openings, fences: s.fences, gates: s.gates, labels: s.labels, stairs: s.stairs, roomNames: s.roomNames, roomLabelPos: s.roomLabelPos, equips: s.equips, roomAffected: s.roomAffected, regions: s.regions },
        { title, fileName, paper, orientation, includeLegend, dimMode, dimUnit: dimUnit === 'in' ? 'in' : undefined, dimOffset, wallJustify: s.wallJustify, fenceJustify: s.fenceJustify, showRoomAreas: s.showRoomAreas, roomLabelSize: s.roomLabelSize, views3d, elevations: elevSel },
      );
      setOpen(false);
    } catch (err) {
      alert('PDF export failed: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export PDF</h2>
          <button className="modal-x" onClick={close} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>File name</label>
            <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          </div>

          <div className="row2">
            <div className="field">
              <label>Paper size</label>
              <select value={paper} onChange={(e) => setPaper(e.target.value)}>
                {PAPERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Orientation</label>
              <select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
          </div>

          <div className="row2">
            <div className="field">
              <label>Dimensions on drawing</label>
              <select value={dimMode} onChange={(e) => setDimMode(e.target.value)}>
                <option value="off">Off</option>
                <option value="centerline">Centerline</option>
                <option value="interior">Interior (clear)</option>
                <option value="exterior">Exterior (overall)</option>
                <option value="both">Interior + Exterior</option>
              </select>
            </div>
            <div className="field" style={{ opacity: dimMode === 'off' ? 0.45 : 1 }}>
              <label>Units</label>
              <select value={dimUnit} disabled={dimMode === 'off'} onChange={(e) => setDimUnit(e.target.value)}>
                <option value="ftin">Feet &amp; inches (1' 9 1/2")</option>
                <option value="in">Inches only (21 1/2")</option>
              </select>
            </div>
          </div>

          <label className="modal-check">
            <input type="checkbox" checked={includeLegend} onChange={(e) => setIncludeLegend(e.target.checked)} />
            Include legend / quantities block
          </label>
          <label className="modal-check" style={{ opacity: canCapture3D ? 1 : 0.55 }}>
            <input type="checkbox" checked={include3D && canCapture3D} disabled={!canCapture3D}
              onChange={(e) => setInclude3D(e.target.checked)} />
            Add 3D views page
          </label>
          {!canCapture3D && (
            <p className="empty-note" style={{ margin: '4px 0 0 24px' }}>
              Switch to <b>3D</b> mode first to include rendered 3D views.
            </p>
          )}

          {elevOptions.length > 0 && (
            <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Elevations page</span>
                <a style={{ fontWeight: 600, color: 'var(--blue)', cursor: 'pointer' }}
                  onClick={() => setElevSel(elevSel.length === elevOptions.length ? [] : elevOptions.map((o) => ({ type: o.type, id: o.id })))}>
                  {elevSel.length === elevOptions.length ? 'Clear all' : 'Select all'}
                </a>
              </label>
              <div style={{ maxHeight: 132, overflowY: 'auto', border: '1px solid var(--slate-200)', borderRadius: 8, padding: '6px 10px' }}>
                {elevOptions.map((o) => (
                  <label key={elevKey(o.type, o.id)} className="modal-check" style={{ margin: '3px 0' }}>
                    <input type="checkbox" checked={elevOn(o.type, o.id)} onChange={() => toggleElev(o.type, o.id)} />
                    {o.label}
                  </label>
                ))}
              </div>
              {elevSel.length > 0 && <p className="empty-note" style={{ margin: '4px 0 0' }}>{elevSel.length} elevation{elevSel.length > 1 ? 's' : ''} will be added on their own page.</p>}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" style={{ background: 'var(--slate-bg)', color: 'var(--navy)' }} onClick={close} disabled={busy}>Cancel</button>
          <button className="btn" onClick={doExport} disabled={busy}>{busy ? 'Generating…' : 'Export PDF'}</button>
        </div>
      </div>
    </div>
  );
}
