import React from 'react';
import { Group, Line, Rect, Circle, Text, Arc, Arrow } from 'react-konva';
import { dist, lerp, angleOf, dirNormal, formatFeetInches, postsAlong, FENCE_TYPES, windowBars, wallDimGeometry, wallOpeningDimGeometry, WINDOW_STYLES, stairGeometry } from '../../utils/geometry.js';

const TEAL = '#14b8a6';
const NAVY = '#0a2540';
const BLUE = '#2563eb';

// Fallback palette (light) so shapes still render if a palette prop is missing.
const DEFAULT_PALETTE = {
  wallBody: '#d6dde6', wallBodySel: '#bfe9e3', wallLine: NAVY, wallLineSel: BLUE,
  opMask: '#f1f5f9', opStroke: NAVY, opStrokeSel: BLUE,
  dimBg: '#ffffff', dimShadow: NAVY, postFill: NAVY,
};

// On-screen wall thickness in px — shared by the wall band and the opening cut
// so gaps line up exactly with the wall faces.
export const wallBandWidth = (wall, scale) => Math.max(4, wall.thickness * scale * 1.25);

// Local-y sign (in screen space) that points toward `centroid` for a segment
// a->b — i.e. the side a door/gate leaf should swing so it opens into the
// enclosed area and away from the outward dimension strings. Defaults to -1
// (the historic "up" direction) when no centroid is supplied.
function leafInwardSign(a, b, centroid) {
  if (!centroid) return -1;
  const L = dist(a, b) || 1;
  const vx = (b.y - a.y) / L, vy = -(b.x - a.x) / L; // world dir of local -y
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return vx * (centroid.x - mid.x) + vy * (centroid.y - mid.y) >= 0 ? -1 : 1;
}

// Swing geometry for a door/gate leaf (local frame, full width `w` in px).
// `inward` is the local-y sign toward the enclosed side; `hinge` ('left'|'right')
// picks the hinge jamb and `swing` ('in'|'out') flips which side it opens to.
// Returns the hinge x, the leaf-tip y sign `d`, and the Konva arc rotation that
// draws a clean 90° quarter-circle from the leaf tip to the far jamb.
function swingGeom(w, inward, hinge = 'left', swing = 'in') {
  const d = (swing === 'out' ? -1 : 1) * inward;
  const left = hinge !== 'right';
  const hx = left ? -w / 2 : w / 2;
  const rotation = left ? (d === 1 ? 0 : -90) : (d === 1 ? 90 : 180);
  return { d, hx, rotation };
}

// Dimension text scale vs zoom. Zoomed out (≤1×) it stays a constant screen size
// so it's readable; from 1×→4× it grows WITH the plan (so zooming in no longer
// makes the numbers look tiny next to the enlarged walls); past 4× it's capped so
// it never bloats. Returns the group scale (applied as scaleX/scaleY).
const dimScale = (z) => { z = z || 1; return z <= 1 ? 1 / z : z <= 4 ? 1 : 4 / z; };

// Dimension line split into two segments with a gap for the label so the line
// never strikes through the number. `mid` is the label center, `gapFt` the
// half-gap (feet). When the label fills the whole line (tight openings/windows)
// it returns [] — no center line at all (the end ticks + number convey it).
const brokenLine = (p0, p1, mid, gapFt) => {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
  if (len / 2 - gapFt <= 0.02) return [];
  const ux = dx / len, uy = dy / len;
  return [
    { a: p0, b: { x: mid.x - ux * gapFt, y: mid.y - uy * gapFt } },
    { a: { x: mid.x + ux * gapFt, y: mid.y + uy * gapFt }, b: p1 },
  ];
};

// ---- dimension label centered on a segment, rotated to follow its direction ----
export function DimLabel({ a, b, scale, color = NAVY, off = 0.9, palette = DEFAULT_PALETTE, zoom = 1 }) {
  const L = dist(a, b);
  if (L < 0.3) return null;
  const mid = lerp(a, b, 0.5);
  const { nx, ny } = dirNormal(a, b);
  const cx = (mid.x + nx * off) * scale;
  const cy = (mid.y + ny * off) * scale;
  const txt = formatFeetInches(L);
  const w = txt.length * 5.4 + 7;
  const inv = dimScale(zoom);
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180; // keep text upright
  return (
    <Group x={cx} y={cy} rotation={angle} scaleX={inv} scaleY={inv} listening={false}>
      <Text x={-w / 2} y={-4.5} width={w} align="center" text={txt} fontSize={9.5} fontFamily="Poppins"
        fontStyle="500" fill={color} stroke={palette.opMask} strokeWidth={3} fillAfterStrokeEnabled lineJoin="round" />
    </Group>
  );
}

