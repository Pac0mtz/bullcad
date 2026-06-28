import React, { useState } from 'react';
import { useStore } from '../store.js';
import { Section, PanelHead } from './ui.jsx';
import { dist, formatFeetInches, parseLength, FENCE_TYPES, WALL_PRESETS, WALL_COLORS, WALL_MATERIALS, WALL_MATERIAL_ORDER, WINDOW_STYLES, WINDOW_STYLE_ORDER, GATE_TYPES, GATE_TYPE_ORDER, PICKET_CAPS, PICKET_CAP_ORDER, SLAT_COLORS, STAIR_TYPES, STAIR_TYPE_ORDER } from '../utils/geometry.js';
import { computeQuantities, quantitiesRows } from '../utils/quantities.js';
import { IconTrash } from './Icons.jsx';
import FenceGlyph from './FenceGlyph.jsx';

// Editable wall length: type a new length and the far end (b) moves along the
// wall direction so the wall becomes exactly that length. Anchor end (a) stays.
function LengthField({ el, commitSet }) {
  const len = dist(el.a, el.b);
  const [txt, setTxt] = useState(null); // null = not editing → show formatted
  const apply = () => {
    const L = parseLength(txt);
    setTxt(null);
    if (L > 0.1) {
      const d = dist(el.a, el.b) || 1;
      commitSet({ b: { x: el.a.x + (el.b.x - el.a.x) / d * L, y: el.a.y + (el.b.y - el.a.y) / d * L } });
    }
  };
  return (
    <div className="field">
      <label>Length <span className="muted">(type to resize)</span></label>
      <input type="text" value={txt == null ? formatFeetInches(len) : txt}
        onFocus={(e) => { setTxt(len.toFixed(2)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTxt(null); e.currentTarget.blur(); } }} />
    </div>
  );
}

