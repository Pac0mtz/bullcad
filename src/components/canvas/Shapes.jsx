import React from 'react';
import { Group, Line, Rect, Circle, Text, Arc, Arrow } from 'react-konva';
import { dist, lerp, angleOf, dirNormal, formatFeetInches, postsAlong, FENCE_TYPES, windowBars, wallDimGeometry, wallOpeningDimGeometry, WINDOW_STYLES, stairGeometry, EQUIPMENT } from '../../utils/geometry.js';

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

// Dimension numbers are tuned to look right at ~127% zoom and then scale WITH the
// plan, so zooming in keeps them proportional to the walls (they no longer look
// tiny next to the enlarged drawing) and zooming out keeps them tucked in. The
// group scale is constant (independent of zoom), so text + end markers ride the
// plan's own zoom — never counter-scaled to a fixed screen size, never hidden.
const DIM_REF = 1.27;            // the "127%" the numbers are sized for
const dimScale = () => 1 / DIM_REF;
const DIM_FS = 7; // one small size for every dimension number

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
  const w = txt.length * 6.2 + 9;
  const inv = dimScale(zoom);
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180; // keep text upright
  return (
    <Group x={cx} y={cy} rotation={angle} scaleX={inv} scaleY={inv} listening={false}>
      <Text x={-w / 2} y={-4} width={w} align="center" text={txt} fontSize={DIM_FS} fontFamily="Poppins"
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
  const w = g.label.text.length * 6.2 + 9; // Poppins runs wider than the old font
  const inv = dimScale(zoom);
  const gapFt = ((w / 2 + 6) * inv) / S; // gap so the line clears the number
  const segs = brokenLine(g.line[0], g.line[1], g.label, gapFt);
  const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
  return (
    <Group>
      {g.witness.map((seg, i) => (
        <Line key={'w' + i} points={[...P(seg[0]), ...P(seg[1])]} stroke={color} strokeWidth={0.5} opacity={0.6} strokeScaleEnabled={false} listening={false} />
      ))}
      {/* dim line broken around the number (───▶ 13' 6" ◀───); on tight runs the
          label fills the line so no center line is drawn — never strikes text */}
      {segs.map((s, i) => <Line key={'dl' + i} points={[...P(s.a), ...P(s.b)]} stroke={color} strokeWidth={0.5} strokeScaleEnabled={false} listening={false} />)}
      {/* 45° slash ticks at each end (architectural style) */}
      {g.slashes.map((sl, i) => <Line key={'sl' + i} points={[...P(sl[0]), ...P(sl[1])]} stroke={color} strokeWidth={0.5} strokeScaleEnabled={false} listening={false} />)}
      {/* draggable hit area (pill removed) — drag perpendicular to set the offset */}
      <Group x={g.label.x * S} y={g.label.y * S} rotation={g.label.angle} scaleX={inv} scaleY={inv}
        onMouseDown={onPillDown} onTouchStart={onPillDown}
        onMouseEnter={onPillDown && setCur('move')} onMouseLeave={onPillDown && setCur('')}>
        <Rect x={-w / 2} y={-6.5} width={w} height={13} fill="rgba(0,0,0,0.001)" />
        <Text x={-w / 2} y={-4} width={w} align="center" text={g.label.text} fontSize={DIM_FS} fontFamily="Poppins" fontStyle="500" fill={color} listening={false} />
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
        <Line key={'w' + i} points={[...P(s[0]), ...P(s[1])]} stroke={color} strokeWidth={0.45} opacity={0.5} strokeScaleEnabled={false} listening={false} />
      ))}
      {g.segments.map((seg, i) => {
        const lw = seg.label.text.length * 5.8 + 8;
        const mid = { x: (seg.line[0].x + seg.line[1].x) / 2, y: (seg.line[0].y + seg.line[1].y) / 2 };
        const segs = brokenLine(seg.line[0], seg.line[1], mid, ((lw / 2 + 5) * inv) / S);
        return segs.map((s, j) => <Line key={'l' + i + '_' + j} points={[...P(s.a), ...P(s.b)]} stroke={color} strokeWidth={0.5} strokeScaleEnabled={false} listening={false} />);
      })}
      {/* 45° slash ticks at each station (architectural style) */}
      {g.ticks.map((tk, i) => <Line key={'tk' + i} points={[...P(tk[0]), ...P(tk[1])]} stroke={color} strokeWidth={0.5} strokeScaleEnabled={false} listening={false} />)}
      {g.segments.map((seg, i) => {
        const w = seg.label.text.length * 5 + 6;
        return (
          <Group key={'g' + i} x={seg.label.x * S} y={seg.label.y * S} rotation={seg.label.angle} scaleX={inv} scaleY={inv}
            onMouseDown={onPillDown} onTouchStart={onPillDown}
            onMouseEnter={onPillDown && setCur('move')} onMouseLeave={onPillDown && setCur('')}>
            <Rect x={-w / 2} y={-6} width={w} height={12} fill="rgba(0,0,0,0.001)" />
            <Text x={-w / 2} y={-4} width={w} align="center" text={seg.label.text} fontSize={DIM_FS} fontFamily="Poppins" fontStyle="500" fill={color} listening={false} />
          </Group>
        );
      })}
    </Group>
  );
}