// ---- architectural wall dimension: witness lines + dim line + ticks + label ----
export function WallDimension({ wall, kind, offset, centroid, justify = 'center', scale, color = NAVY, palette = DEFAULT_PALETTE, onPillDown, zoom = 1 }) {
  const g = wallDimGeometry(wall, kind, offset, centroid, justify);
  if (!g) return null;
  const S = scale;
  const P = (p) => [p.x * S, p.y * S];
  const w = g.label.text.length * 5.4 + 7;
  const inv = dimScale(zoom);
  const gapFt = ((w / 2 + 5) * inv) / S; // gap so the line clears the number
  const segs = brokenLine(g.line[0], g.line[1], g.label, gapFt);
  const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
  return (
    <Group>
      {g.witness.map((seg, i) => (
        <Line key={'w' + i} points={[...P(seg[0]), ...P(seg[1])]} stroke={color} strokeWidth={0.6} opacity={0.7} strokeScaleEnabled={false} listening={false} />
      ))}
      {/* dim line broken around the number (───┤ 13' 6" ├───); on tight runs the
          label fills the line so no center line is drawn — never strikes text */}
      {segs.map((s, i) => <Line key={'dl' + i} points={[...P(s.a), ...P(s.b)]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />)}
      {g.slashes.map((seg, i) => (
        <Line key={'s' + i} points={[...P(seg[0]), ...P(seg[1])]} stroke={color} strokeWidth={0.9} strokeScaleEnabled={false} listening={false} />
      ))}
      {/* draggable hit area (pill removed) — drag perpendicular to set the offset */}
      <Group x={g.label.x * S} y={g.label.y * S} rotation={g.label.angle} scaleX={inv} scaleY={inv}
        onMouseDown={onPillDown} onTouchStart={onPillDown}
        onMouseEnter={onPillDown && setCur('move')} onMouseLeave={onPillDown && setCur('')}>
        <Rect x={-w / 2} y={-6.5} width={w} height={13} fill="rgba(0,0,0,0.001)" />
        <Text x={-w / 2} y={-4.5} width={w} align="center" text={g.label.text} fontSize={9.5} fontFamily="Poppins" fontStyle="500" fill={color} listening={false} />
      </Group>
    </Group>
  );
}

// ---- opening dimension string: wall length broken at each opening edge ----
export function WallOpeningDims({ wall, openings, perpOffset, centroid, justify = 'center', scale, color = NAVY, palette = DEFAULT_PALETTE, onPillDown, zoom = 1 }) {
  const g = wallOpeningDimGeometry(wall, openings, perpOffset, centroid, justify);
  if (!g) return null;
  const S = scale;
  const P = (p) => [p.x * S, p.y * S];
  const inv = dimScale(zoom);
  const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
  return (
    <Group>
      {g.witness.map((s, i) => (
        <Line key={'w' + i} points={[...P(s[0]), ...P(s[1])]} stroke={color} strokeWidth={0.5} opacity={0.5} strokeScaleEnabled={false} listening={false} />
      ))}
      {g.segments.map((seg, i) => {
        const lw = seg.label.text.length * 5 + 6;
        const mid = { x: (seg.line[0].x + seg.line[1].x) / 2, y: (seg.line[0].y + seg.line[1].y) / 2 };
        const segs = brokenLine(seg.line[0], seg.line[1], mid, ((lw / 2 + 4) * inv) / S);
        return segs.map((s, j) => <Line key={'l' + i + '_' + j} points={[...P(s.a), ...P(s.b)]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
      })}
      {g.ticks.map((s, i) => (
        <Line key={'t' + i} points={[...P(s[0]), ...P(s[1])]} stroke={color} strokeWidth={0.8} strokeScaleEnabled={false} listening={false} />
      ))}
      {g.segments.map((seg, i) => {
        const w = seg.label.text.length * 5 + 6;
        return (
          <Group key={'g' + i} x={seg.label.x * S} y={seg.label.y * S} rotation={seg.label.angle} scaleX={inv} scaleY={inv}
            onMouseDown={onPillDown} onTouchStart={onPillDown}
            onMouseEnter={onPillDown && setCur('move')} onMouseLeave={onPillDown && setCur('')}>
            <Rect x={-w / 2} y={-6} width={w} height={12} fill="rgba(0,0,0,0.001)" />
            <Text x={-w / 2} y={-4.5} width={w} align="center" text={seg.label.text} fontSize={8.5} fontFamily="Poppins" fontStyle="500" fill={color} listening={false} />
          </Group>
        );
      })}
    </Group>
  );
}

// ---------------- WALL ----------------
// Architectural poché: the wall is a single solid band the width of its real
// thickness (no centerline / no light border). Square caps fill shared corners.
export function WallShape({ wall, scale, selected, onSelect, palette = DEFAULT_PALETTE, seg = null, poly = null }) {
  // `poly` is the wall body as a mitered, filled polygon (clean joints at any
  // junction). Fall back to a thick stroked centerline when it isn't available.
  const fill = selected ? palette.wallLineSel : palette.wallLine;
  if (poly && poly.points && poly.points.length >= 3) {
    const pts = poly.points.flatMap((p) => [p.x * scale, p.y * scale]);
    return (
      <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)}>
        <Line points={pts} closed fill={fill} stroke={fill} strokeWidth={0.6} lineJoin="round" perfectDrawEnabled={false} shadowForStrokeEnabled={false} />
      </Group>
    );
  }
  const a = seg?.a || wall.a, b = seg?.b || wall.b;
  const th = wallBandWidth(wall, scale);
  return (
    <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)}>
      <Line points={[a.x * scale, a.y * scale, b.x * scale, b.y * scale]} stroke={fill} strokeWidth={th} lineCap="square"
        hitStrokeWidth={Math.max(16, th)} />
    </Group>
  );
}

