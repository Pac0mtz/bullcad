import React from 'react';
import { useStore } from '../store.js';
import { Section, PanelHead } from './ui.jsx';
import { FENCE_TYPES, WALL_PRESETS, WALL_COLORS, WALL_MATERIALS, WALL_MATERIAL_ORDER, WINDOW_STYLES, WINDOW_STYLE_ORDER, GATE_TYPES, GATE_TYPE_ORDER, PICKET_CAPS, PICKET_CAP_ORDER, SLAT_COLORS } from '../utils/geometry.js';
import FenceElevation from './FenceElevation.jsx';

// Row of clickable color swatches.
function Swatches({ value, options, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((c) => (
        <span key={c} onClick={() => onPick(c)} title={c}
          style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
            border: value === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
            boxShadow: value === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
      ))}
    </div>
  );
}
import { IconDoor, IconWindow, IconOpening, IconGate, IconWall, IconRoom, IconMeasure, IconSelect, IconPan, IconFence, IconZoomIn, IconLabel, IconStairs } from './Icons.jsx';
import { STAIR_TYPES, STAIR_TYPE_ORDER } from '../utils/geometry.js';

// Dropdown of wall-thickness presets; falls back to "Custom" for off-preset values.
function WallPresetSelect({ inches, onPick }) {
  const match = WALL_PRESETS.find((p) => Math.abs(p.inches - inches) < 0.05);
  return (
    <div className="field">
      <label>Preset</label>
      <select value={match ? match.label : 'custom'} onChange={(e) => {
        const p = WALL_PRESETS.find((x) => x.label === e.target.value);
        if (p) onPick(p.inches);
      }}>
        {WALL_PRESETS.map((p) => (
          <option key={p.label} value={p.label}>{p.label} — {p.inches}″</option>
        ))}
        {!match && <option value="custom">Custom — {inches}″</option>}
      </select>
    </div>
  );
}

