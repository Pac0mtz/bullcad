// All world coordinates are stored in FEET. Rendering multiplies by a
// pixels-per-foot scale (2D) or uses feet directly (3D).

export const uid = (p = 'id') =>
  p + '_' + Math.random().toString(36).slice(2, 9);

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// Point at a distance `d` (feet) along segment a->b from a.
export const pointAtDist = (a, b, d) => {
  const L = dist(a, b) || 1;
  return lerp(a, b, d / L);
};

// Angle of segment in radians.
export const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

// Unit vector + normal for a segment.
export const dirNormal = (a, b) => {
  const L = dist(a, b) || 1;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  return { ux, uy, nx: -uy, ny: ux, L };
};

export const snap = (v, grid) => Math.round(v / grid) * grid;
export const snapPt = (p, grid) => ({ x: snap(p.x, grid), y: snap(p.y, grid) });

// Snap a point to the nearest existing node within `tol` feet.
export const snapToNodes = (p, nodes, tol) => {
  let best = null;
  let bestD = tol;
  for (const n of nodes) {
    const d = dist(p, n);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best ? { x: best.x, y: best.y, snapped: true } : { ...p, snapped: false };
};

// Project point p onto segment a->b, returns { t (0..1), point, distance }.
export const projectOnSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point, distance: dist(p, point) };
};

// Format a length in feet, to the nearest 1/8", showing the fractional inch so
// both the whole and the fraction read, e.g. 12.54 -> 12' 6 1/2".
//   opts.unit === 'in'  -> inches only, e.g. 150 1/2"
//   opts.denom          -> rounding precision (default 8 = nearest 1/8")
export const formatFeetInches = (feet, opts = {}) => {
  const denom = opts.denom || 8;
  const sign = feet < 0 ? '-' : '';
  const totalInches = Math.abs(feet) * 12;
  let units = Math.round(totalInches * denom);   // length in 1/denom-inch units
  const wholeInches = Math.floor(units / denom);
  let num = units - wholeInches * denom;          // fractional eighths 0..denom-1
  let den = denom;
  while (num && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; } // simplify
  const frac = num ? ` ${num}/${den}` : '';
  if (opts.unit === 'in') return `${sign}${wholeInches}${frac}"`;
  const ft = Math.floor(wholeInches / 12);
  const inch = wholeInches - ft * 12;
  return `${sign}${ft}' ${inch}${frac}"`;
};

export const formatFeet1 = (feet) => `${feet.toFixed(1)} ft`;

// Posts along a fence segment a->b at `spacing` feet, including both ends.
export const postsAlong = (a, b, spacing) => {
  const L = dist(a, b);
  const out = [];
  if (L < 0.01) return out;
  const n = Math.max(1, Math.ceil(L / spacing - 1e-6));
  for (let i = 0; i <= n; i++) {
    out.push(lerp(a, b, i / n));
  }
  return out;
};

// Fence type catalog: default color, default height (ft), 3D `style`, and the
// `colors` a type can be finished in (first entry is the default). Styles:
// 'solid' (panels), 'pickets' (spaced verticals), 'mesh' (chain-link), 'slat'
// (modern aluminum slats).
// `cap` (picket styles only) is the default top profile — see PICKET_CAPS. Wood
// pickets are wide boards; metal pickets are thin bars (set by `slim`). `rails`
// drives the horizontal-rail (ranch / estate) style. `slat` runs boards
// horizontally; `tight` butts them together for full privacy.
export const FENCE_TYPES = {
  wood:      { label: 'Wood Privacy',  height: 6, style: 'board',   color: '#b07a45', colors: ['#b07a45', '#8a5a32', '#9c6b3f'] },
  cedar:     { label: 'Cedar',         height: 6, style: 'board',   color: '#c98a5e', colors: ['#c98a5e', '#b9744a', '#d9a877'] },
  woodhoriz: { label: 'Horizontal Slat',    height: 6, style: 'slat', color: '#b07a45', colors: ['#b07a45', '#8a5a32', '#9c6b3f', '#6b5d52'] },
  woodhorizp:{ label: 'Horizontal Privacy', height: 6, style: 'slat', tight: true, color: '#9c6b3f', colors: ['#9c6b3f', '#b07a45', '#8a5a32', '#6b5d52'] },
  picket:    { label: 'Wood Picket',   height: 4, style: 'pickets', cap: 'dogear', color: '#eae4d6', colors: ['#eae4d6', '#ffffff', '#c98a5e'] },
  ranch:     { label: 'Ranch Rail',    height: 4, style: 'rail',    rails: 3,      color: '#caa472', colors: ['#caa472', '#b07a45', '#e8ecf1'] },
  vinyl:     { label: 'Vinyl',         height: 6, style: 'solid',   color: '#e8ecf1', colors: ['#e8ecf1', '#d9cfb8', '#aeb6bf'] },
  composite: { label: 'Composite',     height: 6, style: 'board',   color: '#6b5d52', colors: ['#6b5d52', '#3f3a36', '#8a7d6e', '#9a9a9a'] },
  chainlink: { label: 'Chain Link',    height: 4, style: 'mesh',    color: '#9aa6b2', colors: ['#9aa6b2', '#3a4048', '#2f4a39', '#5a4632'] },
  iron:      { label: 'Wrought Iron',  height: 5, style: 'pickets', cap: 'point', slim: true, color: '#2b3340', colors: ['#2b3340', '#1f2937'] },
  aluminum:  { label: 'Aluminum',      height: 5, style: 'pickets', cap: 'flat',  slim: true, color: '#23272e', colors: ['#23272e', '#4a3b2a', '#5a4632', '#e5e7eb'] },
  alumslat:  { label: 'Aluminum Slat', height: 6, style: 'slat',    color: '#3a3f47', colors: ['#3a3f47', '#23272e', '#5a4632', '#9aa3ad'] },
};