// ---------------- OPENING (door / window / opening) ----------------
export function OpeningShape({ op, wall, scale, selected, onSelect, palette = DEFAULT_PALETTE, centroid = null, seg = null }) {
  if (!wall) return null;
  const a = seg?.a || wall.a, b = seg?.b || wall.b;
  const center = lerp(a, b, op.t);
  const offX = 0, offY = 0;
  const angDeg = (angleOf(a, b) * 180) / Math.PI;
  const w = op.width * scale;
  const th = wallBandWidth(wall, scale);
  const cut = th + 2; // mask a hair wider than the wall so no slivers remain
  const accent = selected ? palette.opStrokeSel : palette.opStroke;

  // projecting windows (bay / garden): which local-y direction bumps outward
  const proj = op.type === 'window' ? WINDOW_STYLES[op.style]?.project : null;
  let oy = 1;
  if (proj && centroid) {
    const L = dist(wall.a, wall.b) || 1;
    const nx = -(wall.b.y - wall.a.y) / L, ny = (wall.b.x - wall.a.x) / L;
    oy = nx * (centroid.x - center.x) + ny * (centroid.y - center.y) > 0 ? -1 : 1;
  }
  const projPx = proj ? (WINDOW_STYLES[op.style].depth || 1.5) * scale * oy : 0;

  return (
    <Group x={center.x * scale + offX} y={center.y * scale + offY} rotation={angDeg} onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)}>
      {/* hit area */}
      <Rect x={-w / 2} y={-th} width={w} height={th * 2} fill="transparent" />
      {/* cut the wall: masking band painted in the canvas background color */}
      <Rect x={-w / 2} y={-cut / 2} width={w} height={cut} fill={palette.opMask} />
      {/* jambs */}
      <Line points={[-w / 2, -th / 2, -w / 2, th / 2]} stroke={accent} strokeWidth={2} />
      <Line points={[w / 2, -th / 2, w / 2, th / 2]} stroke={accent} strokeWidth={2} />

      {op.type === 'door' && (() => {
        const { d, hx, rotation } = swingGeom(w, leafInwardSign(a, b, centroid), op.hinge, op.swing);
        return (
          <>
            <Line points={[hx, 0, hx, d * w]} stroke={accent} strokeWidth={2} />
            <Arc x={hx} y={0} innerRadius={w} outerRadius={w} angle={90} rotation={rotation}
              stroke={accent} strokeWidth={1.5} dash={[5, 4]} />
          </>
        );
      })()}
      {op.type === 'window' && proj === 'bay' && (
        // projecting trapezoid (plan view of a bay)
        <Line closed points={[-w / 2, 0, -w / 4, projPx, w / 4, projPx, w / 2, 0]}
          stroke={accent} strokeWidth={2} fill={palette.opMask} />
      )}
      {op.type === 'window' && proj === 'garden' && (
        // projecting box (plan view of a garden window)
        <Line closed points={[-w / 2, 0, -w / 2, projPx, w / 2, projPx, w / 2, 0]}
          stroke={accent} strokeWidth={2} fill={palette.opMask} />
      )}
      {op.type === 'window' && !proj && (() => {
        // glass shown as a thin double line; vertical mullions as meeting stiles
        const inset = th * 0.28;
        const { V } = windowBars(op.style, op.grid);
        return (
          <>
            <Line points={[-w / 2, -inset, w / 2, -inset]} stroke={accent} strokeWidth={1.5} />
            <Line points={[-w / 2, inset, w / 2, inset]} stroke={accent} strokeWidth={1.5} />
            {V.map((b, i) => (
              <Line key={i} points={[-w / 2 + b.at * w, -th / 2, -w / 2 + b.at * w, th / 2]}
                stroke={accent} strokeWidth={b.major ? 2 : 1} />
            ))}
          </>
        );
      })()}
      {selected && <Circle x={0} y={0} radius={4} fill={BLUE} />}
    </Group>
  );
}

