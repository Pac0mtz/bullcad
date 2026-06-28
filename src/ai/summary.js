// Build a compact, model-readable snapshot of the current plan so the assistant
// can "see" what's on the canvas (ids, coordinates, sizes) before editing it.
// Everything is in FEET; the canvas coordinate system is x → right, y → down.
import { dist, detectRooms } from '../utils/geometry.js';

const r2 = (n) => Math.round(n * 100) / 100;
const inches = (ft) => Math.round((ft || 0) * 12 * 10) / 10;

export function planSummary(s) {
  const walls = (s.walls || []).map((w) => ({
    id: w.id,
    a: { x: r2(w.a.x), y: r2(w.a.y) },
    b: { x: r2(w.b.x), y: r2(w.b.y) },
    length_ft: r2(dist(w.a, w.b)),
    thickness_in: inches(w.thickness ?? 0.5),
    exterior: !!w.exterior,
  }));
  const fences = (s.fences || []).map((f) => ({
    id: f.id,
    a: { x: r2(f.a.x), y: r2(f.a.y) },
    b: { x: r2(f.b.x), y: r2(f.b.y) },
    length_ft: r2(dist(f.a, f.b)),
    type: f.fenceType,
    height_ft: r2(f.height ?? 0),
  }));
  const openings = (s.openings || []).map((o) => ({
    id: o.id, wall_id: o.wallId, kind: o.type, position: r2(o.t), width_ft: r2(o.width),
  }));
  const gates = (s.gates || []).map((g) => ({
    id: g.id, fence_id: g.fenceId, position: r2(g.t), width_ft: r2(g.width),
  }));

  let rooms = [];
  try {
    rooms = detectRooms(s.walls || []).map((rm) => ({
      area_sqft: Math.round(rm.area),
      centroid: { x: r2(rm.centroid.x), y: r2(rm.centroid.y) },
    }));
  } catch { rooms = []; }

  // overall extent so the model knows where the drawing lives
  const pts = [...walls.flatMap((w) => [w.a, w.b]), ...fences.flatMap((f) => [f.a, f.b])];
  const bounds = pts.length
    ? {
        min: { x: r2(Math.min(...pts.map((p) => p.x))), y: r2(Math.min(...pts.map((p) => p.y))) },
        max: { x: r2(Math.max(...pts.map((p) => p.x))), y: r2(Math.max(...pts.map((p) => p.y))) },
      }
    : null;

  return {
    units: 'feet',
    coordinate_system: 'x increases right, y increases down',
    bounds,
    counts: { walls: walls.length, rooms: rooms.length, fences: fences.length, openings: openings.length, gates: gates.length },
    defaults: {
      wall_thickness_in: inches(s.wallThickness),
      wall_height_ft: s.wallHeight,
      fence_type: s.fenceType,
      fence_height_ft: s.fenceHeight,
    },
    // cap the lists so a huge plan can't blow the context window
    walls: walls.slice(0, 80),
    rooms: rooms.slice(0, 40),
    fences: fences.slice(0, 80),
    openings: openings.slice(0, 80),
    gates: gates.slice(0, 40),
  };
}

export function planSummaryText(s) {
  return JSON.stringify(planSummary(s), null, 0);
}

// One-line human headline used in the empty-state / status row.
export function planHeadline(s) {
  const c = planSummary(s).counts;
  const bits = [];
  if (c.walls) bits.push(`${c.walls} walls`);
  if (c.rooms) bits.push(`${c.rooms} rooms`);
  if (c.fences) bits.push(`${c.fences} fences`);
  return bits.length ? bits.join(' · ') : 'empty plan';
}