// Picket top profiles. The same outline (picketOutline) drives the 3D extrude,
// the 2D elevation glyph on the fence cards, and the PDF legend so a "Gothic"
// picket looks identical everywhere.
export const PICKET_CAPS = {
  dogear: { label: 'Dog-Ear' },
  gothic: { label: 'Gothic Point' },
  french: { label: 'French Gothic' },
  point:  { label: 'Pointed' },
  flat:   { label: 'Flat Top' },
};
export const PICKET_CAP_ORDER = ['dogear', 'gothic', 'french', 'point', 'flat'];

// Front silhouette of a single picket, centered on x=0, base at y=0, tip at y=h,
// returned as [x,y] points (closed loop). `cap` shapes the top.
export function picketOutline(cap, w, h) {
  const hw = w / 2;
  if (cap === 'flat' || !cap) return [[-hw, 0], [-hw, h], [hw, h], [hw, 0]];
  const capH = cap === 'dogear' ? w * 0.4
    : cap === 'point' ? w * 0.7
    : cap === 'gothic' ? w * 1.1
    : w * 1.0; // french
  const sh = h - capH; // shoulder height where shaping begins
  const top = [];
  if (cap === 'dogear') top.push([-hw + capH, h], [hw - capH, h]);
  else if (cap === 'point') top.push([0, h]);
  else if (cap === 'gothic') top.push([-hw * 0.55, sh + capH * 0.45], [0, h], [hw * 0.55, sh + capH * 0.45]);
  else /* french */ top.push([-hw, sh + capH * 0.5], [-hw * 0.42, h - capH * 0.12], [0, h], [hw * 0.42, h - capH * 0.12], [hw, sh + capH * 0.5]);
  return [[-hw, 0], [-hw, sh], ...top, [hw, sh], [hw, 0]];
}

// Wall finish colors for the 3D model (paint / siding tones).
export const WALL_COLORS = ['#e2e8f0', '#ffffff', '#d8c9af', '#cdb89a', '#b9c4cf', '#c8a98a', '#9fb1a5', '#8a93a3'];

// Chain-link privacy slat colors (vinyl insert tones): green, brown, tan,
// charcoal, white, gray.
export const SLAT_COLORS = ['#2f6b3d', '#6f5235', '#c9b790', '#3a3f47', '#e8ecf1', '#9aa3ad'];

// Gate styles (drawn in 2D and 3D).
export const GATE_TYPES = {
  swing:   { label: 'Swing' },
  double:  { label: 'Double swing' },
  sliding: { label: 'Sliding' },
};
export const GATE_TYPE_ORDER = ['swing', 'double', 'sliding'];

export const OPENING_DEFAULTS = {
  door: { width: 3, height: 6.75, label: 'Door' },
  window: { width: 3, height: 4, sill: 3, label: 'Window' },
  opening: { width: 4, height: 7, label: 'Opening' },
};

// ----- Supported window styles -----
// cols/rows = structural sash divisions (vertical/horizontal mullions). `hinge`
// marks an operable side (casement/awning). `project` + `depth` mark windows
// that bump out from the wall in 3D (bay / garden). w/h/sill are placement
// defaults in feet. The same catalog drives the 2D plan and the 3D model.
export const WINDOW_STYLES = {
  single_hung: { label: 'Single-hung', cols: 1, rows: 2, w: 3,   h: 4.5, sill: 2.5 },
  double_hung: { label: 'Double-hung', cols: 1, rows: 2, w: 3,   h: 4.5, sill: 2.5 },
  slider:   { label: 'Slider',   cols: 2, rows: 1, w: 4,   h: 3,   sill: 3 },
  casement: { label: 'Casement', cols: 1, rows: 1, w: 2.5, h: 4.5, sill: 2.5, hinge: 'side' },
  awning:   { label: 'Awning',   cols: 1, rows: 1, w: 3,   h: 2.5, sill: 4,   hinge: 'top' },
  bay:      { label: 'Bay',      cols: 3, rows: 1, w: 6,   h: 4,   sill: 2,   project: 'bay',    depth: 1.6 },
  garden:   { label: 'Garden',   cols: 1, rows: 1, w: 4,   h: 3.5, sill: 3,   project: 'garden', depth: 1.4 },
};
export const WINDOW_STYLE_ORDER = ['double_hung', 'single_hung', 'slider', 'casement', 'awning', 'bay', 'garden'];
const FALLBACK_WINDOW_STYLE = 'slider';

// Muntin/mullion bar positions for a window style, as fractions 0..1 across
// the glazing. `major` bars are the structural sash divisions; non-major bars
// come from the optional colonial grille (`grid`). Shared by 2D + 3D so both
// views stay consistent.
export function windowBars(style, grid) {
  const st = WINDOW_STYLES[style] || WINDOW_STYLES[FALLBACK_WINDOW_STYLE];
  const V = [];
  const H = [];
  for (let i = 1; i < st.cols; i++) V.push({ at: i / st.cols, major: true });
  for (let j = 1; j < st.rows; j++) H.push({ at: j / st.rows, major: true });
  if (grid) {
    const gx = st.cols * 2;
    const gy = st.rows * 2;
    for (let i = 1; i < gx; i++) if (i % 2) V.push({ at: i / gx, major: false });
    for (let j = 1; j < gy; j++) if (j % 2) H.push({ at: j / gy, major: false });
  }
  return { V, H, hinge: st.hinge, label: st.label };
}

