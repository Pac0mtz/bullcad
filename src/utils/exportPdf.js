// Real PDF export via jsPDF + svg2pdf.js. The plan is drawn as a vector SVG and
// rendered into the PDF (so it stays crisp), with an optional legend / title
// block. Paper size, orientation and contents are chosen in the export modal.

import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import {
  dist, lerp, angleOf, centroidOf, wallDimGeometry, wallOpeningDimGeometry, justifiedSegments, wallPolygons, WINDOW_STYLES, FENCE_TYPES, postsAlong,
  formatFeetInches, windowBars, stairGeometry, detectRooms, roomWalls, roomSignature, EQUIPMENT,
} from './geometry.js';
import { computeQuantities, fenceComponents } from './quantities.js';

const NAVY = '#0a2540';
const FENCE_THICK = 0.3;
const r2 = (n) => Math.round(n * 1000) / 1000;

// A dimension label drawn inside a white rounded pill (matches the on-screen look).
function dimPill(x, y, angle, text, fs) {
  // text only — no pill box/border/halo. The dimension line is broken (or
  // omitted on tight runs) around the label, so nothing crosses the number.
  const attrs = `x="0" y="${r2(fs * 0.33)}" font-size="${fs}" text-anchor="middle" font-family="Poppins, Helvetica, Arial, sans-serif" font-weight="400"`;
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(angle)})">`
    + `<text ${attrs} fill="${NAVY}">${text}</text>`
    + `</g>`;
}