function Num({ label, value, onChange, step = 0.5, min = 0, max, suffix }) {
  return (
    <div className="field">
      <label>{label}{suffix ? <span className="muted"> ({suffix})</span> : null}</label>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

function ElevationButton({ type, id }) {
  const elevationTarget = useStore((s) => s.elevationTarget);
  const openElevation = useStore((s) => s.openElevation);
  const closeElevation = useStore((s) => s.closeElevation);
  const active = elevationTarget?.id === id;
  return (
    <button className="btn soft" style={{ width: '100%', marginBottom: 12, background: active ? 'var(--lib-active-bg)' : undefined }}
      onClick={() => (active ? closeElevation() : openElevation(type, id))}>
      {active ? 'Exit elevation' : '▦ Edit elevation'}
    </button>
  );
}

function SelectedProps() {
  const sel = useStore((s) => s.selection);
  const multi = useStore((s) => s.multi);
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const fences = useStore((s) => s.fences);
  const gates = useStore((s) => s.gates);
  const posts = useStore((s) => s.posts);
  const labels = useStore((s) => s.labels);
  const stairs = useStore((s) => s.stairs);
  const wallHeightDefault = useStore((s) => s.wallHeight);
  const dimOffsetDefault = useStore((s) => s.dimOffset);
  const wallJustify = useStore((s) => s.wallJustify);
  const dimMode = useStore((s) => s.dimMode);
  const setDefault = useStore((s) => s.setDefault);
  const update = useStore((s) => s.updateElement);
  const del = useStore((s) => s.deleteSelected);
  const splitWall = useStore((s) => s.splitWall);
  const applyWallStyleToAll = useStore((s) => s.applyWallStyleToAll);

  if (!sel) {
    if (multi.length > 1) {
      const counts = {};
      multi.forEach((m) => { counts[m.type] = (counts[m.type] || 0) + 1; });
      const summary = Object.entries(counts).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(', ');
      return (
        <div>
          <p className="empty-note"><b>{multi.length} items selected</b> ({summary}). Drag the box on the canvas to move them, or delete the group.</p>
          <button className="btn danger del-btn" onClick={del}><IconTrash style={{ width: 16, height: 16 }} /> Delete {multi.length}</button>
        </div>
      );
    }
    return <p className="empty-note">Nothing selected. Use the <b>Select</b> tool and click any wall, fence, door, window, gate, or label to edit it. Drag a box to select several.</p>;
  }

  const list = { wall: walls, opening: openings, fence: fences, gate: gates, post: posts, label: labels, stair: stairs }[sel.type];
  const el = list.find((e) => e.id === sel.id);
  if (!el) return <p className="empty-note">Selection no longer exists.</p>;

  const set = (patch) => update(sel.type, sel.id, patch);
  const commitSet = (patch) => update(sel.type, sel.id, patch, true);

  return (
    <div>
      {sel.type === 'wall' && (() => {
        const inches = +(el.thickness * 12).toFixed(1);
        const match = WALL_PRESETS.find((p) => Math.abs(p.inches - inches) < 0.05);
        return (
          <>
            <ElevationButton type="wall" id={el.id} />
            <LengthField el={el} commitSet={commitSet} />
            <div className="field">
              <label>Wall line on <span className="muted">(all walls)</span></label>
              <select value={wallJustify} onChange={(e) => setDefault('wallJustify', e.target.value)}>
                <option value="interior">Interior face</option>
                <option value="center">Centered</option>
                <option value="exterior">Exterior face</option>
              </select>
            </div>
            <div className="field">
              <label>This wall's face <span className="muted">(override)</span></label>
              <select value={el.justify ?? ''} onChange={(e) => commitSet({ justify: e.target.value || undefined })}>
                <option value="">Default ({wallJustify})</option>
                <option value="interior">Interior face</option>
                <option value="center">Centered</option>
                <option value="exterior">Exterior face</option>
              </select>
            </div>
            <div className="field">
              <label>Preset</label>
              <select value={match ? match.label : 'custom'} onChange={(e) => {
                const p = WALL_PRESETS.find((x) => x.label === e.target.value);
                if (p) commitSet({ thickness: p.inches / 12 });
              }}>
                {WALL_PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label} — {p.inches}″</option>)}
                {!match && <option value="custom">Custom — {inches}″</option>}
              </select>
            </div>
            <div className="row2">
              <Num label="Thickness" suffix="in" step={0.5} min={1}
                value={inches}
                onChange={(v) => commitSet({ thickness: v / 12 })} />
              <Num label="Height" suffix="ft" step={0.5} min={4}
                value={el.height ?? wallHeightDefault}
                onChange={(v) => commitSet({ height: v })} />
            </div>
            <div className="field">
              <label>Material <span className="muted">(3D finish)</span></label>
              <select value={el.material || 'drywall'} onChange={(e) => commitSet({ material: e.target.value, color: WALL_MATERIALS[e.target.value].color })}>
                {WALL_MATERIAL_ORDER.map((k) => <option key={k} value={k}>{WALL_MATERIALS[k].label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Color <span className="muted">(3D)</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {WALL_COLORS.map((c) => (
                  <span key={c} onClick={() => commitSet({ color: c })} title={c}
                    style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                      border: (el.color || '#e2e8f0') === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
                      boxShadow: (el.color || '#e2e8f0') === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '2px 0 12px' }}>
              <input type="checkbox" checked={!!el.exterior} onChange={(e) => commitSet({ exterior: e.target.checked })} />
              Exterior wall <span className="muted">(splits the takeoff)</span>
            </label>
            <div className="row2">
              <button className="btn soft" style={{ width: '100%' }}
                onClick={() => splitWall(el.id)} title="Split this wall into two at its midpoint">⊟ Split</button>
              <button className="btn soft" style={{ width: '100%' }}
                onClick={() => applyWallStyleToAll(el.id)} title="Apply this wall's thickness, height, color and material to every wall">≡ Match all</button>
            </div>
            <p className="empty-note" style={{ marginTop: 8 }}>Drag the round corner handle to move joined walls together; the amber ◆ splits off just this wall (or hold Alt).</p>

            <div className="prop-subhead">Dimensions</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '2px 0 10px' }}>
              <input type="checkbox" checked={!el.noDim} onChange={(e) => commitSet({ noDim: !e.target.checked })} />
              Show dimensions for this wall
            </label>
            {!el.noDim && (
              <>
                <div className="field">
                  <label>Lines <span className="muted">(this wall)</span></label>
                  <select value={el.dimMode ?? ''} onChange={(e) => commitSet({ dimMode: e.target.value || undefined })}>
                    <option value="">Default ({dimMode})</option>
                    <option value="centerline">Centerline</option>
                    <option value="interior">Interior (clear)</option>
                    <option value="exterior">Exterior (overall)</option>
                    <option value="both">Interior + Exterior</option>
                  </select>
                </div>
                <div className="row2">
                  <Num label="Offset" suffix="ft" step={0.25} min={0}
                    value={+(el.dimOff ?? dimOffsetDefault).toFixed(2)} onChange={(v) => commitSet({ dimOff: v })} />
                  <div className="field" style={{ justifyContent: 'flex-end' }}>
                    <label>&nbsp;</label>
                    <button className="btn soft" style={{ width: '100%' }}
                      onClick={() => commitSet({ dimOff: undefined, openDimOff: undefined, dimMode: undefined })} title="Use the global dimension defaults">Reset</button>
                  </div>
                </div>
              </>
            )}
          </>
        );
      })()}

      {sel.type === 'opening' && (
        <>
          <div className="field">
            <label>Type</label>
            <select value={el.type} onChange={(e) => commitSet({ type: e.target.value })}>
              <option value="door">Door</option>
              <option value="window">Window</option>
              <option value="opening">Opening (no door)</option>
            </select>
          </div>
          <Num label="Width" suffix="ft" step={0.5} min={1}
            value={el.width} onChange={(v) => commitSet({ width: v })} />
          <Num label="Height" suffix="ft" step={0.25} min={1}
            value={el.height} onChange={(v) => commitSet({ height: v })} />
          {el.type === 'door' && (
            <div className="row2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Hinge</label>
                <select value={el.hinge || 'left'} onChange={(e) => commitSet({ hinge: e.target.value })}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Swing</label>
                <select value={el.swing || 'in'} onChange={(e) => commitSet({ swing: e.target.value })}>
                  <option value="in">Inward</option>
                  <option value="out">Outward</option>
                </select>
              </div>
            </div>
          )}
          {el.type === 'window' && (
            <>
              <div className="field">
                <label>Window style</label>
                <select value={el.style || 'slider'} onChange={(e) => commitSet({ style: e.target.value })}>
                  {WINDOW_STYLE_ORDER.map((k) => <option key={k} value={k}>{WINDOW_STYLES[k].label}</option>)}
                </select>
              </div>
              <Num label="Sill height" suffix="ft" step={0.25} min={0}
                value={el.sill ?? 3} onChange={(v) => commitSet({ sill: v })} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '2px 0 12px' }}>
                <input type="checkbox" checked={!!el.grid} onChange={(e) => commitSet({ grid: e.target.checked })} />
                Colonial grid (grilles)
              </label>
            </>
          )}
          <div className="field">
            <label>Position along wall — {Math.round(el.t * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={el.t} style={{ width: '100%' }}
              onChange={(e) => set({ t: parseFloat(e.target.value) })} />
          </div>
        </>
      )}

      {sel.type === 'fence' && (
        <>
          <ElevationButton type="fence" id={el.id} />
          <div className="field">
            <label>Length</label>
            <input type="text" readOnly value={formatFeetInches(dist(el.a, el.b))} />
          </div>
          <div className="field">
            <label>Fence type</label>
            <select value={el.fenceType}
              onChange={(e) => commitSet({ fenceType: e.target.value, height: FENCE_TYPES[e.target.value].height, color: FENCE_TYPES[e.target.value].color })}>
              {Object.entries(FENCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {FENCE_TYPES[el.fenceType]?.colors?.length > 1 && (
            <div className="field">
              <label>Color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FENCE_TYPES[el.fenceType].colors.map((c) => (
                  <span key={c} onClick={() => commitSet({ color: c })} title={c}
                    style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                      border: (el.color || FENCE_TYPES[el.fenceType].color) === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
                      boxShadow: (el.color || FENCE_TYPES[el.fenceType].color) === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
                ))}
              </div>
            </div>
          )}
          {FENCE_TYPES[el.fenceType]?.style === 'pickets' && (
            <div className="field">
              <label>Picket top</label>
              <select value={el.cap || FENCE_TYPES[el.fenceType].cap || 'dogear'} onChange={(e) => commitSet({ cap: e.target.value })}>
                {PICKET_CAP_ORDER.map((k) => <option key={k} value={k}>{PICKET_CAPS[k].label}</option>)}
              </select>
            </div>
          )}
          <div className="row2">
            <Num label="Height" suffix="ft" step={0.5} min={2}
              value={el.height} onChange={(v) => commitSet({ height: v })} />
            <Num label="Post spacing" suffix="ft" step={1} min={2}
              value={el.postSpacing} onChange={(v) => commitSet({ postSpacing: v })} />
          </div>
          <div className="row2">
            <Num label="Post height" suffix="ft" step={0.5} min={2}
              value={el.postHeight ?? +(el.height + (FENCE_TYPES[el.fenceType]?.style === 'mesh' ? 0.3 : 0.2)).toFixed(2)}
              onChange={(v) => commitSet({ postHeight: v })} />
            <Num label="Post size" suffix="in" step={0.5} min={1}
              value={+((el.postSize ?? 0.3) * 12).toFixed(1)}
              onChange={(v) => commitSet({ postSize: v / 12 })} />
          </div>
          {FENCE_TYPES[el.fenceType]?.style === 'mesh' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                <input type="checkbox" checked={!!el.slats} onChange={(e) => commitSet({ slats: e.target.checked })} />
                Privacy slats
              </label>
              {el.slats && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  {SLAT_COLORS.map((c) => (
                    <span key={c} onClick={() => commitSet({ slatColor: c })} title={c}
                      style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                        border: (el.slatColor || SLAT_COLORS[0]) === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
                        boxShadow: (el.slatColor || SLAT_COLORS[0]) === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginTop: 8 }}>
                <input type="checkbox" checked={!!el.barbed} onChange={(e) => commitSet({ barbed: e.target.checked })} />
                Barbed-wire top
              </label>
            </div>
          )}
        </>
      )}

      {sel.type === 'gate' && (
        <>
          <div className="field">
            <label>Gate type</label>
            <select value={el.gateType || 'swing'} onChange={(e) => commitSet({ gateType: e.target.value })}>
              {GATE_TYPE_ORDER.map((k) => <option key={k} value={k}>{GATE_TYPES[k].label}</option>)}
            </select>
          </div>
          {(el.gateType || 'swing') !== 'sliding' && (
            <div className="row2">
              {(el.gateType || 'swing') === 'swing' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Hinge</label>
                  <select value={el.hinge || 'left'} onChange={(e) => commitSet({ hinge: e.target.value })}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Swing</label>
                <select value={el.swing || 'in'} onChange={(e) => commitSet({ swing: e.target.value })}>
                  <option value="in">Into yard</option>
                  <option value="out">Outward</option>
                </select>
              </div>
            </div>
          )}
          {(() => {
            const mat = el.material || 'wood';
            const palette = FENCE_TYPES[mat]?.colors || [FENCE_TYPES[mat]?.color];
            return (
              <>
                <div className="field">
                  <label>Material</label>
                  <select value={mat} onChange={(e) => commitSet({ material: e.target.value, color: FENCE_TYPES[e.target.value].color })}>
                    {Object.entries(FENCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Color</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {palette.map((c) => (
                      <span key={c} onClick={() => commitSet({ color: c })} title={c}
                        style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                          border: (el.color || FENCE_TYPES[mat].color) === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
                          boxShadow: (el.color || FENCE_TYPES[mat].color) === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
                    ))}
                  </div>
                </div>
                {FENCE_TYPES[mat]?.style === 'pickets' && (
                  <div className="field">
                    <label>Picket top</label>
                    <select value={el.cap || FENCE_TYPES[mat].cap || 'dogear'} onChange={(e) => commitSet({ cap: e.target.value })}>
                      {PICKET_CAP_ORDER.map((k) => <option key={k} value={k}>{PICKET_CAPS[k].label}</option>)}
                    </select>
                  </div>
                )}
                {FENCE_TYPES[mat]?.style === 'mesh' && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '2px 0 8px' }}>
                      <input type="checkbox" checked={!!el.slats} onChange={(e) => commitSet({ slats: e.target.checked })} />
                      Privacy slats
                    </label>
                    {el.slats && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {SLAT_COLORS.map((c) => (
                          <span key={c} onClick={() => commitSet({ slatColor: c })} title={c}
                            style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                              border: (el.slatColor || SLAT_COLORS[0]) === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
                              boxShadow: (el.slatColor || SLAT_COLORS[0]) === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
                        ))}
                      </div>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '2px 0 12px' }}>
                      <input type="checkbox" checked={!!el.barbed} onChange={(e) => commitSet({ barbed: e.target.checked })} />
                      Barbed-wire top
                    </label>
                  </>
                )}
              </>
            );
          })()}
          <div className="row2">
            <Num label="Gate width" suffix="ft" step={0.5} min={2}
              value={el.width} onChange={(v) => commitSet({ width: v })} />
            <Num label="Gate height" suffix="ft" step={0.5} min={2}
              value={el.height ?? (fences.find((f) => f.id === el.fenceId)?.height ?? 6)}
              onChange={(v) => commitSet({ height: v })} />
          </div>
          <div className="field">
            <label>Position along fence — {Math.round(el.t * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={el.t} style={{ width: '100%' }}
              onChange={(e) => set({ t: parseFloat(e.target.value) })} />
          </div>
        </>
      )}

      {sel.type === 'stair' && (
        <>
          <div className="field">
            <label>Stair type</label>
            <select value={el.type || 'straight'} onChange={(e) => commitSet({ type: e.target.value })}>
              {STAIR_TYPE_ORDER.map((k) => <option key={k} value={k}>{STAIR_TYPES[k].label}</option>)}
            </select>
          </div>
          <div className="row2">
            <Num label="Width" suffix="ft" step={0.5} min={2} value={el.width ?? 3.5} onChange={(v) => commitSet({ width: v })} />
            <Num label="Steps" step={1} min={2} value={el.steps ?? 13} onChange={(v) => commitSet({ steps: Math.round(v) })} />
          </div>
          <div className="field">
            <label>Rotation — {Math.round(el.rotation || 0)}°</label>
            <input type="range" min="0" max="360" step="5" value={el.rotation || 0} style={{ width: '100%' }}
              onChange={(e) => set({ rotation: parseInt(e.target.value) })} onMouseUp={(e) => commitSet({ rotation: parseInt(e.target.value) })} />
          </div>
          <button className="btn soft" style={{ width: '100%', marginBottom: 12 }}
            onClick={() => commitSet({ rotation: ((el.rotation || 0) + 90) % 360 })}>Rotate 90°</button>
        </>
      )}

      {sel.type === 'post' && (
        <>
          <p className="empty-note">A placed fence post (on top of the auto-spaced posts). Drag it along its fence in the plan or the elevation view, or set its position here.</p>
          <div className="field">
            <label>Position along fence — {Math.round((el.t || 0) * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={el.t ?? 0.5} style={{ width: '100%' }}
              onChange={(e) => set({ t: parseFloat(e.target.value) })} onMouseUp={(e) => commitSet({ t: parseFloat(e.target.value) })} />
          </div>
          <Num label="Height" suffix="ft" step={0.5} min={1} value={el.height ?? 6} onChange={(v) => commitSet({ height: v })} />
        </>
      )}

      {sel.type === 'label' && (
        <>
          <div className="field">
            <label>Text <span className="muted">(Enter for a new row)</span></label>
            <textarea value={el.text || ''} rows={3}
              onChange={(e) => set({ text: e.target.value })} onBlur={(e) => commitSet({ text: e.target.value })}
              placeholder="Label text" style={{ width: '100%', resize: 'vertical', padding: '7px 10px', border: '1px solid var(--slate-200)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)' }} />
          </div>
          <Num label="Font size" suffix="px" step={1} min={6}
            value={el.fontSize ?? 12} onChange={(v) => commitSet({ fontSize: v })} />
          <div className="field" style={{ marginBottom: 6 }}>
            <label>Colors</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="color" value={el.line || '#0a2540'} title="Set all"
                onChange={(e) => set({ line: e.target.value, arrow: e.target.value, border: e.target.value })}
                onBlur={(e) => commitSet({ line: e.target.value, arrow: e.target.value, border: e.target.value })}
                style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--slate-200)', borderRadius: 6, cursor: 'pointer' }} />
              <span className="muted" style={{ fontSize: 12 }}>All together</span>
            </div>
            {[['line', 'Path line'], ['arrow', 'Arrow'], ['border', 'Pill border']].map(([key, lbl]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="color" value={el[key] || '#0a2540'} title={lbl}
                  onChange={(e) => set({ [key]: e.target.value })} onBlur={(e) => commitSet({ [key]: e.target.value })}
                  style={{ width: 26, height: 22, padding: 0, border: '1px solid var(--slate-200)', borderRadius: 5, cursor: 'pointer' }} />
                <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{lbl}</span>
              </div>
            ))}
          </div>
          <p className="empty-note">Drag the <b>pill</b> to place the label · drag the <b>circle</b> to move the arrow tip.</p>
        </>
      )}

      <button className="btn danger del-btn" onClick={del}><IconTrash style={{ width: 16, height: 16 }} /> Delete</button>
    </div>
  );
}

function Quantities() {
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const fences = useStore((s) => s.fences);
  const gates = useStore((s) => s.gates);
  const posts = useStore((s) => s.posts);
  const exportPlan = useStore((s) => s.exportPlan);
  const [copied, setCopied] = useState('');

  const q = computeQuantities({ walls, openings, fences, gates, posts });
  const rows = quantitiesRows(q);

  const copyTable = () => {
    const text = rows.map(([k, v]) => `${k.replace(/^ +•? ?/, '')}\t${v}`).join('\n');
    navigator.clipboard?.writeText(text);
    setCopied('table'); setTimeout(() => setCopied(''), 1400);
  };
  const copyJSON = () => {
    const payload = { quantities: q, plan: exportPlan() };
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setCopied('json'); setTimeout(() => setCopied(''), 1400);
  };

  return (
    <div>
      <table className="qty-table">
        <tbody>
          <tr><td>Wall linear ft</td><td className="val">{q.wallLF.toFixed(1)}</td></tr>
          {(q.wallExtLF > 0 || q.wallIntLF > 0) && (
            <tr><td style={{ paddingLeft: 14, color: 'var(--muted)' }}>Exterior / Interior</td><td className="val" style={{ fontWeight: 600 }}>{q.wallExtLF.toFixed(0)} / {q.wallIntLF.toFixed(0)}</td></tr>
          )}
          {Object.entries(q.wallByMaterial).map(([k, v]) => (
            <tr key={k}><td style={{ paddingLeft: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: v.color, border: '1px solid var(--slate-200)' }} />
                {v.label}
              </span></td><td className="val">{v.lf.toFixed(1)} ft</td></tr>
          ))}
          <tr><td>Doors / Windows</td><td className="val">{q.doorCount} / {q.windowCount}</td></tr>
          <tr><td>Openings</td><td className="val">{q.openingCount}</td></tr>
          <tr className="total"><td>Fence linear ft</td><td className="val">{q.fenceLF.toFixed(1)}</td></tr>
          {Object.entries(q.fenceByType).map(([k, v]) => (
            <tr key={k}>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <FenceGlyph style={v.style} color={v.color} width={26} height={11} />
                  {v.label}
                </span>
              </td>
              <td className="val">{v.lf.toFixed(1)} ft</td>
            </tr>
          ))}
          <tr className="total"><td>Gates</td><td className="val">{q.gateCount}</td></tr>
          <tr><td>Posts</td><td className="val">{q.postCount}</td></tr>
        </tbody>
      </table>

      <div className="row2" style={{ marginTop: 14 }}>
        <button className="btn soft" onClick={copyTable}>
          {copied === 'table' ? '✓ Copied' : 'Copy table'}
        </button>
        <button className="btn" onClick={copyJSON}>
          {copied === 'json' ? '✓ Copied' : 'Copy JSON'}
        </button>
      </div>
    </div>
  );
}

export default function RightPanel({ onCollapse }) {
  const sel = useStore((s) => s.selection);
  return (
    <aside className="panel right">
      <PanelHead title="Properties" side="right" onCollapse={onCollapse} />
      <Section title={sel ? `Selected ${sel.type}` : 'Selection'}>
        <SelectedProps />
      </Section>
      <Section title="Quantities">
        <Quantities />
      </Section>
    </aside>
  );
}