// Average of a set of points (building center, used to tell inside from outside).
export const centroidOf = (pts) => {
  if (!pts.length) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
};

// Outward unit normal of a wall (points away from the building centroid).
function outwardNormal(a, b, centroid) {
  const L = dist(a, b) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const sign = nx * (centroid.x - mid.x) + ny * (centroid.y - mid.y) < 0 ? 1 : -1;
  return { x: nx * sign, y: ny * sign };
}

// How far the *material centerline* sits from the drawn (datum) line, given the
// justification. 'center' keeps the line on the centerline; 'interior' puts the
// drawn line on the inner face (material bumps outward); 'exterior' the reverse.
// Returns a vector to add to the wall's a/b to get the material centerline.
export function justifyOffsetVec(a, b, thickness, justify, centroid) {
  if (!justify || justify === 'center') return { x: 0, y: 0 };
  const cFO = justify === 'interior' ? thickness / 2 : -thickness / 2;
  const out = outwardNormal(a, b, centroid);
  return { x: out.x * cFO, y: out.y * cFO };
}

// Intersection of two infinite lines, each given as point + direction. Returns
// null when (near-)parallel.
function lineIntersect(p1, d1, p2, d2) {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

// Offset a run of connected segments to a justified face WITHOUT tearing the
// corners. Each segment's drawn line is shifted by its justify offset; every
// node shared by exactly two segments is then placed at the miter (intersection
// of the two shifted lines) so faces stay continuous at any angle and any
// thickness. Free ends (no neighbour) keep the plain shifted endpoint — they are
// not over-extended. T/X junctions (3+ segments) fall back to the plain point.
// `segs` is [{ id, a, b }]; `thicknessOf(seg)` gives each body width (ft).
// Returns Map(id -> { a, b, aJoined, bJoined }) — the mitered endpoints plus a
// flag per end marking whether it shares a corner with a neighbour (used by the
// 3D builder to overlap boxes into a clean corner). Centered runs keep their
// original endpoints but still report the join flags.
export function justifiedSegments(segs, justify, centroid, thicknessOf) {
  const out = new Map();
  // each segment may carry its own `justify` (per-wall override); else the global
  const jOf = (s) => s.justify || justify || 'center';
  const isCentered = (s) => { const j = jOf(s); return !j || j === 'center'; };
  const byId = new Map(segs.map((s) => [s.id, s]));
  const key = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const nodes = new Map(); // node key -> [{ id, end }]
  const lines = new Map(); // id -> { d } (unit direction of drawn line)
  for (const s of segs) {
    const off = isCentered(s) ? { x: 0, y: 0 } : justifyOffsetVec(s.a, s.b, thicknessOf(s), jOf(s), centroid);
    const a = { x: s.a.x + off.x, y: s.a.y + off.y };
    const b = { x: s.b.x + off.x, y: s.b.y + off.y };
    const L = dist(s.a, s.b) || 1;
    lines.set(s.id, { d: { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L } });
    out.set(s.id, { a, b, aJoined: false, bJoined: false }); // default = plain (free ends)
    for (const end of ['a', 'b']) {
      const k = key(s[end]);
      if (!nodes.has(k)) nodes.set(k, []);
      nodes.get(k).push({ id: s.id, end });
    }
  }
  for (const members of nodes.values()) {
    if (members.length !== 2) continue; // free end or junction → leave plain
    const [m1, m2] = members;
    const r1 = out.get(m1.id), r2 = out.get(m2.id);
    // miter when at least one side is offset (two centered ends already coincide)
    if (!isCentered(byId.get(m1.id)) || !isCentered(byId.get(m2.id))) {
      const ix = lineIntersect(r1[m1.end], lines.get(m1.id).d, r2[m2.end], lines.get(m2.id).d);
      if (ix) { r1[m1.end] = ix; r2[m2.end] = ix; }
    }
    r1[m1.end + 'Joined'] = true;
    r2[m2.end + 'Joined'] = true;
  }
  // T-junctions: a wall end that lands mid-span of another wall — extend it into
  // the through-wall so the bands merge cleanly instead of leaving an offset gap
  for (const s of segs) {
    const r = out.get(s.id);
    for (const end of ['a', 'b']) {
      if (r[end + 'Joined']) continue; // already mitered at a 2-way corner
      const P = s[end];
      let through = null;
      for (const o of segs) {
        if (o.id === s.id) continue;
        const pr = projectOnSegment(P, o.a, o.b);
        if (pr.distance < 0.12 && pr.t > 0.02 && pr.t < 0.98) { through = o; break; }
      }
      if (!through) continue;
      const other = end === 'a' ? 'b' : 'a';
      let ox = s[end].x - s[other].x, oy = s[end].y - s[other].y; // direction into the junction
      const oL = Math.hypot(ox, oy) || 1; ox /= oL; oy /= oL;
      // Extend to the through-wall's far BAND FACE, not just past its centerline.
      // The through-wall band is offset by its own justify, so a fixed thickness/2
      // overshoots (interior approach) or undershoots (exterior approach) — instead
      // intersect the abutting line with each band face and stop at the far one.
      const dAbut = lines.get(s.id).d, dT = lines.get(through.id).d, thT = thicknessOf(through);
      const offT = isCentered(through) ? { x: 0, y: 0 } : justifyOffsetVec(through.a, through.b, thT, jOf(through), centroid);
      const cT = { x: through.a.x + offT.x, y: through.a.y + offT.y };
      const nT = { x: -dT.y, y: dT.x };
      let best = null, bestProj = -Infinity;
      for (const sgn of [-1, 1]) {
        const face = { x: cT.x + nT.x * sgn * thT / 2, y: cT.y + nT.y * sgn * thT / 2 };
        const ix = lineIntersect(r[end], dAbut, face, dT);
        if (!ix) continue;
        const proj = (ix.x - s[end].x) * ox + (ix.y - s[end].y) * oy; // how far along the approach
        if (proj > bestProj) { bestProj = proj; best = ix; }
      }
      if (!best) continue;
      r[end] = { x: best.x + ox * 0.02, y: best.y + oy * 0.02 };
      r[end + 'Joined'] = true;
      // mark this as a T-extension: the body was pushed into the through-wall,
      // so a grip/handle here must sit on the RAW connection point (the through
      // wall's centerline), not on this stretched-out band endpoint.
      r[end + 'T'] = true;
    }
  }
  return out;
}

// Each wall's body as a FILLED POLYGON with mitered faces at every junction
// (2-way, 3+-way, any angle) — the way CAD / floor-plan apps render walls so
// joints are clean. Returns Map(id -> { points: [{x,y}, …] }). Faces are mitered
// against the angularly-adjacent wall at each shared node; free ends are square.
export function wallPolygons(segs, justify, centroid, thicknessOf) {
  const jOf = (s) => s.justify || justify || 'center';
  const isCentered = (s) => { const j = jOf(s); return !j || j === 'center'; };
  const W = new Map(); // id -> { a, b, d (unit a->b), t }
  for (const s of segs) {
    const off = isCentered(s) ? { x: 0, y: 0 } : justifyOffsetVec(s.a, s.b, thicknessOf(s), jOf(s), centroid);
    const a = { x: s.a.x + off.x, y: s.a.y + off.y };
    const b = { x: s.b.x + off.x, y: s.b.y + off.y };
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    W.set(s.id, { a, b, d: { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, t: thicknessOf(s) });
  }
  // group wall-ends by shared node, each with its direction pointing INTO the wall
  const key = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const nodes = new Map();
  for (const s of segs) {
    for (const end of ['a', 'b']) {
      const k = key(s[end]);
      if (!nodes.has(k)) nodes.set(k, []);
      const w = W.get(s.id);
      const dAway = end === 'a' ? w.d : { x: -w.d.x, y: -w.d.y };
      nodes.get(k).push({ id: s.id, end, dAway, ang: Math.atan2(dAway.y, dAway.x) });
    }
  }
  // one face line for a member, on a side (+1 left / -1 right relative to dAway)
  const faceLine = (m, side) => {
    const w = W.get(m.id);
    const P = m.end === 'a' ? w.a : w.b;
    const nL = { x: -m.dAway.y, y: m.dAway.x };
    return { o: { x: P.x + nL.x * side * w.t / 2, y: P.y + nL.y * side * w.t / 2 }, d: m.dAway };
  };
  const ends = new Map(); // `${id}:${end}` -> { left, right }
  for (const members of nodes.values()) {
    members.sort((p, q) => p.ang - q.ang);
    const N = members.length;
    for (let i = 0; i < N; i++) {
      const m = members[i], ccw = members[(i + 1) % N], cw = members[(i - 1 + N) % N];
      const lf = faceLine(m, 1), rf = faceLine(m, -1);
      let left = lf.o, right = rf.o; // free end → square
      if (N > 1) {
        const a = faceLine(ccw, -1), b = faceLine(cw, 1);
        left = lineIntersect(lf.o, lf.d, a.o, a.d) || lf.o;
        right = lineIntersect(rf.o, rf.d, b.o, b.d) || rf.o;
      }
      ends.set(`${m.id}:${m.end}`, { left, right });
    }
  }
  const out = new Map();
  for (const s of segs) {
    const ea = ends.get(`${s.id}:a`), eb = ends.get(`${s.id}:b`);
    if (ea && eb) out.set(s.id, { points: [ea.left, eb.right, eb.left, ea.right] });
  }
  return out;
}

// Architectural dimension geometry for one wall, in FEET. `kind` is
// 'centerline' | 'interior' | 'exterior'; `offset` is the gap (ft) between the
// wall face and the dimension line; `centroid` decides which side is "outside";
// `justify` ('center'|'interior'|'exterior') is the wall alignment so the shown
// length matches the actual face — e.g. an interior-justified 20' wall reads 20'
// interior. Consumed by both the Konva canvas and the PDF/SVG export.
export function wallDimGeometry(wall, kind, offset, centroid, justify = 'center', unit) {
  const a = wall.a, b = wall.b;
  const L = dist(a, b);
  if (L < 0.4) return null;
  const th = Math.max(0.1, wall.thickness || 0.375);
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const out = outwardNormal(a, b, centroid);

  // Outward offset (from the datum line) of the face being dimensioned, plus the
  // material-centerline offset. faceLength = L + 2*faceFO.
  const cFO = justify === 'interior' ? th / 2 : justify === 'exterior' ? -th / 2 : 0;
  let faceFO, perpDist;
  if (kind === 'interior') {
    faceFO = cFO - th / 2;             // inner face
    perpDist = faceFO - Math.max(0, offset);
  } else if (kind === 'exterior') {
    faceFO = cFO + th / 2;             // outer face
    perpDist = faceFO + Math.max(0, offset);
  } else {                            // centerline → measure the drawn line
    faceFO = cFO;
    perpDist = cFO + Math.max(0, offset);
  }
  const len = Math.max(0, L + 2 * faceFO);

  // extend the dimension ends along the wall to meet the corner faces
  const a2 = { x: a.x - ux * faceFO, y: a.y - uy * faceFO };
  const b2 = { x: b.x + ux * faceFO, y: b.y + uy * faceFO };
  const da = { x: a2.x + out.x * perpDist, y: a2.y + out.y * perpDist };
  const db = { x: b2.x + out.x * perpDist, y: b2.y + out.y * perpDist };
  const faceA = { x: a2.x + out.x * faceFO, y: a2.y + out.y * faceFO };
  const faceB = { x: b2.x + out.x * faceFO, y: b2.y + out.y * faceFO };
  const overDir = Math.sign(perpDist - faceFO) || 1;
  const ea = { x: da.x + out.x * 0.18 * overDir, y: da.y + out.y * 0.18 * overDir };
  const eb = { x: db.x + out.x * 0.18 * overDir, y: db.y + out.y * 0.18 * overDir };

  // 45° tick slashes at each end (architectural style)
  const slx = ux + out.x, sly = uy + out.y;
  const sl = Math.hypot(slx, sly) || 1, sd = 0.22;
  const sdx = (slx / sl) * sd, sdy = (sly / sl) * sd;
  const slashA = [{ x: da.x - sdx, y: da.y - sdy }, { x: da.x + sdx, y: da.y + sdy }];
  const slashB = [{ x: db.x - sdx, y: db.y - sdy }, { x: db.x + sdx, y: db.y + sdy }];

  let angle = (Math.atan2(db.y - da.y, db.x - da.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180; // keep text upright

  return {
    witness: [[faceA, ea], [faceB, eb]],
    line: [da, db],
    slashes: [slashA, slashB],
    label: { x: (da.x + db.x) / 2, y: (da.y + db.y) / 2, text: formatFeetInches(len, { unit }), angle },
  };
}

// A running dimension string along a wall, broken at every opening edge so the
// openings' positions AND widths are dimensioned. `perpOffset` is the gap (ft)
// from the exterior face to the string. Returns ticks, witness lines and one
// labelled segment per gap. Shared by the canvas and the PDF export.
export function wallOpeningDimGeometry(wall, openings, perpOffset, centroid, justify = 'center', unit) {
  const a = wall.a, b = wall.b;
  const L = dist(a, b);
  if (L < 0.5 || !openings || !openings.length) return null;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const out = outwardNormal(a, b, centroid);
  const th = Math.max(0.1, wall.thickness || 0.375);
  const cFO = justify === 'interior' ? th / 2 : justify === 'exterior' ? -th / 2 : 0;
  const faceFO = cFO + th / 2; // exterior face outward offset from the datum line

  const cl = (v) => Math.max(0, Math.min(L, v));
  const set = [0, L];
  openings
    .map((o) => ({ c: o.t * L, w: o.width }))
    .filter((o) => o.c > 0 && o.c < L)
    .forEach((o) => { set.push(cl(o.c - o.w / 2)); set.push(cl(o.c + o.w / 2)); });
  const stations = [...new Set(set.map((v) => Math.round(v * 100) / 100))].sort((x, y) => x - y);
  if (stations.length <= 2) return null; // no openings within the wall

  const perp = faceFO + perpOffset;
  const P = (s) => ({ x: a.x + ux * s + out.x * perp, y: a.y + uy * s + out.y * perp });
  const F = (s) => ({ x: a.x + ux * s + out.x * faceFO, y: a.y + uy * s + out.y * faceFO });

  const slx = ux + out.x, sly = uy + out.y;
  const sl = Math.hypot(slx, sly) || 1, sd = 0.18;
  const sdx = (slx / sl) * sd, sdy = (sly / sl) * sd;
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;

  const ticks = stations.map((s) => { const p = P(s); return [{ x: p.x - sdx, y: p.y - sdy }, { x: p.x + sdx, y: p.y + sdy }]; });
  const witness = stations.map((s) => { const f = F(s), p = P(s); return [f, { x: p.x + out.x * 0.12, y: p.y + out.y * 0.12 }]; });
  const segments = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i], s1 = stations[i + 1];
    if (s1 - s0 < 0.05) continue;
    const mid = P((s0 + s1) / 2);
    segments.push({ line: [P(s0), P(s1)], label: { x: mid.x, y: mid.y, text: formatFeetInches(s1 - s0, { unit }), angle } });
  }
  return { ticks, witness, segments };
}

// ----- Wall thickness presets (US framing / masonry), value in inches -----
export const WALL_PRESETS = [
  { label: 'Standard', inches: 6 },
  { label: 'Interior 2×4', inches: 4.5 },
  { label: 'Exterior 2×6', inches: 6.5 },
  { label: 'Exterior 2×8', inches: 8.5 },
  { label: 'Brick / CMU 8″', inches: 8 },
  { label: 'Block 12″', inches: 12 },
];

// ----- Stairs -----
export const STAIR_TYPES = {
  straight: { label: 'Straight' },
  l:        { label: 'L-shaped' },
  u:        { label: 'U-shaped' },
  spiral:   { label: 'Spiral' },
};
export const STAIR_TYPE_ORDER = ['straight', 'l', 'u', 'spiral'];

// Local-coordinate geometry for a stair (origin at the stair anchor, before
// rotation). Each tread carries a `poly` (for the 2D plan) and a `box`
// {cx,cy,w,d,a} (for the 3D extrude). Also returns the footprint `outline` and
// an up-direction `arrow`. Shared by the 2D canvas, 3D scene and PDF export.
export function stairGeometry(stair) {
  const W = stair.width || 3.5;
  const steps = Math.max(2, Math.round(stair.steps || 13));
  const td = stair.tread || 0.9;          // tread depth (ft)
  const type = stair.type || 'straight';
  const treads = [], pts = [];
  // A flight of n treads along travel dir `du`, CENTERED on the travel
  // centerline so the up-arrow runs straight down the middle of the run.
  // Returns the centerline end point.
  const flight = (sx, sy, du, n, lvl0) => {
    const dp = { x: -du.y, y: du.x }, a = Math.atan2(du.y, du.x);
    for (let i = 0; i < n; i++) {
      const s0 = i * td, s1 = (i + 1) * td;
      const c = (s, k) => ({ x: sx + du.x * s + dp.x * (k - 0.5) * W, y: sy + du.y * s + dp.y * (k - 0.5) * W });
      const poly = [c(s0, 0), c(s1, 0), c(s1, 1), c(s0, 1)];
      treads.push({ poly, level: lvl0 + i, box: { cx: sx + du.x * (s0 + s1) / 2, cy: sy + du.y * (s0 + s1) / 2, w: W, d: td, a } });
      poly.forEach((p) => pts.push(p));
    }
    return { x: sx + du.x * n * td, y: sy + du.y * n * td };
  };
  // A flat landing slab centered at (cx,cy), lw × lh, at step level `lvl`.
  const landing = (cx, cy, lw, lh, lvl) => {
    const poly = [{ x: cx - lw / 2, y: cy - lh / 2 }, { x: cx + lw / 2, y: cy - lh / 2 }, { x: cx + lw / 2, y: cy + lh / 2 }, { x: cx - lw / 2, y: cy + lh / 2 }];
    treads.push({ poly, level: lvl, landing: true, box: { cx, cy, w: lw, d: lh, a: 0 } });
    poly.forEach((p) => pts.push(p));
  };
  let arrow = null;
  if (type === 'spiral') {
    const rO = Math.max(2.4, W * 1.2), rI = 0.45;
    for (let i = 0; i < steps; i++) {
      const a0 = i * (2 * Math.PI / steps), a1 = (i + 0.82) * (2 * Math.PI / steps), am = (a0 + a1) / 2, rm = (rI + rO) / 2;
      const poly = [{ x: Math.cos(a0) * rI, y: Math.sin(a0) * rI }, { x: Math.cos(a0) * rO, y: Math.sin(a0) * rO }, { x: Math.cos(a1) * rO, y: Math.sin(a1) * rO }, { x: Math.cos(a1) * rI, y: Math.sin(a1) * rI }];
      treads.push({ poly, level: i, box: { cx: Math.cos(am) * rm, cy: Math.sin(am) * rm, w: rO - rI, d: rm * (a1 - a0), a: am } });
      poly.forEach((p) => pts.push(p));
    }
    const outline = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * 2 * Math.PI; outline.push({ x: Math.cos(a) * rO, y: Math.sin(a) * rO }); }
    return { treads, outline, arrow: { from: { x: rO * 0.55, y: 0 }, to: { x: 0, y: rO * 0.55 } }, steps, post: { r: rI },
      resize: { widthAt: { x: rO, y: 0 }, widthDiv: 1.2, runAt: null } };
  }
  let resize;
  if (type === 'straight') {
    flight(0, 0, { x: 0, y: 1 }, steps, 0);
    arrow = { from: { x: 0, y: td * 0.5 }, to: { x: 0, y: steps * td - td * 0.5 } };
    resize = { widthAt: { x: W / 2, y: steps * td / 2 }, widthDiv: 0.5, runAt: { x: 0, y: steps * td }, runDiv: steps };
  } else if (type === 'l') {
    const n1 = Math.ceil(steps / 2), n2 = steps - n1;
    const e1 = flight(0, 0, { x: 0, y: 1 }, n1, 0);            // up
    landing(0, e1.y + W / 2, W, W, n1);                         // square landing at the turn
    flight(W / 2, e1.y + W / 2, { x: 1, y: 0 }, n2, n1 + 1);    // turn right off the landing
    arrow = { from: { x: 0, y: td * 0.5 }, to: { x: 0, y: e1.y - td * 0.5 } };
    resize = { widthAt: { x: W / 2, y: n1 * td / 2 }, widthDiv: 0.5, runAt: { x: 0, y: n1 * td }, runDiv: n1 };
  } else { // u — switchback: two parallel flights joined by a landing
    const n1 = Math.ceil(steps / 2), n2 = steps - n1, gap = 0.5;
    const e1 = flight(0, 0, { x: 0, y: 1 }, n1, 0);             // up, left flight
    landing((W + gap) / 2, e1.y + W / 2, 2 * W + gap, W, n1);   // landing spanning both flights
    flight(W + gap, e1.y, { x: 0, y: -1 }, n2, n1 + 1);         // back down, right flight
    arrow = { from: { x: 0, y: td * 0.5 }, to: { x: 0, y: e1.y - td * 0.5 } };
    resize = { widthAt: { x: W / 2, y: n1 * td / 2 }, widthDiv: 0.5, runAt: { x: 0, y: n1 * td }, runDiv: n1 };
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const outline = [{ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }, { x: Math.min(...xs), y: Math.max(...ys) }];
  return { treads, outline, arrow, steps, resize };
}

// ----- Wall materials (drive 3D finish + a per-material takeoff) -----
export const WALL_MATERIALS = {
  drywall:  { label: 'Drywall',   color: '#e8edf3', roughness: 0.9 },
  paint:    { label: 'Painted',   color: '#f1f5f9', roughness: 0.7 },
  brick:    { label: 'Brick',     color: '#a8553f', roughness: 0.95 },
  cmu:      { label: 'CMU Block', color: '#b8bcc0', roughness: 0.95 },
  stucco:   { label: 'Stucco',    color: '#e6ddc9', roughness: 0.92 },
  wood:     { label: 'Wood',      color: '#b07a45', roughness: 0.8 },
  concrete: { label: 'Concrete',  color: '#9ca3af', roughness: 0.9 },
};
export const WALL_MATERIAL_ORDER = ['drywall', 'paint', 'brick', 'cmu', 'stucco', 'wood', 'concrete'];

// Snap a direction (from `a` to `pt`) to the nearest `stepDeg` increment, keeping
// the same length. Used for Shift-constrained wall/fence drawing.
export function snapAngle(a, pt, stepDeg = 15) {
  const dx = pt.x - a.x, dy = pt.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: pt.x, y: pt.y };
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

// Detect enclosed rooms from the wall graph via planar face traversal. Returns
// [{ polygon, area, centroid }] for each bounded face (sq ft, centerline). The
// unbounded outer face is dropped. Defensive: returns [] on any malformed graph.
// Inset a room's centerline polygon to the interior wall faces: each edge is
// offset toward the centroid by half the thickness of the wall lying along it,
// then re-cornered at the offset-line intersections. Returns the inner polygon
// + its (net floor) area. Used to report area "to the inside of the walls".
function insetPolygon(poly, walls) {
  const n = poly.length;
  const area = (pts) => { let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p.x * q.y - q.x * p.y; } return A / 2; };
  if (n < 3) return { polygon: poly, area: area(poly) };
  const c = centroidOf(poly);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    let half = 0.25, best = 0.35;
    for (const w of walls) { const pr = projectOnSegment(mid, w.a, w.b); if (pr.distance < best) { best = pr.distance; half = (w.thickness || 0.5) / 2; } }
    let nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L; // inward normal (toward centroid)
    if (nx * (c.x - mid.x) + ny * (c.y - mid.y) < 0) { nx = -nx; ny = -ny; }
    lines.push({ o: { x: p.x + nx * half, y: p.y + ny * half }, d: { x: (q.x - p.x) / L, y: (q.y - p.y) / L } });
  }
  const inner = [];
  // vertex i = intersection of the offset lines of edges (i-1) and i. When those
  // edges are collinear (e.g. a T-junction split a straight wall) the lines are
  // parallel — fall back to b.o, which is poly[i] already offset inward, NOT the
  // raw centerline point (that would leave a bump and over-count the area).
  for (let i = 0; i < n; i++) { const a = lines[(i - 1 + n) % n], b = lines[i]; inner.push(lineIntersect(a.o, a.d, b.o, b.d) || b.o); }
  return { polygon: inner, area: area(inner) };
}