// ---------------- WALL ----------------
// Architectural poché: the wall is a single solid band the width of its real
// thickness (no centerline / no light border). Square caps fill shared corners.
export function WallShape({ wall, scale, selected, hovered, onSelect, onHover, palette = DEFAULT_PALETTE, seg = null, poly = null }) {
  // `poly` is the wall body as a mitered, filled polygon (clean joints at any
  // junction). Fall back to a thick stroked centerline when it isn't available.
  // hover (Select tool) reads like the selection — the whole wall body turns blue
  // (just no handles), so it's obvious what a click will grab.
  const fill = (selected || hovered) ? palette.wallLineSel : palette.wallLine;
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(wall.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};
  const edge = fill;
  const ew = 0.6;
  if (poly && poly.points && poly.points.length >= 3) {
    const pts = poly.points.flatMap((p) => [p.x * scale, p.y * scale]);
    return (
      <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
        <Line points={pts} closed fill={fill} stroke={edge} strokeWidth={ew} lineJoin="round" perfectDrawEnabled={false} shadowForStrokeEnabled={false} />
      </Group>
    );
  }
  const a = seg?.a || wall.a, b = seg?.b || wall.b;
  const th = wallBandWidth(wall, scale);
  return (
    <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
      <Line points={[a.x * scale, a.y * scale, b.x * scale, b.y * scale]} stroke={fill} strokeWidth={th} lineCap="square"
        hitStrokeWidth={Math.max(16, th)} />
    </Group>
  );
}

