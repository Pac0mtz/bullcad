import { dist, postsAlong, FENCE_TYPES, WALL_MATERIALS, EQUIPMENT } from './geometry.js';

// Compute the full bill-of-quantities from the geometry model.
const polyArea = (pts) => { let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p.x * q.y - q.x * p.y; } return Math.abs(A) / 2; };

export function computeQuantities({ walls, openings, fences, gates, posts = [], equips = [], roomAffected = {}, regions = [] }) {
  // Wall linear footage — total, exterior/interior split, and by material
  let wallLF = 0, wallExtLF = 0, wallIntLF = 0;
  const wallByMaterial = {};
  for (const w of walls) {
    const L = dist(w.a, w.b);
    wallLF += L;
    if (w.exterior) wallExtLF += L; else wallIntLF += L;
    const key = w.material || 'general';
    if (!wallByMaterial[key]) wallByMaterial[key] = { label: WALL_MATERIALS[key]?.label || 'General', lf: 0, color: WALL_MATERIALS[key]?.color || '#cbd5e1' };
    wallByMaterial[key].lf += L;
  }

  // Fence LF totalled and grouped by type
  const fenceByType = {};
  let fenceLF = 0;
  for (const f of fences) {
    const L = dist(f.a, f.b);
    fenceLF += L;
    const key = f.fenceType;
    if (!fenceByType[key]) fenceByType[key] = {
      label: FENCE_TYPES[key]?.label || key,
      style: FENCE_TYPES[key]?.style || 'board',
      color: f.color || FENCE_TYPES[key]?.color || '#999999',
      lf: 0, segments: 0,
    };
    fenceByType[key].lf += L;
    fenceByType[key].segments += 1;
  }

  // Posts: union of post points per fence (dedupe shared corners across segments)
  const postSet = new Map();
  for (const f of fences) {
    const pts = postsAlong(f.a, f.b, f.postSpacing || 8);
    for (const p of pts) {
      const k = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      postSet.set(k, p);
    }
  }
  // individually-placed posts add to the count (dedupe against an auto post at the same spot)
  for (const p of posts) {
    const f = fences.find((x) => x.id === p.fenceId);
    if (!f) continue;
    const pt = { x: f.a.x + (f.b.x - f.a.x) * p.t, y: f.a.y + (f.b.y - f.a.y) * p.t };
    postSet.set(`${pt.x.toFixed(2)},${pt.y.toFixed(2)}`, pt);
  }
  const postCount = postSet.size;

  // Opening counts by type
  const openingCounts = { door: 0, window: 0, opening: 0 };
  for (const o of openings) openingCounts[o.type] = (openingCounts[o.type] || 0) + 1;

  // Restoration equipment counts by kind (for the drying-map takeoff / equipment-days)
  const equipByKind = {};
  for (const e of (equips || [])) {
    const k = e.kind;
    if (!equipByKind[k]) equipByKind[k] = { label: EQUIPMENT[k]?.label || k, color: EQUIPMENT[k]?.color || '#64748b', count: 0 };
    equipByKind[k].count += 1;
  }
  const affectedRooms = Object.keys(roomAffected || {}).length;
  const affectedRegions = (regions || []).length;
  const affectedRegionArea = (regions || []).reduce((s, r) => s + polyArea(r.points || []), 0);

  return {
    equipByKind,
    equipCount: (equips || []).length,
    affectedRooms,
    affectedRegions,
    affectedRegionArea,
    wallLF,
    wallExtLF,
    wallIntLF,
    wallByMaterial,
    fenceLF,
    fenceByType,
    postCount,
    gateCount: gates.length,
    doorCount: openingCounts.door,
    windowCount: openingCounts.window,
    openingCount: openingCounts.opening,
    wallSegments: walls.length,
    fenceSegments: fences.length,
  };
}

// Per-fence-type material breakdown for the PDF legend: linear ft, posts,
// sections (bays between posts), gates, and a style-appropriate component count
// (pickets / rails / boards / slats / panels).
export function fenceComponents({ fences = [], gates = [] }) {
  const byType = {};
  for (const f of fences) {
    const key = f.fenceType, ft = FENCE_TYPES[key] || {};
    const L = dist(f.a, f.b);
    const posts = postsAlong(f.a, f.b, f.postSpacing || 8);
    if (!byType[key]) byType[key] = { label: ft.label || key, style: ft.style, color: f.color || ft.color || '#999', lf: 0, sections: 0, gates: 0, postSet: new Map() };
    const g = byType[key];
    g.lf += L;
    g.sections += Math.max(0, posts.length - 1);
    for (const p of posts) g.postSet.set(`${p.x.toFixed(2)},${p.y.toFixed(2)}`, 1);
  }
  for (const gt of gates) {
    const f = fences.find((x) => x.id === gt.fenceId);
    if (f && byType[f.fenceType]) byType[f.fenceType].gates++;
  }
  const out = {};
  for (const [k, g] of Object.entries(byType)) {
    const ft = FENCE_TYPES[k] || {};
    const comp = ft.style === 'pickets' ? { label: 'Pickets', n: Math.round(g.lf / (ft.slim ? 0.45 : 0.6)) }
      : ft.style === 'rail' ? { label: 'Rails', n: (ft.rails || 3) * g.sections }
      : ft.style === 'board' ? { label: 'Boards', n: Math.round(g.lf / 0.55) }
      : ft.style === 'slat' ? { label: 'Slats', n: Math.round((ft.height || 6) / 0.5) * g.sections }
      : { label: 'Panels', n: g.sections };
    out[k] = { label: g.label, style: g.style, color: g.color, lf: g.lf, posts: g.postSet.size, sections: g.sections, gates: g.gates, comp };
  }
  return out;
}

// Build a flat, copyable table (array of [label, value] rows) for export.
export function quantitiesRows(q) {
  const rows = [
    ['Wall linear footage', `${q.wallLF.toFixed(1)} ft`],
    ['  • Exterior', `${q.wallExtLF.toFixed(1)} ft`],
    ['  • Interior', `${q.wallIntLF.toFixed(1)} ft`],
  ];
  for (const v of Object.values(q.wallByMaterial)) rows.push([`  • ${v.label}`, `${v.lf.toFixed(1)} ft`]);
  rows.push(
    ['Wall segments', q.wallSegments],
    ['Doors', q.doorCount],
    ['Windows', q.windowCount],
    ['Openings', q.openingCount],
    ['Fence linear footage (total)', `${q.fenceLF.toFixed(1)} ft`],
  );
  for (const [k, v] of Object.entries(q.fenceByType)) {
    rows.push([`  • ${v.label}`, `${v.lf.toFixed(1)} ft`]);
  }
  rows.push(['Gates', q.gateCount]);
  rows.push(['Posts', q.postCount]);
  return rows;
}