// Build the plan as an SVG string + its size in feet (for aspect-correct fit).
export function buildPlanSvg(model, opts = {}) {
  const { walls, openings, fences, gates } = model;
  const pts = [];
  walls.forEach((w) => pts.push(w.a, w.b));
  fences.forEach((f) => pts.push(f.a, f.b));
  (model.labels || []).forEach((lb) => { if (lb.anchor) pts.push(lb.anchor); if (lb.pos) pts.push(lb.pos); });
  (model.stairs || []).forEach((st) => {
    const g = stairGeometry(st), c = Math.cos((st.rotation || 0) * Math.PI / 180), s = Math.sin((st.rotation || 0) * Math.PI / 180);
    g.outline.forEach((p) => pts.push({ x: st.x + p.x * c - p.y * s, y: st.y + p.x * s + p.y * c }));
  });
  if (!pts.length) return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>', wFt: 10, hFt: 10 };

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 5;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const wFt = Math.max(...xs) + pad - minX, hFt = Math.max(...ys) + pad - minY;
  const centroid = centroidOf(walls.flatMap((w) => [w.a, w.b]));
  const fenceCentroid = centroidOf(fences.flatMap((f) => [f.a, f.b]));
  const wj = opts.wallJustify || 'center';
  const fj = opts.fenceJustify || 'center';
  // mitered, face-justified endpoints — same source of truth as the 2D/3D views
  const wallSegs = justifiedSegments(walls, wj, centroid, (w) => w.thickness);
  const fenceSegs = justifiedSegments(fences, fj, fenceCentroid, () => FENCE_THICK);
  const wSeg = (w) => wallSegs.get(w.id) || { a: w.a, b: w.b };
  const fSeg = (f) => fenceSegs.get(f.id) || { a: f.a, b: f.b };
  const el = [];

  // water-affected room shading (restoration drying map) — drawn first, under the walls
  const affected = model.roomAffected || {};
  if (Object.keys(affected).length) {
    detectRooms(walls).forEach((rm) => {
      if (!affected[roomSignature(roomWalls(rm, walls))]) return;
      let d = 'M ' + rm.polygon.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(' L ') + ' Z';
      (rm.holes || []).forEach((h) => { d += ' M ' + h.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(' L ') + ' Z'; });
      el.push(`<path d="${d}" fill="rgba(245,158,11,0.22)" fill-rule="evenodd"/>`);
    });
  }
  // free-shape affected regions (partial wet areas)
  (model.regions || []).forEach((rg) => {
    if (!rg.points || rg.points.length < 3) return;
    el.push(`<polygon points="${rg.points.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ')}" fill="rgba(245,158,11,0.28)" stroke="rgba(180,83,9,0.6)" stroke-width="0.06"/>`);
  });

  // On-page scale (points per foot) so label fonts can be set in real POINTS:
  // the SVG is in feet and gets scaled by `sc` to fit the page. ptFt(10) is the
  // feet value that renders as 10pt. Fallback when the fit box isn't supplied.
  const sc = (opts.fitW > 0 && opts.fitH > 0) ? Math.min(opts.fitW / wFt, opts.fitH / hFt) : 12;
  const ptFt = (pt) => pt / sc;
  const dimFs = ptFt(opts.dimLabelPt || 5.5); // dimension numbers (smaller so tight openings/doors don't crowd)
  const DIMW = 0.035;                  // dim-line stroke (feet)
  // small filled arrowhead at `tip`, pointing in unit dir (ux,uy) — matches the
  // on-screen dimensions (replaces the old 45° slash ticks)
  const AL = ptFt(4.5), AW = ptFt(1.6); // arrow length / half-width (constant points)
  const dimArrow = (tip, ux, uy) => {
    const nx = -uy, ny = ux;
    return `<polygon points="${r2(tip.x)},${r2(tip.y)} ${r2(tip.x - ux * AL + nx * AW)},${r2(tip.y - uy * AL + ny * AW)} ${r2(tip.x - ux * AL - nx * AW)},${r2(tip.y - uy * AL - ny * AW)}" fill="${NAVY}"/>`;
  };
  // a dimension line with inward arrowheads, split around its label (▶ 13' 6" ◀).
  // Returns { svg, showNum } so the caller can hide the number on a too-tight run.
  const dimLineSVG = (p0, p1, text, fs) => {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    const half = (text.length * fs * 0.66 + fs * 0.9) / 2; // label half-width (feet)
    const showNum = len / 2 - half > 0.05;
    let svg = dimArrow(p0, ux, uy) + dimArrow(p1, -ux, -uy); // arrows point inward
    if (showNum) {
      svg += `<line x1="${r2(p0.x)}" y1="${r2(p0.y)}" x2="${r2(mx - ux * half)}" y2="${r2(my - uy * half)}" stroke="${NAVY}" stroke-width="${DIMW}"/>`
        + `<line x1="${r2(mx + ux * half)}" y1="${r2(my + uy * half)}" x2="${r2(p1.x)}" y2="${r2(p1.y)}" stroke="${NAVY}" stroke-width="${DIMW}"/>`;
    } else {
      svg += `<line x1="${r2(p0.x)}" y1="${r2(p0.y)}" x2="${r2(p1.x)}" y2="${r2(p1.y)}" stroke="${NAVY}" stroke-width="${DIMW}"/>`;
    }
    return { svg, showNum };
  };

  fences.forEach((f) => {
    const ft = FENCE_TYPES[f.fenceType] || FENCE_TYPES.wood;
    const s = fSeg(f);
    const col = f.color || ft.color;
    const dash = ft.style === 'mesh' ? '0.3 0.4' : ft.style === 'pickets' ? '0.7 0.4' : ft.style === 'slat' ? '0.5 0.3' : ft.style === 'rail' ? '0.9 0.5' : '';
    el.push(`<line x1="${r2(s.a.x)}" y1="${r2(s.a.y)}" x2="${r2(s.b.x)}" y2="${r2(s.b.y)}" stroke="${col}" stroke-width="0.3" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
    postsAlong(s.a, s.b, f.postSpacing || 8).forEach((p) =>
      el.push(`<rect x="${r2(p.x - 0.18)}" y="${r2(p.y - 0.18)}" width="0.36" height="0.36" fill="${NAVY}"/>`));
  });

  // walls as mitered, filled polygons — the SAME source as the on-screen 2D
  // plan, so corners join cleanly and the PDF matches the app exactly
  const wallPolys = wallPolygons(walls, wj, centroid, (w) => w.thickness || 0.5);
  walls.forEach((w) => {
    const poly = wallPolys.get(w.id);
    if (poly && poly.points && poly.points.length >= 3) {
      el.push(`<polygon points="${poly.points.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ')}" fill="${NAVY}" stroke="${NAVY}" stroke-width="0.02" stroke-linejoin="round"/>`);
      return;
    }
    const th = Math.max(0.15, w.thickness);
    const s = wSeg(w);
    el.push(`<line x1="${r2(s.a.x)}" y1="${r2(s.a.y)}" x2="${r2(s.b.x)}" y2="${r2(s.b.y)}" stroke="${NAVY}" stroke-width="${r2(th)}" stroke-linecap="square"/>`);
  });

  const outwardSign = (w) => {
    const L = dist(w.a, w.b) || 1;
    const nx = -(w.b.y - w.a.y) / L, ny = (w.b.x - w.a.x) / L;
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    return nx * (centroid.x - mid.x) + ny * (centroid.y - mid.y) > 0 ? -1 : 1;
  };

  // sign that makes a gate/door leaf swing toward the enclosed side (away from the
  // dimension strings, which sit on the outside). +1/−1 in the element's local y.
  const inwardSign = (a, b, cen) => {
    const L = dist(a, b) || 1;
    const vx = (b.y - a.y) / L, vy = -(b.x - a.x) / L; // world dir of local −y
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return vx * (cen.x - mid.x) + vy * (cen.y - mid.y) >= 0 ? -1 : 1;
  };
  // resolve hinge/swing overrides into hinge x, far-jamb x, leaf dir + arc sweep
  const swingGeom = (halfW, inward, hinge, swing) => {
    const d = (swing === 'out' ? -1 : 1) * inward;
    const left = hinge !== 'right';
    return { d, hx: left ? -halfW : halfW, farX: left ? halfW : -halfW, sweep: (left === (d === -1)) ? 1 : 0 };
  };

  openings.forEach((o) => {
    const w = walls.find((x) => x.id === o.wallId);
    if (!w) return;
    const s = wSeg(w);
    const c = lerp(s.a, s.b, o.t);
    const ang = r2((angleOf(s.a, s.b) * 180) / Math.PI);
    const th = Math.max(0.2, w.thickness) + 0.06;
    const hw = o.width / 2;
    const proj = o.type === 'window' ? WINDOW_STYLES[o.style]?.project : null;
    let inner = `<rect x="${r2(-hw)}" y="${r2(-th / 2)}" width="${r2(o.width)}" height="${r2(th)}" fill="#ffffff"/>`;
    inner += `<line x1="${r2(-hw)}" y1="${r2(-th / 2)}" x2="${r2(-hw)}" y2="${r2(th / 2)}" stroke="${NAVY}" stroke-width="0.06"/>`;
    inner += `<line x1="${r2(hw)}" y1="${r2(-th / 2)}" x2="${r2(hw)}" y2="${r2(th / 2)}" stroke="${NAVY}" stroke-width="0.06"/>`;
    if (o.type === 'door') {
      const { d, hx, farX, sweep } = swingGeom(hw, inwardSign(s.a, s.b, centroid), o.hinge, o.swing);
      inner += `<line x1="${r2(hx)}" y1="0" x2="${r2(hx)}" y2="${r2(d * o.width)}" stroke="${NAVY}" stroke-width="0.06"/>`;
      inner += `<path d="M ${r2(hx)} ${r2(d * o.width)} A ${r2(o.width)} ${r2(o.width)} 0 0 ${sweep} ${r2(farX)} 0" fill="none" stroke="${NAVY}" stroke-width="0.05" stroke-dasharray="0.3 0.22"/>`;
    } else if (proj) {
      const d = (WINDOW_STYLES[o.style].depth || 1.5) * outwardSign(w);
      if (proj === 'bay') inner += `<polygon points="${r2(-hw)},0 ${r2(-hw / 2)},${r2(d)} ${r2(hw / 2)},${r2(d)} ${r2(hw)},0" fill="none" stroke="${NAVY}" stroke-width="0.06"/>`;
      else inner += `<polygon points="${r2(-hw)},0 ${r2(-hw)},${r2(d)} ${r2(hw)},${r2(d)} ${r2(hw)},0" fill="none" stroke="${NAVY}" stroke-width="0.06"/>`;
    } else if (o.type === 'window') {
      inner += `<line x1="${r2(-hw)}" y1="-0.08" x2="${r2(hw)}" y2="-0.08" stroke="${NAVY}" stroke-width="0.05"/>`;
      inner += `<line x1="${r2(-hw)}" y1="0.08" x2="${r2(hw)}" y2="0.08" stroke="${NAVY}" stroke-width="0.05"/>`;
    }
    el.push(`<g transform="translate(${r2(c.x)} ${r2(c.y)}) rotate(${ang})">${inner}</g>`);
  });

  gates.forEach((g) => {
    const f = fences.find((x) => x.id === g.fenceId);
    if (!f) return;
    const s = fSeg(f);
    const c = lerp(s.a, s.b, g.t);
    const ang = r2((angleOf(s.a, s.b) * 180) / Math.PI);
    const hw = g.width / 2, gw = g.width, type = g.gateType || 'swing';
    const gcol = g.color || f.color || (FENCE_TYPES[f.fenceType] || FENCE_TYPES.wood).color;
    const inward = inwardSign(s.a, s.b, fenceCentroid); // swing toward the enclosed side
    const d = (g.swing === 'out' ? -1 : 1) * inward;
    const sweep = d === -1 ? 1 : 0;
    let inner = `<rect x="${r2(-hw)}" y="-0.3" width="${r2(gw)}" height="0.6" fill="#ffffff"/>`;
    // hinge posts at the two jambs
    inner += `<rect x="${r2(-hw - 0.18)}" y="-0.18" width="0.36" height="0.36" fill="${NAVY}"/>`;
    inner += `<rect x="${r2(hw - 0.18)}" y="-0.18" width="0.36" height="0.36" fill="${NAVY}"/>`;
    if (type === 'swing') {
      // solid leaf (full width) + dashed 90° arc, radius = width, to the far jamb
      const sg = swingGeom(hw, inward, g.hinge, g.swing);
      inner += `<line x1="${r2(sg.hx)}" y1="0" x2="${r2(sg.hx)}" y2="${r2(sg.d * gw)}" stroke="${gcol}" stroke-width="0.1"/>`;
      inner += `<path d="M ${r2(sg.hx)} ${r2(sg.d * gw)} A ${r2(gw)} ${r2(gw)} 0 0 ${sg.sweep} ${r2(sg.farX)} 0" fill="none" stroke="${gcol}" stroke-width="0.05" stroke-dasharray="0.3 0.22"/>`;
    } else if (type === 'double') {
      // two leaves, each half the opening, meeting in the middle
      inner += `<line x1="${r2(-hw)}" y1="0" x2="${r2(-hw)}" y2="${r2(d * hw)}" stroke="${gcol}" stroke-width="0.1"/>`;
      inner += `<path d="M ${r2(-hw)} ${r2(d * hw)} A ${r2(hw)} ${r2(hw)} 0 0 ${sweep} 0 0" fill="none" stroke="${gcol}" stroke-width="0.05" stroke-dasharray="0.3 0.22"/>`;
      inner += `<line x1="${r2(hw)}" y1="0" x2="${r2(hw)}" y2="${r2(d * hw)}" stroke="${gcol}" stroke-width="0.1"/>`;
      inner += `<path d="M ${r2(hw)} ${r2(d * hw)} A ${r2(hw)} ${r2(hw)} 0 0 ${1 - sweep} 0 0" fill="none" stroke="${gcol}" stroke-width="0.05" stroke-dasharray="0.3 0.22"/>`;
    } else {
      // sliding — leaf parked just inside the opening, parallel to the fence
      inner += `<line x1="${r2(-hw)}" y1="${r2(d * 0.35)}" x2="${r2(hw)}" y2="${r2(d * 0.35)}" stroke="${gcol}" stroke-width="0.16"/>`;
    }
    el.push(`<g transform="translate(${r2(c.x)} ${r2(c.y)}) rotate(${ang})">${inner}</g>`);
  });

  const kindsFor = (m) => (m === 'off' ? [] : m === 'both' ? ['interior', 'exterior'] : [m]);
  const baseOff = opts.dimOffset ?? 1;
  const unit = opts.dimUnit; // undefined = feet-inches; 'in' = inches only
  const hasOpenings = openings.length > 0;
  const ROW_GAP = 1.6;
  walls.forEach((w) => {
    // per-wall kinds, exactly like the on-screen plan: honor a per-wall dimMode
    // override, and dimension interior walls by their TRUE span (interior) rather
    // than an exterior face that overshoots into the walls they tie into
    const kinds = [...new Set(kindsFor(w.dimMode || opts.dimMode || 'exterior')
      .map((k) => (k === 'exterior' && !w.exterior ? 'interior' : k)))];
    kinds.forEach((k) => {
      const extra = hasOpenings && k !== 'interior' ? ROW_GAP : 0;
      const dg = wallDimGeometry(w, k, (w.dimOff ?? baseOff) + extra, centroid, wj, unit);
      if (!dg) return;
      dg.witness.forEach((s) => el.push(`<line x1="${r2(s[0].x)}" y1="${r2(s[0].y)}" x2="${r2(s[1].x)}" y2="${r2(s[1].y)}" stroke="${NAVY}" stroke-width="0.035"/>`));
      const dl = dimLineSVG(dg.line[0], dg.line[1], dg.label.text, dimFs);
      el.push(dl.svg);
      if (dl.showNum) el.push(dimPill(dg.label.x, dg.label.y, dg.label.angle, dg.label.text, dimFs));
    });
  });

  // opening dimension strings (wall length split at every opening)
  if (opts.dimMode !== 'off') walls.forEach((w) => {
    const wops = openings.filter((o) => o.wallId === w.id);
    const og = wallOpeningDimGeometry(w, wops, w.openDimOff ?? baseOff, centroid, wj, unit);
    if (!og) return;
    og.witness.forEach((s) => el.push(`<line x1="${r2(s[0].x)}" y1="${r2(s[0].y)}" x2="${r2(s[1].x)}" y2="${r2(s[1].y)}" stroke="${NAVY}" stroke-width="0.03"/>`));
    og.segments.forEach((seg) => { const dl = dimLineSVG(seg.line[0], seg.line[1], seg.label.text, dimFs); el.push(dl.svg); if (dl.showNum) el.push(dimPill(seg.label.x, seg.label.y, seg.label.angle, seg.label.text, dimFs)); });
  });

  // fence dimensions — overall length + gate splits (mirrors walls)
  if (opts.dimMode !== 'off') fences.forEach((f) => {
    const fw = { ...f, thickness: FENCE_THICK };
    const fgates = gates.filter((g) => g.fenceId === f.id);
    const extra = fgates.length ? ROW_GAP : 0;
    const fbase = f.dimOff ?? baseOff;
    const dg = wallDimGeometry(fw, 'centerline', fbase + extra, fenceCentroid, fj, unit);
    if (dg) {
      dg.witness.forEach((s) => el.push(`<line x1="${r2(s[0].x)}" y1="${r2(s[0].y)}" x2="${r2(s[1].x)}" y2="${r2(s[1].y)}" stroke="${NAVY}" stroke-width="0.035"/>`));
      const dl = dimLineSVG(dg.line[0], dg.line[1], dg.label.text, dimFs);
      el.push(dl.svg);
      if (dl.showNum) el.push(dimPill(dg.label.x, dg.label.y, dg.label.angle, dg.label.text, dimFs));
    }
    const og = wallOpeningDimGeometry(fw, fgates, f.openDimOff ?? fbase, fenceCentroid, fj, unit);
    if (og) {
      og.witness.forEach((s) => el.push(`<line x1="${r2(s[0].x)}" y1="${r2(s[0].y)}" x2="${r2(s[1].x)}" y2="${r2(s[1].y)}" stroke="${NAVY}" stroke-width="0.03"/>`));
      og.segments.forEach((seg) => { const dl = dimLineSVG(seg.line[0], seg.line[1], seg.label.text, dimFs); el.push(dl.svg); if (dl.showNum) el.push(dimPill(seg.label.x, seg.label.y, seg.label.angle, seg.label.text, dimFs)); });
    }
  });

  // stairs — charcoal lines, walk line with a start dot + arrowhead + inside "UP"
  const SLINE = '#475569';
  (model.stairs || []).forEach((st) => {
    const g = stairGeometry(st), tp = (p) => `${r2(p.x)},${r2(p.y)}`;
    let inner = `<polygon points="${g.outline.map(tp).join(' ')}" fill="#ffffff" stroke="${SLINE}" stroke-width="0.06"/>`;
    g.treads.forEach((t) => { inner += `<polygon points="${t.poly.map(tp).join(' ')}" fill="${t.landing ? 'rgba(100,116,139,0.12)' : 'none'}" stroke="${SLINE}" stroke-width="0.04"/>`; });
    if (g.post) inner += `<circle cx="0" cy="0" r="${r2(g.post.r)}" fill="${SLINE}"/>`;
    if (g.arrow) {
      const a = g.arrow, ang = Math.atan2(a.to.y - a.from.y, a.to.x - a.from.x), al = 0.4, aw = 0.18, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      inner += `<circle cx="${r2(a.from.x)}" cy="${r2(a.from.y)}" r="0.12" fill="${SLINE}"/>`;
      inner += `<line x1="${r2(a.from.x)}" y1="${r2(a.from.y)}" x2="${r2(a.to.x)}" y2="${r2(a.to.y)}" stroke="${SLINE}" stroke-width="0.05"/>`;
      inner += `<polygon points="${r2(a.to.x)},${r2(a.to.y)} ${r2(a.to.x - ux * al + nx * aw)},${r2(a.to.y - uy * al + ny * aw)} ${r2(a.to.x - ux * al - nx * aw)},${r2(a.to.y - uy * al - ny * aw)}" fill="${SLINE}"/>`;
      inner += `<text x="${r2(a.from.x + 0.4)}" y="${r2(a.from.y + 0.15)}" font-size="0.5" fill="${SLINE}" font-family="Helvetica" font-weight="bold">UP</text>`;
    }
    el.push(`<g transform="translate(${r2(st.x)} ${r2(st.y)}) rotate(${r2(st.rotation || 0)})">${inner}</g>`);
  });

  // labels (leader-line callouts) — drawn on top
  const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  (model.labels || []).forEach((lb) => {
    const a = lb.anchor, p = lb.pos;
    if (!a || !p) return;
    const ff = (lb.fontSize || 12) * 0.06; // px → plan feet
    const rows = String(lb.text || '').split('\n');
    const longest = rows.reduce((mx, r) => Math.max(mx, r.length), 1);
    const pw = Math.max(ff * 2, longest * ff * 0.56 + ff * 0.9), ph = rows.length * ff * 1.32 + ff * 0.55;
    const lineC = lb.line || NAVY, arrowC = lb.arrow || lineC, borderC = lb.border || '#2563eb';
    el.push(`<line x1="${r2(p.x)}" y1="${r2(p.y)}" x2="${r2(a.x)}" y2="${r2(a.y)}" stroke="${lineC}" stroke-width="${r2(ff * 0.09)}"/>`);
    const ang = Math.atan2(a.y - p.y, a.x - p.x), al = ff * 0.75, aw = ff * 0.32;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    el.push(`<polygon points="${r2(a.x)},${r2(a.y)} ${r2(a.x - ux * al + nx * aw)},${r2(a.y - uy * al + ny * aw)} ${r2(a.x - ux * al - nx * aw)},${r2(a.y - uy * al - ny * aw)}" fill="${arrowC}"/>`);
    el.push(`<rect x="${r2(p.x - pw / 2)}" y="${r2(p.y - ph / 2)}" width="${r2(pw)}" height="${r2(ph)}" rx="${r2(ff * 0.4)}" fill="#ffffff" stroke="${borderC}" stroke-width="${r2(ff * 0.12)}"/>`);
    rows.forEach((row, i) => {
      const ty = p.y - ph / 2 + ff * 1.02 + i * ff * 1.32;
      el.push(`<text x="${r2(p.x)}" y="${r2(ty)}" font-size="${r2(ff)}" fill="#1e293b" font-family="Helvetica, Arial, sans-serif" font-weight="600" text-anchor="middle">${escXml(row)}</text>`);
    });
  });

  // room labels: name above the interior-face area, plain black text (no pill /
  // border / background) like the on-screen plan. A white halo (text outline,
  // not a box) keeps it readable where it crosses dimension lines in tight rooms.
  const roomNames = model.roomNames || {};
  const roomLabel = (x, y, text, fs, bold) => {
    const attrs = `x="${r2(x)}" y="${r2(y)}" font-size="${fs}" font-family="Poppins, Helvetica, Arial, sans-serif" font-weight="${bold ? 'bold' : '400'}" text-anchor="middle"`;
    return `<text ${attrs} fill="none" stroke="#ffffff" stroke-width="${r2(fs * 0.32)}" stroke-linejoin="round">${text}</text>`
      + `<text ${attrs} fill="#64748b">${text}</text>`;
  };
  // scale the PDF room-label points off the on-screen size (default 11px → ~7.9pt
  // name / 7.2pt area), so changing "Label size" in the app carries into the PDF.
  const rls = opts.roomLabelSize || 11;
  detectRooms(walls).forEach((rm) => {
    const name = roomNames[roomSignature(roomWalls(rm, walls))] || '';
    const showArea = opts.showRoomAreas !== false;
    if (!name && !showArea) return;
    const cx = rm.centroid.x, cy = rm.centroid.y;
    const nameFs = ptFt(10 * rls / 14), areaFs = ptFt(8.5 * rls / 14); // room labels in real points too
    if (name) el.push(roomLabel(cx, cy - (showArea ? areaFs * 0.75 : -areaFs * 0.35), escXml(name), nameFs, true));
    if (showArea) el.push(roomLabel(cx, cy + (name ? nameFs * 0.85 : areaFs * 0.35), `${Math.round(rm.area)} sq ft`, areaFs, false));
  });

  // restoration drying equipment tokens (on top of everything)
  (model.equips || []).forEach((eq) => {
    const meta = EQUIPMENT[eq.kind] || EQUIPMENT.airMover;
    const R = ptFt(7);
    let g = `<g transform="translate(${r2(eq.x)},${r2(eq.y)})">`;
    if (meta.dir) g += `<g transform="rotate(${r2(eq.rotation || 0)})"><polygon points="0,${r2(-R - ptFt(4))} ${r2(-ptFt(2.6))},${r2(-R)} ${r2(ptFt(2.6))},${r2(-R)}" fill="${meta.color}"/></g>`;
    g += `<circle r="${r2(R)}" fill="#ffffff" stroke="${meta.color}" stroke-width="${r2(ptFt(1.1))}"/>`;
    g += `<circle r="${r2(R)}" fill="${meta.color}" fill-opacity="0.14"/>`;
    g += `<text x="0" y="${r2(ptFt(3.5))}" font-size="${r2(ptFt(7))}" font-family="Poppins, Helvetica, Arial, sans-serif" font-weight="700" text-anchor="middle" fill="${meta.color}">${meta.code}${eq.num || ''}</text>`;
    el.push(g + '</g>');
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(minX)} ${r2(minY)} ${r2(wFt)} ${r2(hFt)}" width="${r2(wFt)}" height="${r2(hFt)}">${el.join('')}</svg>`;
  return { svg, wFt, hFt };
}

const hexRgb = (hex) => {
  const m = (hex || '').match(/#(..)(..)(..)/);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [120, 120, 120];
};

// Small mark icon for the door/window schedule (drawn with jsPDF primitives):
// door = leaf + swing arc, window = framed pane with a mullion, opening = jambs.
// `yBase` is the row text baseline; icon sits in a ~sz box above it.
function drawOpeningSymbol(doc, type, x, yBase, sz = 12) {
  doc.setLineWidth(0.7);
  const cy = yBase - 2;            // vertical centre of the glyph
  if (type === 'door') {
    doc.setDrawColor(138, 90, 50); // door brown
    const by = cy + sz / 2, top = cy - sz / 2, r = sz; // hinge at bottom-left
    doc.line(x, by, x, top);       // door leaf (open, pointing up)
    const seg = 7, pts = [];       // quarter-circle swing from open (up) to closed (right)
    for (let i = 0; i <= seg; i++) { const a = (Math.PI / 2) * (1 - i / seg); pts.push([x + r * Math.cos(a), by - r * Math.sin(a)]); }
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  } else if (type === 'window') {
    doc.setDrawColor(37, 99, 235);
    doc.rect(x, cy - sz / 2, sz, sz);                       // frame
    doc.line(x + sz / 2, cy - sz / 2, x + sz / 2, cy + sz / 2); // mullion
    doc.line(x, cy, x + sz, cy);                            // transom
  } else { // opening (no door): two jambs
    doc.setDrawColor(100, 116, 139);
    doc.line(x, cy - sz / 2, x, cy + sz / 2);
    doc.line(x + sz, cy - sz / 2, x + sz, cy + sz / 2);
  }
}

// Plan-view symbol for a fence STYLE, drawn with jsPDF primitives so the print
// legend matches the on-screen FenceGlyph (board=solid, pickets=ticks,
// mesh=diamond hatch, slat=dashed). `yBase` is the row's text baseline.
function drawFenceSymbol(doc, style, hex, x, yBase, w) {
  const [r, g, b] = hexRgb(hex);
  doc.setDrawColor(r, g, b);
  const y = yBase - 2.5;
  if (style === 'pickets') {
    doc.setLineWidth(0.7);
    doc.line(x, y + 3, x + w, y + 3);
    for (let px = x + 1; px <= x + w; px += 3) doc.line(px, y - 2.5, px, y + 3);
  } else if (style === 'mesh') {
    doc.setLineWidth(0.6);
    for (let px = x; px < x + w - 1.4; px += 3) { doc.line(px, y + 3, px + 1.5, y - 3); doc.line(px + 1.5, y - 3, px + 3, y + 3); }
    for (let px = x; px < x + w - 1.4; px += 3) { doc.line(px, y - 3, px + 1.5, y + 3); doc.line(px + 1.5, y + 3, px + 3, y - 3); }
  } else if (style === 'slat') {
    doc.setLineWidth(1.6); doc.setLineDashPattern([2.4, 1.7], 0); doc.line(x, y, x + w, y); doc.setLineDashPattern([], 0);
  } else {
    doc.setLineWidth(2.4); doc.line(x, y, x + w, y);
  }
}

// A small north compass drawn with jsPDF primitives.
function drawCompass(doc, cx, cy, r) {
  doc.setFillColor(255, 255, 255); doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.8);
  doc.circle(cx, cy, r, 'FD');
  // needle: north half navy, south half light
  doc.setFillColor(10, 37, 64);
  doc.triangle(cx, cy - r * 0.66, cx - r * 0.26, cy, cx + r * 0.26, cy, 'F');
  doc.setFillColor(148, 163, 184);
  doc.triangle(cx, cy + r * 0.66, cx - r * 0.26, cy, cx + r * 0.26, cy, 'F');
  doc.setFont('Poppins', 'bold'); doc.setFontSize(r * 0.7); doc.setTextColor(10, 37, 64);
  doc.text('N', cx, cy - r - 2, { align: 'center' });
}

// Compass facing of a wall/fence (outward normal away from the group centroid).
// North = up (−Y). Returns an 8-point label (N, NE, …).
function facingOf(el, type, model) {
  const a = el.a, b = el.b, len = dist(a, b) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cen = centroidOf((type === 'wall' ? model.walls : model.fences).flatMap((e) => [e.a, e.b]));
  const sign = nx * (cen.x - mid.x) + ny * (cen.y - mid.y) < 0 ? 1 : -1;
  const ox = nx * sign, oy = ny * sign;
  let bearing = Math.atan2(ox, -oy) * 180 / Math.PI; if (bearing < 0) bearing += 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8];
}

// Draw the legend / title block: title, quantities, and a door/window schedule.
function drawLegend(doc, q, model, opts, x, y, w, h) {
  const pad = 14, right = x + w - pad;
  let cy = y + pad + 4;
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(1.2);
  doc.roundedRect(x, y, w, h, 4, 4, 'S');

  // title block with a teal accent rule
  doc.setTextColor(10, 37, 64); doc.setFont('Poppins', 'bold'); doc.setFontSize(15);
  doc.text(opts.title || 'PlanForge Plan', x + pad, cy); cy += 6;
  doc.setDrawColor(20, 184, 166); doc.setLineWidth(2); doc.line(x + pad, cy, x + pad + 34, cy); cy += 11;
  doc.setFont('Poppins', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
  doc.text(`Wall & Fence Layout  ·  ${new Date().toLocaleDateString()}`, x + pad, cy); cy += 16;

  const section = (t) => { doc.setFont('Poppins', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(t.toUpperCase(), x + pad, cy); cy += 4; doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.6); doc.line(x + pad, cy, right, cy); cy += 11; };
  const row = (label, val, sym, indent = 0) => {
    doc.setTextColor(10, 37, 64); doc.setFont('Poppins', 'normal'); doc.setFontSize(10);
    if (sym) { drawFenceSymbol(doc, sym.style, sym.color, x + pad, cy - 3, 20); doc.text(label, x + pad + 26, cy); }
    else doc.text(label, x + pad + indent, cy);
    doc.setFont('Poppins', 'bold'); doc.text(String(val), right, cy, { align: 'right' });
    doc.setDrawColor(232, 237, 243); doc.setLineWidth(0.4); doc.line(x + pad, cy + 4, right, cy + 4);
    cy += 15;
  };
  // small grey note line (component breakdown), no rule. Starts at the left
  // margin (not indented under the symbol) and shrinks to fit so long breakdowns
  // like "20 posts · 20 sections · 269 boards · 1 gate" never clip the edge.
  const note = (t) => {
    doc.setFont('Poppins', 'normal'); doc.setTextColor(120, 132, 148);
    let fs = 7.6; doc.setFontSize(fs);
    const maxW = w - pad * 2;
    while (fs > 5.6 && doc.getTextWidth(t) > maxW) { fs -= 0.3; doc.setFontSize(fs); }
    doc.text(t, x + pad, cy); cy += 11;
  };

  section('Quantities');
  row('Wall linear ft', q.wallLF.toFixed(1));
  if (q.wallExtLF > 0 || q.wallIntLF > 0) { doc.setFontSize(7.6); doc.setTextColor(120, 132, 148); doc.setFont('Poppins', 'normal'); doc.text(`exterior ${q.wallExtLF.toFixed(0)} ft  ·  interior ${q.wallIntLF.toFixed(0)} ft`, x + pad, cy); cy += 12; }
  row('Doors / Windows', `${q.doorCount} / ${q.windowCount}`);
  if (q.openingCount) row('Openings', q.openingCount);
  cy += 4;

  // ---- Fence schedule with per-type component breakdown ----
  const fc = fenceComponents(model);
  if (Object.keys(fc).length) {
    section('Fence Schedule');
    for (const v of Object.values(fc)) {
      row(v.label, `${v.lf.toFixed(1)} ft`, v);
      const parts = [`${v.posts} posts`, `${v.sections} sections`, `${v.comp.n} ${v.comp.label.toLowerCase()}`];
      if (v.gates) parts.push(`${v.gates} gate${v.gates > 1 ? 's' : ''}`);
      note(parts.join('  ·  '));
    }
    row('Total fence ft', q.fenceLF.toFixed(1));
    row('Total posts / gates', `${q.postCount} / ${q.gateCount}`);
    cy += 4;
  }

  // ---- Door & Window schedule (grouped by type + size) ----
  const groups = new Map();
  (model.openings || []).forEach((o) => {
    const key = `${o.type}|${o.width}|${o.height}|${o.style || ''}`;
    if (!groups.has(key)) groups.set(key, { type: o.type, w: o.width, ht: o.height, style: o.style, n: 0 });
    groups.get(key).n++;
  });
  const list = [...groups.values()].sort((p, r) => p.type.localeCompare(r.type) || p.w - r.w);
  if (list.length) {
    section('Door & Window Schedule');
    const marks = { door: 0, window: 0, opening: 0 };
    const pre = { door: 'D', window: 'W', opening: 'O' };
    const markX = x + pad + 20, sizeX = x + pad + 56; // leave room for the icon
    doc.setFontSize(8); doc.setTextColor(120, 132, 148); doc.setFont('Poppins', 'bold');
    doc.text('MARK', markX, cy); doc.text('SIZE', sizeX, cy); doc.text('QTY', right, cy, { align: 'right' });
    cy += 12;
    for (const g of list) {
      const mark = pre[g.type] + (++marks[g.type]);
      drawOpeningSymbol(doc, g.type, x + pad, cy - 1, 12); // mark icon
      doc.setFont('Poppins', 'bold'); doc.setFontSize(9.5); doc.setTextColor(10, 37, 64);
      doc.text(mark, markX, cy);
      doc.setFont('Poppins', 'normal');
      const size = `${formatFeetInches(g.w)} × ${formatFeetInches(g.ht)}`;
      doc.text(size, sizeX, cy);
      doc.text('×' + g.n, right, cy, { align: 'right' });
      doc.setTextColor(120, 132, 148); doc.setFontSize(7.5);
      doc.text(g.type === 'window' && g.style ? `${g.type} · ${g.style}` : g.type, sizeX, cy + 7);
      doc.setDrawColor(232, 237, 243); doc.setLineWidth(0.4); doc.line(x + pad, cy + 10, right, cy + 10);
      cy += 18;
    }
  }

  cy = Math.max(cy + 6, y + h - 34);
  doc.setFont('Poppins', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 132, 148);
  doc.text(`Units: ${opts.dimUnit === 'in' ? 'inches' : 'feet & inches'}  ·  Dimensions: ${opts.dimMode || 'exterior'}`, x + pad, cy); cy += 11;
  doc.text(`North is up. Drawing fit to page — read dimensions.`, x + pad, cy);
}

export async function exportPlanPDF(model, opts = {}) {
  const q = computeQuantities(model);

  const orientation = opts.orientation || 'landscape';
  const format = opts.paper || 'letter';
  const doc = new jsPDF({ orientation, unit: 'pt', format });
  // embed Poppins so the export renders in the same font as the app (lazy import
  // keeps the ~420KB of font base64 out of the main bundle). Falls back to
  // Helvetica if it can't load.
  try {
    const { POPPINS_REGULAR, POPPINS_SEMIBOLD } = await import('./fonts/poppins.js');
    doc.addFileToVFS('Poppins-Regular.ttf', POPPINS_REGULAR);
    doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
    doc.addFileToVFS('Poppins-SemiBold.ttf', POPPINS_SEMIBOLD);
    doc.addFont('Poppins-SemiBold.ttf', 'Poppins', 'bold');
  } catch (e) { /* keep Helvetica */ }
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 28;

  const legendW = opts.includeLegend ? 196 : 0;
  const gap = opts.includeLegend ? 14 : 0;
  const areaX = M, areaY = M;
  const areaW = PW - M * 2 - legendW - gap;
  const areaH = PH - M * 2;
  const innerPad = 16;
  const fitW = areaW - innerPad * 2, fitH = areaH - innerPad * 2;

  // build the plan knowing the on-page fit box, so label fonts come out as real
  // points (10pt dimensions) regardless of plan size
  const { svg, wFt, hFt } = buildPlanSvg(model, { ...opts, fitW, fitH });

  // drawing border
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(1.2);
  doc.roundedRect(areaX, areaY, areaW, areaH, 4, 4, 'S');

  // fit the plan (aspect-correct) inside the drawing area
  const sc = Math.min(fitW / wFt, fitH / hFt);
  const dw = wFt * sc, dh = hFt * sc;
  const dx = areaX + innerPad + (fitW - dw) / 2;
  const dy = areaY + innerPad + (fitH - dh) / 2;

  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden';
  holder.innerHTML = svg;
  document.body.appendChild(holder);
  try {
    await svg2pdf(holder.querySelector('svg'), doc, { x: dx, y: dy, width: dw, height: dh });
  } finally {
    holder.remove();
  }

  // north compass in the top-right corner of the drawing area
  drawCompass(doc, areaX + areaW - 26, areaY + 30, 14);

  if (opts.includeLegend) {
    drawLegend(doc, q, model, opts, PW - M - legendW, M, legendW, areaH);
  }

  if (opts.elevations && opts.elevations.length) {
    await drawElevationsPage(doc, opts.elevations, model, opts, format, orientation);
  }

  if (opts.views3d && opts.views3d.length) {
    draw3DViewsPage(doc, opts.views3d, opts.title, format, orientation);
  }

  doc.save((opts.fileName || 'planforge-plan') + '.pdf');
}

// Build a front-view (elevation) of one wall/fence as an SVG string in feet
// coordinates, mirroring the on-screen elevation editor. svg2pdf scales it.
function buildElevationSvg(el, type, model, opts) {
  const isWall = type === 'wall';
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const L = dist(el.a, el.b);
  const H = el.height || (isWall ? 8 : 6);
  const items = isWall ? model.openings.filter((o) => o.wallId === el.id) : model.gates.filter((g) => g.fenceId === el.id);
  const fmt = (v) => formatFeetInches(v, { unit: opts.dimUnit });
  const padX = 1.9, padTop = Math.max(1.2, H * 0.18), padBot = 3.6;
  const Wt = L + padX * 2, Ht = H + padTop + padBot;
  const yG = padTop + H;
  const Xs = (x) => r2(padX + x), Ys = (y) => r2(yG - y);
  const SW = 0.03, e = [];
  // dimension number sizes (already bumped 50% over the prior values)
  const FS = { comp: 0.6, sill: 0.54, seg: 0.54, ovH: 0.66, ovW: 0.69 };
  const txt = (x, y, t, fs, anchor = 'middle', bold = false, baseline = '') => `<text x="${r2(x)}" y="${r2(y)}" font-size="${fs}" fill="${NAVY}" font-family="Helvetica"${bold ? ' font-weight="bold"' : ''} text-anchor="${anchor}"${baseline ? ` dominant-baseline="${baseline}"` : ''}>${t}</text>`;
  // a component dimension path: witness lines + dim line + ticks + label. dir 'h'
  // (a,b are x, level `lvl` is the dim-line y, witness from edge y `wf`) or 'v'.
  const compDim = (dir, a, b, lvl, wf, label, fs) => {
    const tk2 = 0.12;
    if (dir === 'h') {
      e.push(`<line x1="${r2(a)}" y1="${r2(wf)}" x2="${r2(a)}" y2="${r2(lvl)}" stroke="${NAVY}" stroke-width="${SW * 0.4}"/>`);
      e.push(`<line x1="${r2(b)}" y1="${r2(wf)}" x2="${r2(b)}" y2="${r2(lvl)}" stroke="${NAVY}" stroke-width="${SW * 0.4}"/>`);
      e.push(`<line x1="${r2(a)}" y1="${r2(lvl)}" x2="${r2(b)}" y2="${r2(lvl)}" stroke="${NAVY}" stroke-width="${SW * 0.55}"/>`);
      e.push(`<line x1="${r2(a)}" y1="${r2(lvl - tk2)}" x2="${r2(a)}" y2="${r2(lvl + tk2)}" stroke="${NAVY}" stroke-width="${SW * 0.55}"/>`);
      e.push(`<line x1="${r2(b)}" y1="${r2(lvl - tk2)}" x2="${r2(b)}" y2="${r2(lvl + tk2)}" stroke="${NAVY}" stroke-width="${SW * 0.55}"/>`);
      e.push(txt((a + b) / 2, lvl - 0.16, label, fs));
    } else {
      const right = lvl > wf;
      e.push(`<line x1="${r2(wf)}" y1="${r2(a)}" x2="${r2(lvl)}" y2="${r2(a)}" stroke="${NAVY}" stroke-width="${SW * 0.4}"/>`);
      e.push(`<line x1="${r2(wf)}" y1="${r2(b)}" x2="${r2(lvl)}" y2="${r2(b)}" stroke="${NAVY}" stroke-width="${SW * 0.4}"/>`);
      e.push(`<line x1="${r2(lvl)}" y1="${r2(a)}" x2="${r2(lvl)}" y2="${r2(b)}" stroke="${NAVY}" stroke-width="${SW * 0.55}"/>`);
      e.push(`<line x1="${r2(lvl - tk2)}" y1="${r2(a)}" x2="${r2(lvl + tk2)}" y2="${r2(a)}" stroke="${NAVY}" stroke-width="${SW * 0.55}"/>`);
      e.push(`<line x1="${r2(lvl - tk2)}" y1="${r2(b)}" x2="${r2(lvl + tk2)}" y2="${r2(b)}" stroke="${NAVY}" stroke-width="${SW * 0.55}"/>`);
      e.push(txt(lvl + (right ? 0.16 : -0.16), (a + b) / 2, label, fs, right ? 'start' : 'end', false, 'middle'));
    }
  };

  e.push(`<line x1="${Xs(-0.4)}" y1="${yG}" x2="${Xs(L + 0.4)}" y2="${yG}" stroke="${NAVY}" stroke-width="${SW * 1.6}"/>`);
  if (isWall) {
    e.push(`<rect x="${Xs(0)}" y="${Ys(H)}" width="${r2(L)}" height="${r2(H)}" fill="#ffffff" stroke="${NAVY}" stroke-width="${SW * 1.4}"/>`);
  } else {
    const ft = FENCE_TYPES[el.fenceType] || FENCE_TYPES.wood; const col = el.color || ft.color;
    e.push(`<rect x="${Xs(0)}" y="${Ys(H)}" width="${r2(L)}" height="${r2(H)}" fill="${col}" fill-opacity="${ft.style === 'mesh' ? 0.2 : 0.85}" stroke="${NAVY}" stroke-width="${SW}"/>`);
    if (ft.style === 'slat' || ft.style === 'board' || ft.style === 'solid') for (let xf = 0.5; xf < L; xf += 0.5) e.push(`<line x1="${Xs(xf)}" y1="${Ys(H)}" x2="${Xs(xf)}" y2="${yG}" stroke="rgba(0,0,0,0.18)" stroke-width="${SW * 0.5}"/>`);
    const postTop = el.postHeight ?? (H + 0.2);
    for (const p of postsAlong({ x: 0, y: 0 }, { x: L, y: 0 }, el.postSpacing || 8)) e.push(`<rect x="${r2(padX + p.x - 0.12)}" y="${Ys(postTop)}" width="0.24" height="${r2(postTop)}" fill="#475569"/>`);
  }

  for (const it of items) {
    const center = it.t * L, w = it.width, left = center - w / 2, right = center + w / 2;
    const bottom = isWall && it.type === 'window' ? (it.sill ?? 3) : 0;
    const top = isWall ? bottom + it.height : (it.height ?? H);
    const accent = isWall ? (it.type === 'door' ? '#8a5a32' : '#2563eb') : NAVY;
    e.push(`<rect x="${Xs(left)}" y="${Ys(top)}" width="${r2(w)}" height="${r2(top - bottom)}" fill="#ffffff"/>`);
    if (isWall && it.type === 'window') {
      const H = top - bottom, fw = Math.min(0.15, w * 0.1, H * 0.1);
      const gL = left + fw, gW = w - 2 * fw, gTop = top - fw, gBot = bottom + fw, gH = gTop - gBot;
      e.push(`<rect x="${Xs(left)}" y="${Ys(top)}" width="${r2(w)}" height="${r2(H)}" fill="#ffffff" stroke="${accent}" stroke-width="${SW}"/>`); // outer frame
      e.push(`<rect x="${Xs(gL)}" y="${Ys(gTop)}" width="${r2(gW)}" height="${r2(gH)}" fill="#eaf2fb" stroke="${accent}" stroke-width="${r2(SW * 0.6)}"/>`); // glazing
      e.push(`<polygon points="${Xs(gL)},${Ys(gBot + gH * 0.45)} ${Xs(gL + gW * 0.5)},${Ys(gTop)} ${Xs(gL + gW)},${Ys(gTop)} ${Xs(gL + gW)},${Ys(gTop - gH * 0.18)} ${Xs(gL)},${Ys(gBot + gH * 0.15)}" fill="#dbeafe" opacity="0.5"/>`); // sheen
      const { V, H: Hb } = windowBars(it.style, it.grid);
      V.forEach((b) => e.push(`<line x1="${Xs(gL + b.at * gW)}" y1="${Ys(gTop)}" x2="${Xs(gL + b.at * gW)}" y2="${Ys(gBot)}" stroke="${accent}" stroke-width="${r2(SW * (b.major ? 1.1 : 0.6))}"/>`));
      Hb.forEach((b) => { const yy = Ys(gBot + b.at * gH); e.push(`<line x1="${Xs(gL)}" y1="${yy}" x2="${Xs(gL + gW)}" y2="${yy}" stroke="${accent}" stroke-width="${r2(SW * (b.major ? 1.1 : 0.6))}"/>`); });
      e.push(`<rect x="${Xs(left - 0.12)}" y="${Ys(bottom)}" width="${r2(w + 0.24)}" height="${r2(0.14)}" fill="#ffffff" stroke="${accent}" stroke-width="${r2(SW * 0.7)}"/>`); // projecting sill
      if (bottom > 0) compDim('v', Ys(bottom), Ys(0), Xs(left) - 0.45, Xs(left), fmt(bottom), FS.sill); // sill on the left
    } else if (isWall && it.type === 'door') {
      const H = top - bottom;
      e.push(`<rect x="${Xs(left)}" y="${Ys(top)}" width="${r2(w)}" height="${r2(H)}" fill="#eef2f6" stroke="${accent}" stroke-width="${SW}"/>`); // slab
      const m = Math.min(0.2, w * 0.16), rail = Math.max(0.12, H * 0.07), innerW = w - 2 * m;
      const splitF = bottom + rail + (H - 2 * rail) * 0.42;
      const panel = (pBot, pTop) => {
        e.push(`<rect x="${Xs(left + m)}" y="${Ys(pTop)}" width="${r2(innerW)}" height="${r2(pTop - pBot)}" fill="#ffffff" stroke="${accent}" stroke-width="${r2(SW * 0.7)}"/>`);
        e.push(`<rect x="${Xs(left + m + 0.06)}" y="${Ys(pTop - 0.06)}" width="${r2(innerW - 0.12)}" height="${r2(pTop - pBot - 0.12)}" fill="none" stroke="${accent}" stroke-width="${r2(SW * 0.5)}" opacity="0.6"/>`);
      };
      panel(splitF + rail / 2, top - rail);    // top panel
      panel(bottom + rail, splitF - rail / 2); // bottom panel
      const latF = (it.hinge || 'left') === 'left' ? left + w - m : left + m, dir = (it.hinge || 'left') === 'left' ? -1 : 1, ly = bottom + H * 0.48;
      e.push(`<circle cx="${Xs(latF)}" cy="${Ys(ly)}" r="${r2(0.07)}" fill="${accent}"/>`);
      e.push(`<line x1="${Xs(latF)}" y1="${Ys(ly)}" x2="${Xs(latF + dir * 0.25)}" y2="${Ys(ly)}" stroke="${accent}" stroke-width="${r2(SW * 1.3)}" stroke-linecap="round"/>`);
    } else if (isWall) {
      e.push(`<rect x="${Xs(left)}" y="${Ys(top)}" width="${r2(w)}" height="${r2(top - bottom)}" fill="none" stroke="${accent}" stroke-width="${SW}" stroke-dasharray="0.15 0.1"/>`);
    } else {
      e.push(`<rect x="${Xs(left)}" y="${Ys(top)}" width="${r2(w)}" height="${r2(top - bottom)}" fill="#9aa3ad" fill-opacity="0.85" stroke="${NAVY}" stroke-width="${SW}"/>`);
      e.push(`<line x1="${Xs(left)}" y1="${Ys(bottom)}" x2="${Xs(left + w)}" y2="${Ys(top)}" stroke="${NAVY}" stroke-width="${SW * 0.8}"/>`);
    }
    compDim('h', Xs(left), Xs(right), Ys(top) - 0.45, Ys(top), fmt(w), FS.comp);            // width (above)
    compDim('v', Ys(top), Ys(bottom), Xs(right) + 0.45, Xs(right), fmt(top - bottom), FS.comp); // height (right)
  }

  // overall height (right side)
  e.push(`<line x1="${Xs(L + 0.7)}" y1="${Ys(0)}" x2="${Xs(L + 0.7)}" y2="${Ys(H)}" stroke="${NAVY}" stroke-width="${SW}"/>`);
  e.push(txt(padX + L + 0.9, yG - H / 2, fmt(H), FS.ovH, 'start', true, 'middle'));

  // distance string (stations at opening/gate edges + fence posts) and overall width
  const segY = yG + 1.05, ovY = yG + 2.5, tk = 0.18;
  const edges = new Set([0, L]);
  items.forEach((it) => { const c = it.t * L, w = it.width; edges.add(cl(c - w / 2, 0, L)); edges.add(cl(c + w / 2, 0, L)); });
  if (!isWall) postsAlong({ x: 0, y: 0 }, { x: L, y: 0 }, el.postSpacing || 8).forEach((p) => edges.add(+p.x.toFixed(2)));
  const stations = [...edges].map((v) => +v.toFixed(2)).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.05);
  [0, L].forEach((s) => e.push(`<line x1="${Xs(s)}" y1="${yG}" x2="${Xs(s)}" y2="${r2(ovY + tk)}" stroke="${NAVY}" stroke-width="${SW * 0.5}" opacity="0.5"/>`));
  e.push(`<line x1="${Xs(0)}" y1="${r2(segY)}" x2="${Xs(L)}" y2="${r2(segY)}" stroke="${NAVY}" stroke-width="${SW * 0.6}"/>`);
  stations.forEach((s) => e.push(`<line x1="${Xs(s)}" y1="${r2(segY - tk)}" x2="${Xs(s)}" y2="${r2(segY + tk)}" stroke="${NAVY}" stroke-width="${SW * 0.6}"/>`));
  for (let i = 0; i < stations.length - 1; i++) { const s0 = stations[i], s1 = stations[i + 1]; if (s1 - s0 < 0.05) continue; e.push(txt(padX + (s0 + s1) / 2, segY - 0.16, fmt(s1 - s0), FS.seg)); }
  e.push(`<line x1="${Xs(0)}" y1="${r2(ovY)}" x2="${Xs(L)}" y2="${r2(ovY)}" stroke="${NAVY}" stroke-width="${SW * 0.9}"/>`);
  [0, L].forEach((s) => e.push(`<line x1="${Xs(s)}" y1="${r2(ovY - tk)}" x2="${Xs(s)}" y2="${r2(ovY + tk)}" stroke="${NAVY}" stroke-width="${SW * 0.9}"/>`));
  e.push(txt(padX + L / 2, ovY + 0.5, fmt(L), FS.ovW, 'middle', true));

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(Wt)} ${r2(Ht)}">${e.join('')}</svg>`, wFt: Wt, hFt: Ht };
}

// A page of selected elevations laid out in a grid, each captioned.
async function drawElevationsPage(doc, elevations, model, opts, format, orientation) {
  const built = [];
  for (const selv of elevations) {
    const el = selv.type === 'wall' ? model.walls.find((w) => w.id === selv.id) : model.fences.find((f) => f.id === selv.id);
    if (!el) continue;
    const label = `${selv.type === 'wall' ? 'Wall' : 'Fence'} — ${formatFeetInches(dist(el.a, el.b))}${selv.type === 'fence' ? ` · ${(FENCE_TYPES[el.fenceType] || {}).label || ''}` : ''}`;
    built.push({ ...buildElevationSvg(el, selv.type, model, opts), label, facing: facingOf(el, selv.type, model) });
  }
  if (!built.length) return;

  // Paginate: at most PER_PAGE elevations per page (2 cols × 3 rows) so each one
  // is large enough to read, instead of cramming them all onto one tiny grid.
  const PER_PAGE = 6;
  const pages = Math.ceil(built.length / PER_PAGE);
  for (let p = 0; p < pages; p++) {
    const chunk = built.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
    doc.addPage(format, orientation);
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 28;
    doc.setFont('Poppins', 'bold'); doc.setFontSize(16); doc.setTextColor(10, 37, 64);
    const heading = (opts.title || 'PlanForge Plan') + ' — Elevations' + (pages > 1 ? ` (${p + 1}/${pages})` : '');
    doc.text(heading, M, M + 12);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.8); doc.line(M, M + 20, PW - M, M + 20);

    const cols = chunk.length > 1 ? 2 : 1;
    const rows = Math.ceil(chunk.length / cols);
    const gap = 18, top = M + 34, capH = 24;
    const cellW = (PW - M * 2 - gap * (cols - 1)) / cols;
    const cellH = (PH - top - M - gap * (rows - 1)) / rows;
    for (let i = 0; i < chunk.length; i++) {
      const v = chunk[i], r = Math.floor(i / cols), c = i % cols;
      const x = M + c * (cellW + gap), y = top + r * (cellH + gap);
      const availH = cellH - capH;
      const sc = Math.min(cellW / v.wFt, availH / v.hFt);
      const dw = v.wFt * sc, dh = v.hFt * sc;
      const ix = x + (cellW - dw) / 2, iy = y + (availH - dh) / 2;
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-9999px;top:0';
      holder.innerHTML = v.svg;
      document.body.appendChild(holder);
      try { await svg2pdf(holder.querySelector('svg'), doc, { x: ix, y: iy, width: dw, height: dh }); } finally { holder.remove(); }
      // caption: wall/fence title, then the facing orientation on the line below
      doc.setFont('Poppins', 'bold'); doc.setFontSize(10); doc.setTextColor(10, 37, 64);
      doc.text(v.label, x + cellW / 2, y + cellH - 12, { align: 'center' });
      doc.setFont('Poppins', 'bold'); doc.setFontSize(7.5); doc.setTextColor(37, 99, 235);
      doc.text('Faces ' + (FACING_NAMES[v.facing] || v.facing || ''), x + cellW / 2, y + cellH - 3, { align: 'center' });
    }
  }
}