export function detectRooms(walls) {
  try {
    const Q = (v) => `${Math.round(v.x * 100) / 100},${Math.round(v.y * 100) / 100}`;
    const nodes = new Map();
    const node = (v) => { const k = Q(v); if (!nodes.has(k)) nodes.set(k, { x: v.x, y: v.y, key: k, out: [] }); return nodes.get(k); };
    const halfEdges = [];
    const addEdge = (na, nb) => {
      if (na.key === nb.key) return;
      const e1 = { from: na, to: nb }, e2 = { from: nb, to: na };
      e1.twin = e2; e2.twin = e1;
      e1.ang = Math.atan2(nb.y - na.y, nb.x - na.x);
      e2.ang = Math.atan2(na.y - nb.y, na.x - nb.x);
      na.out.push(e1); nb.out.push(e2);
      halfEdges.push(e1, e2);
    };
    const segs = walls.filter((w) => dist(w.a, w.b) >= 0.1);
    for (const w of segs) {
      // split this wall at any point where ANOTHER wall ties into its middle
      // (a T-junction). Without this, a room whose side is the mid-span of a
      // pass-through wall never closes into a loop and is missed entirely.
      const pts = [{ x: w.a.x, y: w.a.y, t: 0 }, { x: w.b.x, y: w.b.y, t: 1 }];
      for (const o of segs) {
        if (o === w) continue;
        for (const P of [o.a, o.b]) {
          const pr = projectOnSegment(P, w.a, w.b);
          if (pr.distance < 0.12 && pr.t > 1e-3 && pr.t < 1 - 1e-3) pts.push({ x: P.x, y: P.y, t: pr.t });
        }
      }
      pts.sort((p, q) => p.t - q.t);
      const chain = [];
      for (const p of pts) { const last = chain[chain.length - 1]; if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-3) chain.push(p); }
      for (let i = 0; i < chain.length - 1; i++) addEdge(node(chain[i]), node(chain[i + 1]));
    }
    for (const n of nodes.values()) n.out.sort((a, b) => a.ang - b.ang);
    const nextOf = (e) => { const list = e.to.out; const i = list.indexOf(e.twin); return list[(i - 1 + list.length) % list.length]; };
    const visited = new Set();
    const rooms = [];
    for (const e0 of halfEdges) {
      if (visited.has(e0)) continue;
      const poly = []; let e = e0, guard = 0;
      do { visited.add(e); poly.push({ x: e.from.x, y: e.from.y }); e = nextOf(e); } while (e !== e0 && !visited.has(e) && ++guard < 10000);
      if (poly.length < 3) continue;
      let A = 0, cx = 0, cy = 0;
      for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const cr = p.x * q.y - q.x * p.y; A += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr; }
      A /= 2;
      if (A <= 4) continue; // outer face has the opposite sign; tiny slivers dropped
      // Net floor area = inside the wall FACES, not the centerline loop: push each
      // edge inward by half the bounding wall's thickness and measure that polygon.
      const interior = insetPolygon(poly, walls);
      rooms.push({ polygon: poly, area: Math.abs(interior.area) || A, gross: Math.abs(A), holes: [], centroid: { x: cx / (6 * A), y: cy / (6 * A) } });
    }

    // ---- nested rooms (a room placed inside another) ----
    // A room whose centroid sits inside a bigger room is a HOLE in that room:
    // carve it out of the bigger room's fill, subtract its area, and move the
    // bigger room's label off it — so the inner stays white and both stay
    // selectable (their labels no longer stack on the shared centre).
    const inPoly = (pt, poly) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < (b.x - a.x) * (pt.y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) c = !c;
      }
      return c;
    };
    for (const r of rooms) for (const o of rooms) {
      if (o === r || o.gross >= r.gross || !inPoly(o.centroid, r.polygon)) continue;
      // only DIRECT containment: no intermediate room between r and o
      const nested = rooms.some((m) => m !== r && m !== o && m.gross < r.gross && m.gross > o.gross && inPoly(o.centroid, m.polygon) && inPoly(m.centroid, r.polygon));
      if (!nested) r.holes.push(o);
    }
    for (const r of rooms) {
      if (!r.holes.length) continue;
      r.area = Math.max(0, r.area - r.holes.reduce((s, h) => s + h.gross, 0)); // net floor (ring)
      r.centroid = ringLabelPoint(r.polygon, r.holes.map((h) => h.polygon)) || r.centroid;
      r.holes = r.holes.map((h) => h.polygon); // keep just the geometry for the fill
    }
    return rooms;
  } catch { return []; }
}