function Num({ label, value, onChange, step = 0.5, min = 0, max, suffix }) {
  return (
    <div className="field">
      <label>{label}{suffix ? <span className="muted"> ({suffix})</span> : null}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

export default function LeftPanel({ onCollapse }) {
  const s = useStore();
  const { tool, setTool, setDefault, scale, setScale, snapEnabled, setSnap } = s;

  return (
    <aside className="panel left">
      <PanelHead title="Tools" side="left" onCollapse={onCollapse} />

      {/* Every tool + wall component lives here (moved out of the header and the
          old Wall Components section). */}
      <Section title="Tools">
        <div className="lib-grid">
          {[
            { id: 'select', label: 'Select', sub: 'edit / move', Icon: IconSelect, k: 'V' },
            { id: 'pan', label: 'Pan', sub: 'drag canvas', Icon: IconPan, k: 'H' },
            { id: 'wall', label: 'Wall', sub: 'click to chain', Icon: IconWall, k: 'W' },
            { id: 'room', label: 'Room', sub: '4-wall box', Icon: IconRoom, k: 'R' },
            { id: 'door', label: 'Door', sub: 'cuts wall', Icon: IconDoor, k: 'D' },
            { id: 'window', label: 'Window', sub: 'on wall', Icon: IconWindow, k: 'I' },
            { id: 'opening', label: 'Opening', sub: 'no door', Icon: IconOpening, k: 'O' },
            { id: 'fence', label: 'Fence', sub: 'click to chain', Icon: IconFence, k: 'F' },
            { id: 'gate', label: 'Gate', sub: 'on a fence', Icon: IconGate, k: 'G' },
            { id: 'measure', label: 'Measure', sub: 'distance', Icon: IconMeasure, k: 'M' },
            { id: 'stairs', label: 'Stairs', sub: 'place', Icon: IconStairs, k: 'S' },
            { id: 'label', label: 'Label', sub: 'callout', Icon: IconLabel, k: 'L' },
            { id: 'zoom', label: 'Zoom', sub: 'click to zoom', Icon: IconZoomIn, k: 'Z' },
          ].map(({ id, label, sub, Icon, k }) => (
            <div key={id} className={'lib-item' + (tool === id ? ' active' : '')} onClick={() => setTool(id)}>
              <span className="key-badge">{k}</span>
              <div className="ico"><Icon style={{ width: 24, height: 24, color: 'var(--text)' }} /></div>
              <div className="nm">{label}</div>
              <div className="sub">{sub}</div>
            </div>
          ))}
        </div>

        {/* contextual component options */}
        {tool === 'window' && (
          <div style={{ marginTop: 12 }}>
            <div className="field">
              <label>Window style</label>
              <select value={s.windowStyle} onChange={(e) => setDefault('windowStyle', e.target.value)}>
                {WINDOW_STYLE_ORDER.map((k) => <option key={k} value={k}>{WINDOW_STYLES[k].label}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
              <input type="checkbox" checked={s.windowGrid} onChange={(e) => setDefault('windowGrid', e.target.checked)} />
              Colonial grid (grilles)
            </label>
            <p className="empty-note">Click on a wall to place. Size follows the chosen style; tweak it in Properties after placing.</p>
          </div>
        )}
        {(tool === 'door' || tool === 'opening') && (
          <div style={{ marginTop: 12 }}>
            <Num label="Component width" suffix="ft" step={0.5} min={1}
              value={s.openingWidth} onChange={(v) => setDefault('openingWidth', v)} />
            <p className="empty-note">Click on a wall to place. Drag it to slide along the wall.</p>
          </div>
        )}
        {tool === 'stairs' && (
          <div style={{ marginTop: 12 }}>
            <div className="field">
              <label>Stair type</label>
              <select value={s.stairType} onChange={(e) => setDefault('stairType', e.target.value)}>
                {STAIR_TYPE_ORDER.map((k) => <option key={k} value={k}>{STAIR_TYPES[k].label}</option>)}
              </select>
            </div>
            <div className="row2">
              <Num label="Width" suffix="ft" step={0.5} min={2} value={s.stairWidth} onChange={(v) => setDefault('stairWidth', v)} />
              <Num label="Steps" step={1} min={2} value={s.stairSteps} onChange={(v) => setDefault('stairSteps', Math.round(v))} />
            </div>
            <p className="empty-note">Click on the plan to place the stair. Drag to move; rotate in Properties.</p>
          </div>
        )}
      </Section>

      {/* Wall options — contextual to the wall/room/select tools */}
      {(tool === 'wall' || tool === 'room' || tool === 'select') && (
        <Section title={tool === 'room' ? 'Room Walls' : 'Wall'} defaultOpen={false}>
          <WallPresetSelect inches={+(s.wallThickness * 12).toFixed(1)}
            onPick={(inches) => setDefault('wallThickness', inches / 12)} />
          <div className="row2">
            <Num label="Thickness" suffix="in" step={0.5} min={1}
              value={+(s.wallThickness * 12).toFixed(1)}
              onChange={(v) => setDefault('wallThickness', v / 12)} />
            <Num label="Height" suffix="ft" step={0.5} min={4}
              value={s.wallHeight} onChange={(v) => setDefault('wallHeight', v)} />
          </div>
          <div className="field">
            <label>Material <span className="muted">(3D finish)</span></label>
            <select value={s.wallMaterial} onChange={(e) => { setDefault('wallMaterial', e.target.value); setDefault('wallColor', WALL_MATERIALS[e.target.value].color); }}>
              {WALL_MATERIAL_ORDER.map((k) => <option key={k} value={k}>{WALL_MATERIALS[k].label}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Color <span className="muted">(3D)</span></label>
            <Swatches value={s.wallColor} options={WALL_COLORS} onPick={(c) => setDefault('wallColor', c)} />
          </div>
          <p className="empty-note">
            {tool === 'room'
              ? <>Click one corner, then the opposite corner to drop a <b>4-wall room</b>. Corners snap to existing walls.</>
              : <>Pick <b>Wall</b>, click to drop points. Double-click or <kbd>Esc</kbd> to finish a run.</>}
          </p>
        </Section>
      )}

      {/* Fence options + library */}
      <Section title="Fence & Gate" defaultOpen={false}>
        <div className="lib-grid">
          {Object.entries(FENCE_TYPES).map(([key, ft]) => (
            <div
              key={key}
              className={'lib-item' + (s.fenceType === key ? ' active' : '')}
              onClick={() => { setDefault('fenceType', key); setDefault('fenceHeight', ft.height); setDefault('fenceColor', ft.color); if (ft.cap) setDefault('picketCap', ft.cap); setTool('fence'); }}
            >
              <div className="ico" style={{ height: 26 }}>
                <FenceElevation style={ft.style} cap={ft.cap} slim={ft.slim} tight={ft.tight} color={ft.color} width={34} height={24} />
              </div>
              <div className="nm">{ft.label}</div>
              <div className="sub">{ft.height}&prime; default</div>
            </div>
          ))}
        </div>

        {/* Fence detail controls — contextual to the fence tool, matching the
            Wall / Window / Gate sections so the panel stays compact otherwise. */}
        {tool === 'fence' && (
          <>
            {FENCE_TYPES[s.fenceType]?.colors?.length > 1 && (
              <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label>Color</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {FENCE_TYPES[s.fenceType].colors.map((c) => (
                    <span key={c} onClick={() => setDefault('fenceColor', c)} title={c}
                      style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
                        border: s.fenceColor === c ? '2px solid var(--teal)' : '1px solid var(--slate-200)',
                        boxShadow: s.fenceColor === c ? '0 0 0 2px rgba(20,184,166,0.25)' : 'none' }} />
                  ))}
                </div>
              </div>
            )}

            {FENCE_TYPES[s.fenceType]?.style === 'pickets' && (
              <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label>Picket top</label>
                <select value={s.picketCap} onChange={(e) => setDefault('picketCap', e.target.value)}>
                  {PICKET_CAP_ORDER.map((k) => <option key={k} value={k}>{PICKET_CAPS[k].label}</option>)}
                </select>
              </div>
            )}

            {FENCE_TYPES[s.fenceType]?.style === 'mesh' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                  <input type="checkbox" checked={!!s.fenceSlats} onChange={(e) => setDefault('fenceSlats', e.target.checked)} />
                  Privacy slats
                </label>
                {s.fenceSlats && (
                  <Swatches value={s.fenceSlatColor} options={SLAT_COLORS} onPick={(c) => setDefault('fenceSlatColor', c)} />
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginTop: 10 }}>
                  <input type="checkbox" checked={!!s.fenceBarbed} onChange={(e) => setDefault('fenceBarbed', e.target.checked)} />
                  Barbed-wire top
                </label>
              </div>
            )}

            <div className="row2" style={{ marginTop: 12 }}>
              <Num label="Height" suffix="ft" step={0.5} min={2}
                value={s.fenceHeight} onChange={(v) => setDefault('fenceHeight', v)} />
              <Num label="Post spacing" suffix="ft" step={1} min={2}
                value={s.postSpacing} onChange={(v) => setDefault('postSpacing', v)} />
            </div>
          </>
        )}

        <div className={'lib-item' + (tool === 'gate' ? ' active' : '')} style={{ marginTop: 12 }} onClick={() => setTool('gate')}>
          <div className="ico" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <IconGate style={{ width: 22, height: 22, color: 'var(--text)' }} />
            <span className="nm">Gate</span>
          </div>
          <div className="sub">click a fence to place • drag to slide</div>
        </div>
        {tool === 'gate' && (
          <div style={{ marginTop: 12 }}>
            <div className="field">
              <label>Gate type</label>
              <select value={s.gateStyle} onChange={(e) => setDefault('gateStyle', e.target.value)}>
                {GATE_TYPE_ORDER.map((k) => <option key={k} value={k}>{GATE_TYPES[k].label}</option>)}
              </select>
            </div>
            <Num label="Gate width" suffix="ft" step={0.5} min={2}
              value={s.gateWidth} onChange={(v) => setDefault('gateWidth', v)} />
            <p className="empty-note">The gate matches the fence it's placed on — material, color, picket top and barbed-wire top are inherited. Change them per-gate in Properties.</p>
          </div>
        )}
      </Section>

      {/* ---- Configuration (set once; collapsed by default) ---- */}
      <Section title="Dimensions" defaultOpen={false}>
        <div className="field">
          <label>Show</label>
          <select value={s.dimMode} onChange={(e) => setDefault('dimMode', e.target.value)}>
            <option value="off">Off</option>
            <option value="centerline">Centerline</option>
            <option value="interior">Interior (clear)</option>
            <option value="exterior">Exterior (overall)</option>
            <option value="both">Interior + Exterior</option>
          </select>
        </div>
        <div className="field" style={{ opacity: s.dimMode === 'off' ? 0.45 : 1, marginBottom: 0 }}>
          <label>Default offset — {s.dimOffset.toFixed(2)} ft <span className="muted">(drag a pill to set its own)</span></label>
          <input type="range" min="0" max="4" step="0.25" value={s.dimOffset} style={{ width: '100%' }}
            disabled={s.dimMode === 'off'}
            onChange={(e) => setDefault('dimOffset', parseFloat(e.target.value))} />
        </div>
      </Section>

      <Section title="Alignment" defaultOpen={false}>
        <div className="field">
          <label>Wall line on</label>
          <select value={s.wallJustify} onChange={(e) => setDefault('wallJustify', e.target.value)}>
            <option value="center">Centered</option>
            <option value="interior">Interior face</option>
            <option value="exterior">Exterior face</option>
          </select>
        </div>
        <div className="field">
          <label>Fence line on</label>
          <select value={s.fenceJustify} onChange={(e) => setDefault('fenceJustify', e.target.value)}>
            <option value="center">Centered</option>
            <option value="interior">Inner side</option>
            <option value="exterior">Outer side</option>
          </select>
        </div>
        <p className="empty-note">Put the wall line on a face so drawn lengths are exact for that side (e.g. a 20&prime; interior).</p>
      </Section>

      <Section title="Layers" defaultOpen={false}>
        {[
          ['walls', 'Walls', s.walls.length],
          ['openings', 'Doors & Windows', s.openings.length],
          ['fences', 'Fences', s.fences.length],
          ['gates', 'Gates', s.gates.length],
          ['stairs', 'Stairs', s.stairs.length],
          ['labels', 'Labels', s.labels.length],
          ['dims', 'Dimensions', null],
        ].map(([key, label, count]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: 'var(--text)', padding: '5px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.layers?.[key] !== false} onChange={(e) => s.setLayer(key, e.target.checked)} />
            <span style={{ flex: 1 }}>{label}</span>
            {count != null && <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{count}</span>}
          </label>
        ))}
        <p className="empty-note" style={{ marginTop: 6 }}>Toggle what's drawn on the plan. Hidden layers also hide in 3D.</p>
      </Section>

      <Section title="Canvas" defaultOpen={false}>
        <div className="field">
          <label>Scale — {scale} px / ft</label>
          <input type="range" min="6" max="30" step="1" value={scale} style={{ width: '100%' }}
            onChange={(e) => setScale(parseInt(e.target.value))} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnap(e.target.checked)} />
          Snap to grid &amp; endpoints
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginTop: 10 }}>
          <input type="checkbox" checked={!!s.showRoomAreas} onChange={(e) => setDefault('showRoomAreas', e.target.checked)} />
          Show room areas
        </label>
        <p className="empty-note" style={{ marginTop: 8 }}>Tip: hold <b>Shift</b> while drawing to lock angles · <b>Arrow keys</b> nudge the selection.</p>
      </Section>
    </aside>
  );
}