// ---------------- FENCE ----------------
export function FenceShape({ fence, scale, selected, onSelect, palette = DEFAULT_PALETTE, seg = null, gates = [] }) {
  const ft = FENCE_TYPES[fence.fenceType] || FENCE_TYPES.wood;
  const col = fence.color || ft.color;
  const a = seg?.a || fence.a, b = seg?.b || fence.b;
  const pts = [a.x * scale, a.y * scale, b.x * scale, b.y * scale];
  const dash = ft.style === 'mesh' ? [2, 3] : ft.style === 'pickets' ? [6, 4] : ft.style === 'slat' ? [5, 3] : ft.style === 'rail' ? [9, 5] : undefined;
  // drop posts that fall inside a gate opening — the gate draws its own end posts.
  const fenceLen = dist(a, b) || 1;
  const posts = postsAlong(a, b, fence.postSpacing || 8).filter((p) => {
    const t = dist(a, p) / fenceLen;
    return !gates.some((g) => Math.abs(t - g.t) < (g.width / 2) / fenceLen - 0.002);
  });
  const ps = Math.max(3, 0.45 * scale);
  return (
    <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)}>
      <Line points={pts} stroke={col} strokeWidth={selected ? 5 : 3.5} lineCap="round"
        dash={dash} hitStrokeWidth={14} />
      {selected && <Line points={pts} stroke={BLUE} strokeWidth={1.5} lineCap="round" dash={[6, 5]} />}
      {posts.map((p, i) => (
        <Rect key={i} x={p.x * scale - ps / 2} y={p.y * scale - ps / 2} width={ps} height={ps}
          fill={palette.postFill} cornerRadius={1} />
      ))}
    </Group>
  );
}

// ------------- POST (an individually placed fence post) -------------
export function PostShape({ post, fence, scale, selected, onSelect, palette = DEFAULT_PALETTE, seg = null }) {
  if (!fence) return null;
  const a = seg?.a || fence.a, b = seg?.b || fence.b;
  const c = lerp(a, b, post.t);
  const ps = Math.max(5, 0.55 * scale); // a touch larger than the auto posts so a placed post reads as deliberate
  return (
    <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)}>
      <Rect x={c.x * scale - ps / 2} y={c.y * scale - ps / 2} width={ps} height={ps}
        fill={post.color || palette.postFill} stroke={selected ? BLUE : '#0a2540'} strokeWidth={selected ? 2 : 0.75}
        cornerRadius={1} hitStrokeWidth={16} />
    </Group>
  );
}