// A label point inside `poly` but OUTSIDE every hole — the spot in the ring with
// the most clearance, so a doughnut-shaped room's label doesn't land on the
// inner room. Coarse grid sample maximizing distance to the nearest edge.
function ringLabelPoint(poly, holes) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const inPoly = (pt, pg) => { let c = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const a = pg[i], b = pg[j]; if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < (b.x - a.x) * (pt.y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) c = !c; } return c; };
  const edgeDist = (pt, pg) => { let d = Infinity; for (let i = 0; i < pg.length; i++) d = Math.min(d, projectOnSegment(pt, pg[i], pg[(i + 1) % pg.length]).distance); return d; };
  let best = null, bestD = -1, N = 18;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const pt = { x: minX + (maxX - minX) * i / N, y: minY + (maxY - minY) * j / N };
    if (!inPoly(pt, poly) || holes.some((h) => inPoly(pt, h))) continue;
    let d = edgeDist(pt, poly);
    for (const h of holes) d = Math.min(d, edgeDist(pt, h));
    if (d > bestD) { bestD = d; best = pt; }
  }
  return best;
}

// Wall ids whose segments run along a detected room's polygon edges — the walls
// that bound the room. Sorted + joined they form a stable "signature" that
// survives moves (wall ids don't change), so a room can carry a persistent name
// and be selected / dragged as a single unit.
export function roomWalls(room, walls) {
  const ids = new Set();
  const poly = room.polygon;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    let best = null, bestD = 0.25;
    for (const w of walls) {
      const pm = projectOnSegment(mid, w.a, w.b);
      const pa = projectOnSegment(p, w.a, w.b), pb = projectOnSegment(q, w.a, w.b);
      if (pm.distance < bestD && pa.distance < 0.25 && pb.distance < 0.25) { best = w.id; bestD = pm.distance; }
    }
    if (best) ids.add(best);
  }
  return [...ids];
}
export const roomSignature = (wallIds) => [...wallIds].sort().join('|');

// Parse a user-typed length into FEET. Accepts decimal feet ("12.5"),
// feet-inches ("12' 6\"", "12'6", "12 ft 6 in"), or inches ("150\"", "150 in").
// Returns NaN when nothing parseable is found.
export function parseLength(str) {
  if (str == null) return NaN;
  const s = String(str).trim().toLowerCase();
  if (!s) return NaN;
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);                       // bare number → feet
  let m = s.match(/^(-?\d*\.?\d+)\s*(?:in|")$/);                            // inches only
  if (m) return parseFloat(m[1]) / 12;
  m = s.match(/^(-?\d*\.?\d+)\s*(?:ft|')\s*(\d*\.?\d+)?\s*(?:in|")?$/);     // feet + optional inches
  if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
  const f = parseFloat(s);
  return Number.isNaN(f) ? NaN : f;
}