// ---------------- OPENING (door / window / opening) ----------------
export function OpeningShape({ op, wall, scale, selected, hovered, onSelect, onHover, palette = DEFAULT_PALETTE, centroid = null, seg = null }) {
  if (!wall) return null;
  const a = seg?.a || wall.a, b = seg?.b || wall.b;
  const center = lerp(a, b, op.t);
  const offX = 0, offY = 0;
  const angDeg = (angleOf(a, b) * 180) / Math.PI;
  const w = op.width * scale;
  const th = wallBandWidth(wall, scale);
  const cut = th + 2; // mask a hair wider than the wall so no slivers remain
  // hover reads like the selection (blue accent), just without handles
  const accent = (selected || hovered) ? palette.opStrokeSel : palette.opStroke;
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(op.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};

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
    <Group x={center.x * scale + offX} y={center.y * scale + offY} rotation={angDeg} onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
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
export function FenceShape({ fence, scale, selected, hovered, onSelect, onHover, palette = DEFAULT_PALETTE, seg = null, gates = [] }) {
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
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(fence.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};
  return (
    <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
      <Line points={pts} stroke={col} strokeWidth={selected ? 5 : 3.5} lineCap="round"
        dash={dash} hitStrokeWidth={14} />
      {hovered && !selected && <Line points={pts} stroke={BLUE} strokeWidth={3.5} lineCap="round" opacity={0.85} dash={dash} />}
      {selected && <Line points={pts} stroke={BLUE} strokeWidth={1.5} lineCap="round" dash={[6, 5]} />}
      {posts.map((p, i) => (
        <Rect key={i} x={p.x * scale - ps / 2} y={p.y * scale - ps / 2} width={ps} height={ps}
          fill={palette.postFill} cornerRadius={1} />
      ))}
    </Group>
  );
}

// ------------- POST (an individually placed fence post) -------------
export function PostShape({ post, fence, scale, selected, hovered, onSelect, onHover, onDelete, palette = DEFAULT_PALETTE, seg = null, zoom = 1 }) {
  if (!fence) return null;
  const a = seg?.a || fence.a, b = seg?.b || fence.b;
  const c = lerp(a, b, post.t);
  const ps = Math.max(5, 0.55 * scale); // a touch larger than the auto posts so a placed post reads as deliberate
  const inv = 1 / (zoom || 1);
  const setCur = (cur) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = cur; };
  const hi = selected || hovered;
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(post.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};
  const moveArrows = [[0, -5, 0, 5], [-5, 0, 5, 0], [0, -5, -1.8, -2.9], [0, -5, 1.8, -2.9], [0, 5, -1.8, 2.9], [0, 5, 1.8, 2.9], [-5, 0, -2.9, -1.8], [-5, 0, -2.9, 1.8], [5, 0, 2.9, -1.8], [5, 0, 2.9, 1.8]];
  return (
    <Group>
      <Group onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
        <Rect x={c.x * scale - ps / 2} y={c.y * scale - ps / 2} width={ps} height={ps}
          fill={post.color || palette.postFill} stroke={hi ? BLUE : '#0a2540'} strokeWidth={hi ? 2 : 0.75}
          cornerRadius={1} hitStrokeWidth={16} />
      </Group>
      {selected && (
        <Group x={c.x * scale} y={c.y * scale} scaleX={inv} scaleY={inv}>
          {/* move handle (drag to slide the post along its fence) */}
          <Group x={-13} y={-15} onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} onMouseEnter={setCur('move')} onMouseLeave={setCur('')}>
            <Circle radius={8} fill={BLUE} stroke="#fff" strokeWidth={1.5} hitStrokeWidth={18} />
            {moveArrows.map((p, i) => <Line key={i} points={p} stroke="#fff" strokeWidth={1.2} lineCap="round" listening={false} />)}
          </Group>
          {/* delete ✕ */}
          <Group x={13} y={-15} onMouseDown={(e) => { e.cancelBubble = true; onDelete && onDelete(e); }} onTouchStart={(e) => { e.cancelBubble = true; onDelete && onDelete(e); }} onMouseEnter={setCur('pointer')} onMouseLeave={setCur('')}>
            <Circle radius={8} fill="#ef4444" stroke="#fff" strokeWidth={1.5} hitStrokeWidth={18} />
            <Line points={[-3, -3, 3, 3]} stroke="#fff" strokeWidth={1.6} lineCap="round" listening={false} />
            <Line points={[-3, 3, 3, -3]} stroke="#fff" strokeWidth={1.6} lineCap="round" listening={false} />
          </Group>
        </Group>
      )}
    </Group>
  );
}