// ---------------- GATE ----------------
export function GateShape({ gate, fence, scale, selected, onSelect, palette = DEFAULT_PALETTE, seg = null, centroid = null }) {
  if (!fence) return null;
  const a = seg?.a || fence.a, b = seg?.b || fence.b;
  const center = lerp(a, b, gate.t);
  const angDeg = (angleOf(a, b) * 180) / Math.PI;
  const w = gate.width * scale;
  const ft = FENCE_TYPES[fence.fenceType] || FENCE_TYPES.wood;
  const mat = gate.color || fence.color || ft.color;
  const accent = selected ? BLUE : mat;
  const type = gate.gateType || 'swing';
  const pr = Math.max(2.5, 0.3 * scale);
  // swing toward the enclosed side (away from the dimension strings) by default;
  // hinge/swing overrides flip it. `sw` holds the resolved leaf direction + hinge.
  const inward = leafInwardSign(a, b, centroid);
  const sw = swingGeom(w, inward, gate.hinge, gate.swing);
  const d = sw.d;
  return (
    <Group x={center.x * scale} y={center.y * scale} rotation={angDeg} onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)}>
      <Rect x={-w / 2} y={-Math.max(8, w * 0.5)} width={w * 1.1} height={Math.max(16, w)} fill="transparent" />
      {/* gap — painted in canvas bg so the fence reads as broken here */}
      <Line points={[-w / 2, 0, w / 2, 0]} stroke={palette.opMask} strokeWidth={5} />

      {type === 'swing' && (
        <>
          {/* solid leaf, full opening width, perpendicular to the fence */}
          <Line points={[sw.hx, 0, sw.hx, d * w]} stroke={accent} strokeWidth={3} />
          {/* dashed 90° swing arc, radius = width, from leaf tip to the far jamb */}
          <Arc x={sw.hx} y={0} innerRadius={w} outerRadius={w} angle={90} rotation={sw.rotation}
            stroke={accent} strokeWidth={1.2} dash={[5, 4]} />
        </>
      )}
      {type === 'double' && (
        <>
          {/* two leaves, each half the opening, meeting in the middle */}
          <Line points={[-w / 2, 0, -w / 2, d * w / 2]} stroke={accent} strokeWidth={3} />
          <Arc x={-w / 2} y={0} innerRadius={w / 2} outerRadius={w / 2} angle={90} rotation={d === 1 ? 0 : -90}
            stroke={accent} strokeWidth={1.2} dash={[5, 4]} />
          <Line points={[w / 2, 0, w / 2, d * w / 2]} stroke={accent} strokeWidth={3} />
          <Arc x={w / 2} y={0} innerRadius={w / 2} outerRadius={w / 2} angle={90} rotation={d === 1 ? 90 : 180}
            stroke={accent} strokeWidth={1.2} dash={[5, 4]} />
        </>
      )}
      {type === 'sliding' && (
        <>
          {/* leaf slid to one side, parallel to the fence (on the inward side) */}
          <Line points={[w / 2, d * pr * 1.6, w / 2 + w, d * pr * 1.6]} stroke={accent} strokeWidth={4} lineCap="round" />
          {/* track along the opening */}
          <Line points={[-w / 2, -d * pr * 1.4, w / 2, -d * pr * 1.4]} stroke={accent} strokeWidth={1} dash={[3, 3]} />
        </>
      )}

      {/* posts at gate ends */}
      <Circle x={-w / 2} y={0} radius={pr} fill={palette.postFill} />
      <Circle x={w / 2} y={0} radius={pr} fill={palette.postFill} />
      {selected && <Circle x={0} y={0} radius={4} fill={BLUE} />}
    </Group>
  );
}

// ---------------- STAIRS ----------------
const STAIRLINE = '#475569'; // charcoal — architectural stair line color (not blue)