const FACING_NAMES = { N: 'North', NE: 'Northeast', E: 'East', SE: 'Southeast', S: 'South', SW: 'Southwest', W: 'West', NW: 'Northwest' };

// Second page: rendered 3D snapshots laid out in a grid, each captioned.
function draw3DViewsPage(doc, views, title, format, orientation) {
  doc.addPage(format, orientation);
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 28;

  doc.setFont('Poppins', 'bold'); doc.setFontSize(16); doc.setTextColor(10, 37, 64);
  doc.text((title || 'PlanForge Plan') + ' — 3D Views', M, M + 12);
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.8);
  doc.line(M, M + 20, PW - M, M + 20);

  const cols = views.length <= 1 ? 1 : 2;
  const rows = Math.ceil(views.length / cols);
  const gap = 16;
  const top = M + 34;
  const cellW = (PW - M * 2 - gap * (cols - 1)) / cols;
  const cellH = (PH - top - M - gap * (rows - 1)) / rows;
  const capH = 16;                 // caption strip under each image

  views.forEach((v, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = M + c * (cellW + gap), y = top + r * (cellH + gap);
    const availH = cellH - capH;
    const imgAspect = (v.w && v.h) ? v.w / v.h : 1.5;
    let iw = cellW, ih = iw / imgAspect;
    if (ih > availH) { ih = availH; iw = ih * imgAspect; }
    const ix = x + (cellW - iw) / 2, iy = y + (availH - ih) / 2;
    doc.addImage(v.dataUrl, 'PNG', ix, iy, iw, ih, undefined, 'FAST');
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.8);
    doc.rect(ix, iy, iw, ih);
    doc.setFont('Poppins', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text(v.label, x + cellW / 2, y + cellH - 3, { align: 'center' });
  });
}