// ---------------- GATE ----------------
export function GateShape({ gate, fence, scale, selected, hovered, onSelect, onHover, palette = DEFAULT_PALETTE, seg = null, centroid = null }) {
  if (!fence) return null;
  const a = seg?.a || fence.a, b = seg?.b || fence.b;
  const center = lerp(a, b, gate.t);
  const angDeg = (angleOf(a, b) * 180) / Math.PI;
  const w = gate.width * scale;
  const ft = FENCE_TYPES[fence.fenceType] || FENCE_TYPES.wood;
  const mat = gate.color || fence.color || ft.color;
  const accent = (selected || hovered) ? BLUE : mat;
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(gate.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};
  const type = gate.gateType || 'swing';
  const pr = Math.max(2.5, 0.3 * scale);
  // swing toward the enclosed side (away from the dimension strings) by default;
  // hinge/swing overrides flip it. `sw` holds the resolved leaf direction + hinge.
  const inward = leafInwardSign(a, b, centroid);
  const sw = swingGeom(w, inward, gate.hinge, gate.swing);
  const d = sw.d;
  return (
    <Group x={center.x * scale} y={center.y * scale} rotation={angDeg} onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
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
export function StairShape({ stair, scale, selected, hovered, onSelect, onHover, onWidthDown, onRunDown, onRotateDown, palette = DEFAULT_PALETTE, zoom = 1 }) {
  const g = stairGeometry(stair);
  const P = (pt) => [pt.x * scale, pt.y * scale];
  const inv = 1 / (zoom || 1);
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(stair.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};
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
      <Line points={g.outline.flatMap(P)} closed stroke={hovered && !selected ? BLUE : STAIRLINE} strokeWidth={(selected || hovered) ? 1.8 : 1.3}
        fill={palette.opMask} hitStrokeWidth={6} onMouseDown={onSelect} onTouchStart={onSelect} {...hov} />
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
export function LabelShape({ label, scale, selected, hovered, onPillDown, onAnchorDown, onHover, zoom = 1 }) {
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
        onMouseDown={onPillDown} onTouchStart={onPillDown}
        onMouseEnter={(e) => { onHover && onHover(label.id); setCur('move')(e); }}
        onMouseLeave={(e) => { onHover && onHover(null); setCur('')(e); }}>
        <Rect x={-w / 2} y={-hh / 2} width={w} height={hh} cornerRadius={5} fill="#fff"
          stroke={(selected || hovered) ? BLUE : borderColor} strokeWidth={(selected || hovered) ? 2 : 1.5}
          shadowColor="#0a2540" shadowBlur={3} shadowOpacity={0.16} />
        <Text x={-w / 2} y={-hh / 2 + 4} width={w} align="center" text={text} fontSize={fs} lineHeight={1.35} fontStyle="600" fill="#1e293b" listening={false} />
      </Group>
    </Group>
  );
}

// ---------------- RESTORATION EQUIPMENT (air mover / dehu / scrubber / heater / moisture) ----------------
// A constant-screen-size symbol dropped on the drying map: a colored token with
// the kind code + auto-number (AM1, DH1…). Air movers show an airflow arrow that
// follows their rotation; the code label stays upright.
export function EquipmentShape({ equip, scale, selected, hovered, onSelect, onHover, zoom = 1 }) {
  const meta = EQUIPMENT[equip.kind] || EQUIPMENT.airMover;
  const inv = 1 / (zoom || 1);
  const r = 13; // screen px radius (constant at any zoom)
  const col = meta.color;
  const sel = selected || hovered;
  const label = meta.code + (equip.num || '');
  const hov = onHover ? {
    onMouseEnter: (e) => { onHover(equip.id); const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; },
    onMouseLeave: (e) => { onHover(null); const st = e.target.getStage(); if (st) st.container().style.cursor = ''; },
  } : {};
  return (
    <Group x={equip.x * scale} y={equip.y * scale} onMouseDown={(e) => onSelect(e)} onTouchStart={(e) => onSelect(e)} {...hov}>
      {/* token + (rotatable) airflow arrow */}
      <Group scaleX={inv} scaleY={inv} rotation={equip.rotation || 0}>
        {meta.dir && <Line points={[0, -r - 8, -5, -r - 1, 5, -r - 1]} closed fill={col} listening={false} />}
        <Circle radius={r} fill="#fff" stroke={col} strokeWidth={sel ? 2.6 : 1.8} hitStrokeWidth={10} />
        <Circle radius={r} fill={col} opacity={0.14} listening={false} />
        {sel && <Circle radius={r + 3} stroke={col} strokeWidth={1} dash={[3, 2]} listening={false} />}
      </Group>
      {/* code + number, kept upright regardless of rotation */}
      <Group scaleX={inv} scaleY={inv} listening={false}>
        <Text x={-r} y={-5} width={2 * r} align="center" text={label} fontSize={10} fontStyle="700" fill={col} />
      </Group>
    </Group>
  );
}