// Plan symbol following drafting convention: footprint + thin tread lines, a
// walk line down the path with a dot at the start and an arrowhead at the up
// end plus an inside "UP" label. When selected it shows width / run / rotate
// handles (constant screen size, kept upright regardless of stair rotation).
export function StairShape({ stair, scale, selected, onSelect, onWidthDown, onRunDown, onRotateDown, palette = DEFAULT_PALETTE, zoom = 1 }) {
  const g = stairGeometry(stair);
  const P = (pt) => [pt.x * scale, pt.y * scale];
  const inv = 1 / (zoom || 1);
  const rz = g.resize || {};
  const cx = (g.outline[0].x + g.outline[2].x) / 2;
  const rotAt = { x: cx, y: g.outline[0].y - 1.4 };
  const setCur = (c) => (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = c; };
  const Handle = ({ at, down, circle }) => (
    <Group x={at.x * scale} y={at.y * scale} scaleX={inv} scaleY={inv} rotation={-(stair.rotation || 0)}
      onMouseDown={down} onTouchStart={down} onMouseEnter={setCur(circle ? 'grab' : 'nwse-resize')} onMouseLeave={setCur('')}>
      {circle
        ? <Circle radius={5.5} fill="#fff" stroke={BLUE} strokeWidth={2} hitStrokeWidth={22} />
        : <Rect x={-5} y={-5} width={10} height={10} cornerRadius={2} fill="#fff" stroke={BLUE} strokeWidth={2} hitStrokeWidth={22} />}
    </Group>
  );
  const ax = g.arrow && P(g.arrow.from);
  return (
    <Group x={stair.x * scale} y={stair.y * scale} rotation={stair.rotation || 0}>
      <Line points={g.outline.flatMap(P)} closed stroke={STAIRLINE} strokeWidth={selected ? 1.6 : 1.3}
        fill={palette.opMask} hitStrokeWidth={6} onMouseDown={onSelect} onTouchStart={onSelect} />
      {g.treads.map((t, i) => (
        <Line key={i} points={t.poly.flatMap(P)} closed stroke={STAIRLINE} strokeWidth={0.9}
          fill={t.landing ? 'rgba(100,116,139,0.12)' : 'transparent'} listening={false} />
      ))}
      {g.post && <Circle x={0} y={0} radius={g.post.r * scale} fill={STAIRLINE} listening={false} />}
      {g.arrow && (
        <>
          <Arrow points={[...ax, ...P(g.arrow.to)]} pointerLength={8} pointerWidth={7} stroke={STAIRLINE} fill={STAIRLINE} strokeWidth={1.4} listening={false} />
          <Circle x={ax[0]} y={ax[1]} radius={3} fill={STAIRLINE} listening={false} />
          {/* "UP" inside the run, kept upright when the stair is rotated */}
          <Group x={ax[0]} y={ax[1]} rotation={-(stair.rotation || 0)} listening={false}>
            <Text x={5} y={-4} text="UP" fontSize={9} fontStyle="700" fill={STAIRLINE} />
          </Group>
        </>
      )}
      {selected && (
        <>
          {rz.widthAt && <Handle at={rz.widthAt} down={onWidthDown} />}
          {rz.runAt && <Handle at={rz.runAt} down={onRunDown} />}
          <Handle at={rotAt} down={onRotateDown} circle />
        </>
      )}
    </Group>
  );
}

// ---------------- LABEL (leader-line callout) ----------------
// An arrow points at the anchored spot; a leader line runs to a draggable pill.
// The pill stays a constant screen size (counter-scaled by zoom). Colours for the
// line, arrow and pill border are per-label and set via the Properties panel.
export function LabelShape({ label, scale, selected, onPillDown, onAnchorDown, zoom = 1 }) {
  const a = label.anchor, p = label.pos;
  const ax = a.x * scale, ay = a.y * scale, px = p.x * scale, py = p.y * scale;
  const text = label.text || ' ';
  const fs = label.fontSize || 12;
  const lineColor = label.line || NAVY;
  const arrowColor = label.arrow || lineColor;
  const borderColor = label.border || BLUE;
  const inv = 1 / (zoom || 1);
  // multi-line: width from the longest row, height from row count
  const rows = String(text).split('\n');
  const longest = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const lh = fs * 1.35;
  const w = Math.max(26, longest * fs * 0.58 + 14);
  const hh = rows.length * lh + 8;
  const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
  return (
    <Group>
      {/* leader line + arrowhead at the anchor (drawn under the pill) */}
      <Arrow points={[px, py, ax, ay]} pointerLength={9} pointerWidth={8} stroke={lineColor} fill={arrowColor}
        strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      {selected && (
        <Circle x={ax} y={ay} radius={5} fill="#fff" stroke={BLUE} strokeWidth={2}
          onMouseDown={onAnchorDown} onTouchStart={onAnchorDown} onMouseEnter={setCur('move')} onMouseLeave={setCur('')} />
      )}
      {/* draggable pill (constant screen size) */}
      <Group x={px} y={py} scaleX={inv} scaleY={inv}
        onMouseDown={onPillDown} onTouchStart={onPillDown} onMouseEnter={setCur('move')} onMouseLeave={setCur('')}>
        <Rect x={-w / 2} y={-hh / 2} width={w} height={hh} cornerRadius={5} fill="#fff"
          stroke={selected ? BLUE : borderColor} strokeWidth={selected ? 2 : 1.5}
          shadowColor="#0a2540" shadowBlur={3} shadowOpacity={0.16} />
        <Text x={-w / 2} y={-hh / 2 + 4} width={w} align="center" text={text} fontSize={fs} lineHeight={1.35} fontStyle="600" fill="#1e293b" listening={false} />
      </Group>
    </Group>
  );
}
