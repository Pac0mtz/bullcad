import React from 'react';
import * as THREE from 'three';
import { dist, angleOf, windowBars, WINDOW_STYLES, WALL_MATERIALS } from '../../utils/geometry.js';

const WALL_COLOR = '#e2e8f0';
const TRIM = '#cbd5e1';
const GLASS = '#7dd3fc';
const FRAME = '#f8fafc';     // window/door frame (painted white)
const DOOR = '#94a3b8';      // door leaf
const HANDLE = '#facc15';    // brass-ish handle

const HILITE = '#2563eb'; // selection glow

// A simple box mesh in the wall-local frame.
function Box({ x, y, w, h, color, depth, opacity, z = 0, roughness = 0.85, metalness = 0, emissive, ...rest }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow {...rest}>
      <boxGeometry args={[Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, depth)]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity != null}
        opacity={opacity ?? 1}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive || '#000000'}
        emissiveIntensity={emissive ? 0.5 : 0}
      />
    </mesh>
  );
}

// Window: outer frame, glazing, and style-driven mullions / muntins.
function Window3D({ o, th, selected, onSelect }) {
  const sill = o.sill ?? 3;
  const w = o.width;
  const h = o.height;
  const cy = sill + h / 2;          // vertical center of glazing
  const fr = Math.min(0.28, w * 0.12); // frame thickness
  const frameZ = th + 0.02;         // frame slightly proud of the wall
  const innerW = w - fr * 2;
  const innerH = h - fr * 2;
  const left = -innerW / 2;
  const bottom = sill + fr;
  const { V, H, hinge } = windowBars(o.style, o.grid);
  const barZ = th + 0.04;
  const fc = selected ? HILITE : FRAME; // frame color (glows when selected)
  const em = selected ? HILITE : undefined;
  const click = (e) => { e.stopPropagation(); onSelect?.(o.id); };

  return (
    <group position={[o.c, 0, 0]} onClick={click}>
      {/* glass pane (recessed) */}
      <Box x={0} y={cy} w={innerW} h={innerH} depth={0.06} color={GLASS}
        opacity={0.32} roughness={0.04} metalness={0.55} />
      {/* outer frame: top / bottom / left / right — hinge side rendered thicker */}
      <Box x={0} y={sill + h - fr / 2} w={w} h={hinge === 'top' ? fr * 1.7 : fr} depth={frameZ} color={fc} emissive={em} roughness={0.6} />
      <Box x={0} y={sill + fr / 2} w={w} h={fr} depth={frameZ} color={fc} emissive={em} roughness={0.6} />
      <Box x={-(w - fr) / 2} y={cy} w={hinge === 'side' ? fr * 1.7 : fr} h={h} depth={frameZ} color={fc} emissive={em} roughness={0.6} />
      <Box x={(w - fr) / 2} y={cy} w={fr} h={h} depth={frameZ} color={fc} emissive={em} roughness={0.6} />
      {/* vertical mullions / muntins */}
      {V.map((b, i) => (
        <Box key={'v' + i} x={left + b.at * innerW} y={cy} w={b.major ? 0.12 : 0.06} h={innerH} depth={barZ} color={FRAME} roughness={0.6} />
      ))}
      {/* horizontal mullions / muntins */}
      {H.map((b, i) => (
        <Box key={'h' + i} x={0} y={bottom + b.at * innerH} w={innerW} h={b.major ? 0.12 : 0.06} depth={barZ} color={FRAME} roughness={0.6} />
      ))}
      {/* projecting exterior sill ledge */}
      <Box x={0} y={sill - 0.06} w={w + 0.3} h={0.12} depth={th + 0.5} z={0} color={TRIM} roughness={0.9} />
    </group>
  );
}

// Glass material shared by the projecting windows.
const glassProps = { color: GLASS, transparent: true, opacity: 0.32, roughness: 0.04, metalness: 0.55 };

// A glazed panel between two x/z points (used for the angled bay sections).
function GlassPanel({ p0, p1, cy, h, frameColor, em }) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  const len = Math.hypot(dx, dz) || 0.01;
  const ry = Math.atan2(-dz, dx);
  return (
    <group position={[(p0.x + p1.x) / 2, cy, (p0.z + p1.z) / 2]} rotation={[0, ry, 0]}>
      <mesh castShadow><boxGeometry args={[len, h, 0.05]} /><meshStandardMaterial {...glassProps} /></mesh>
      <Box x={0} y={h / 2} w={len} h={0.15} depth={0.13} color={frameColor} emissive={em} roughness={0.6} />
      <Box x={0} y={-h / 2} w={len} h={0.15} depth={0.13} color={frameColor} emissive={em} roughness={0.6} />
    </group>
  );
}

// Bay window — three glazed sections projecting outward in a shallow trapezoid.
function Bay3D({ o, outward, selected, onSelect }) {
  const sill = o.sill ?? 2, h = o.height, w = o.width, cy = sill + h / 2;
  const d = (WINDOW_STYLES[o.style]?.depth || 1.6) * outward;
  const wc = w * 0.5;
  const c = [{ x: -w / 2, z: 0 }, { x: -wc / 2, z: d }, { x: wc / 2, z: d }, { x: w / 2, z: 0 }];
  const fc = selected ? HILITE : FRAME, em = selected ? HILITE : undefined;
  const click = (e) => { e.stopPropagation(); onSelect?.(o.id); };
  const shape = new THREE.Shape();
  shape.moveTo(c[0].x, -c[0].z);
  for (let i = 1; i < c.length; i++) shape.lineTo(c[i].x, -c[i].z);
  shape.lineTo(c[0].x, -c[0].z);
  const slab = (y, cast) => (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow={cast} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={fc} emissive={em || '#000000'} emissiveIntensity={em ? 0.4 : 0} side={THREE.DoubleSide} roughness={0.75} />
    </mesh>
  );
  return (
    <group position={[o.c, 0, 0]} onClick={click}>
      {[[0, 1], [1, 2], [2, 3]].map(([i, j], k) => (
        <GlassPanel key={k} p0={c[i]} p1={c[j]} cy={cy} h={h} frameColor={fc} em={em} />
      ))}
      {c.map((p, i) => <Box key={'p' + i} x={p.x} y={cy} w={0.18} h={h + 0.1} depth={0.18} z={p.z} color={fc} emissive={em} roughness={0.6} />)}
      {slab(sill + h, true)}
      {slab(sill, false)}
    </group>
  );
}

// Garden window — a glazed box that bumps out with a roof, sides and a shelf.
function Garden3D({ o, outward, selected, onSelect }) {
  const sill = o.sill ?? 3, h = o.height, w = o.width, cy = sill + h / 2;
  const d = (WINDOW_STYLES[o.style]?.depth || 1.4) * outward;
  const gd = Math.abs(d), zc = d / 2;
  const fc = selected ? HILITE : FRAME, em = selected ? HILITE : undefined;
  const click = (e) => { e.stopPropagation(); onSelect?.(o.id); };
  return (
    <group position={[o.c, 0, 0]} onClick={click}>
      {/* glazing: front, two sides, sloped-flat roof, mid shelf */}
      <Box x={0} y={cy} w={w} h={h} depth={0.05} z={d} color={GLASS} opacity={0.32} roughness={0.04} metalness={0.55} />
      <Box x={-w / 2} y={cy} w={0.05} h={h} depth={gd} z={zc} color={GLASS} opacity={0.32} roughness={0.04} metalness={0.55} />
      <Box x={w / 2} y={cy} w={0.05} h={h} depth={gd} z={zc} color={GLASS} opacity={0.32} roughness={0.04} metalness={0.55} />
      <Box x={0} y={sill + h} w={w} h={0.06} depth={gd} z={zc} color={GLASS} opacity={0.3} roughness={0.04} metalness={0.55} />
      <Box x={0} y={sill + h * 0.5} w={w * 0.94} h={0.05} depth={gd * 0.9} z={zc} color={GLASS} opacity={0.3} roughness={0.04} metalness={0.55} />
      {/* base, header and corner posts */}
      <Box x={0} y={sill - 0.05} w={w + 0.2} h={0.16} depth={gd + 0.2} z={zc} color={TRIM} roughness={0.85} />
      <Box x={0} y={sill + h + 0.06} w={w + 0.2} h={0.16} depth={gd + 0.2} z={zc} color={fc} emissive={em} roughness={0.6} />
      {[[-w / 2, 0], [w / 2, 0], [-w / 2, d], [w / 2, d]].map(([x, z], i) => (
        <Box key={i} x={x} y={cy} w={0.15} h={h + 0.1} depth={0.15} z={z} color={fc} emissive={em} roughness={0.6} />
      ))}
    </group>
  );
}

// Door: casing frame + style-specific leaf/leaves (single/double swing, sliding,
// pocket, bifold) with a handle on hinged styles.
function Door3D({ o, th, selected, onSelect }) {
  const w = o.width;
  const h = o.height;
  const fr = 0.25;
  const style = o.style || 'single';
  const leafW = w - fr * 1.4;
  const leafH = h - fr * 0.7;
  const fc = selected ? HILITE : FRAME;
  const em = selected ? HILITE : undefined;
  const dc = selected ? '#9db7d8' : DOOR;
  const leafD = Math.min(0.18, th * 0.6);
  const click = (e) => { e.stopPropagation(); onSelect?.(o.id); };
  const panel = (px, pw, z, key) => (
    <Box key={key} x={px} y={leafH / 2} w={pw} h={leafH} depth={leafD} z={z} color={dc} emissive={em} roughness={0.7} />
  );
  const handle = (lx, key) => {
    const dir = lx >= 0 ? -1 : 1, hz = leafD + 0.12;
    return (
      <group key={key}>
        <Box x={lx} y={leafH * 0.46} w={0.12} h={0.12} depth={hz} color={HANDLE} roughness={0.22} metalness={0.85} />
        <Box x={lx + dir * 0.11} y={leafH * 0.46} w={0.22} h={0.055} depth={hz + 0.05} color={HANDLE} roughness={0.22} metalness={0.85} />
      </group>
    );
  };
  return (
    <group position={[o.c, 0, 0]} onClick={click}>
      {/* casing */}
      <Box x={0} y={h - fr / 2} w={w} h={fr} depth={th + 0.04} color={fc} emissive={em} roughness={0.6} />
      <Box x={-(w - fr) / 2} y={h / 2} w={fr} h={h} depth={th + 0.04} color={fc} emissive={em} roughness={0.6} />
      <Box x={(w - fr) / 2} y={h / 2} w={fr} h={h} depth={th + 0.04} color={fc} emissive={em} roughness={0.6} />

      {style === 'single' && (<>
        {panel(0, leafW, 0, 's')}
        <Box x={0} y={leafH * 0.66} w={leafW * 0.62} h={leafH * 0.28} depth={leafD + 0.02} color="#7f8ea3" roughness={0.7} />
        <Box x={0} y={leafH * 0.28} w={leafW * 0.62} h={leafH * 0.32} depth={leafD + 0.02} color="#7f8ea3" roughness={0.7} />
        {handle((o.hinge || 'left') === 'left' ? leafW * 0.40 : -leafW * 0.40, 'h')}
      </>)}
      {style === 'double' && (<>
        {panel(-(w / 4), leafW / 2 - 0.03, 0, 'l')}
        {panel(w / 4, leafW / 2 - 0.03, 0, 'r')}
        {handle(-0.12, 'hl')}{handle(0.12, 'hr')}
      </>)}
      {style === 'sliding' && (<>
        {panel(-w * 0.24, leafW / 2, leafD * 0.7, 'a')}
        {panel(w * 0.24, leafW / 2, -leafD * 0.7, 'b')}
      </>)}
      {style === 'pocket' && panel(0, leafW, 0, 'p')}
      {style === 'bifold' && [0, 1, 2, 3].map((i) => panel(-leafW / 2 + leafW / 8 + i * (leafW / 4), leafW / 4 - 0.03, (i % 2 ? 1 : -1) * leafD * 0.5, 'b' + i))}
    </group>
  );
}

// Build solid spans of a wall, skipping opening gaps; add headers + fixtures.
// Wall-local frame: x runs 0..L along the wall, y up, z = thickness.
export default function Wall3D({ wall, openings, wallHeight, outward = 1, seg = null, selection, onSelect, onWallBody = null }) {
  // `seg` carries the justified, miter-joined endpoints (matching the 2D plan)
  // plus a flag per end telling us whether it meets a neighbour at a corner.
  const a = seg?.a || wall.a, b = seg?.b || wall.b;
  const L = dist(a, b);
  if (L < 0.05) return null;
  const ang = angleOf(a, b);
  const th = Math.max(0.25, wall.thickness);

  // opening intervals along the wall (in feet from a)
  const ops = openings
    .map((o) => ({ ...o, c: o.t * L }))
    .filter((o) => o.c > 0 && o.c < L)
    .sort((x, y) => x.c - y.c);

  const boxes = []; // full-height solid spans between gaps
  let cursor = 0;
  for (const o of ops) {
    const s = Math.max(0, o.c - o.width / 2);
    const e = Math.min(L, o.c + o.width / 2);
    if (s > cursor) boxes.push({ x: (cursor + s) / 2, y: wallHeight / 2, w: s - cursor, h: wallHeight });
    cursor = Math.max(cursor, e);
  }
  if (cursor < L) boxes.push({ x: (cursor + L) / 2, y: wallHeight / 2, w: L - cursor, h: wallHeight });

  // at a corner the mitered centerlines meet at a point, but axis-aligned boxes
  // would leave a notch — extend each span that reaches a JOINED end by half the
  // thickness so neighbouring walls overlap into a solid corner. Free ends are
  // left flush (no spur), matching the 2D plan.
  const ext = th / 2;
  for (const bx of boxes) {
    if (seg?.aJoined && bx.x - bx.w / 2 <= 0.001) { bx.w += ext; bx.x -= ext / 2; }
    if (seg?.bJoined && bx.x + bx.w / 2 >= L - 0.001) { bx.w += ext; bx.x += ext / 2; }
  }

  // headers above every opening + sill infill below windows
  const fill = [];
  for (const o of ops) {
    const topOf = o.type === 'window' ? (o.sill ?? 3) + o.height : o.height;
    if (topOf < wallHeight) fill.push({ x: o.c, y: (topOf + wallHeight) / 2, w: o.width, h: wallHeight - topOf });
    if (o.type === 'window') {
      const sill = o.sill ?? 3;
      if (sill > 0) fill.push({ x: o.c, y: sill / 2, w: o.width, h: sill });
    }
  }

  const wallSelected = selection?.type === 'wall' && selection.id === wall.id;
  const selOpId = selection?.type === 'opening' ? selection.id : null;
  // in "add opening" mode, clicking the wall body drops a door/window where you
  // clicked (onWallBody handles it); otherwise the click just selects the wall.
  const selectWall = (e) => { e.stopPropagation(); if (onWallBody) onWallBody(e); else onSelect?.({ type: 'wall', id: wall.id }); };
  const selectOpening = (id) => onSelect?.({ type: 'opening', id });

  return (
    <group position={[a.x, 0, a.y]} rotation={[0, -ang, 0]} onClick={selectWall}>
      {[...boxes, ...fill].map((b, i) => (
        <Box key={i} x={b.x} y={b.y} w={b.w} h={b.h} depth={th}
          color={wallSelected ? '#dbeafe' : (wall.color || WALL_MATERIALS[wall.material]?.color || WALL_COLOR)}
          roughness={WALL_MATERIALS[wall.material]?.roughness ?? 0.85}
          emissive={wallSelected ? HILITE : undefined} />
      ))}
      {ops.map((o) => {
        if (o.type === 'door') return <Door3D key={o.id} o={o} th={th} selected={selOpId === o.id} onSelect={selectOpening} />;
        if (o.type !== 'window') return null;
        const proj = WINDOW_STYLES[o.style]?.project;
        if (proj === 'bay') return <Bay3D key={o.id} o={o} outward={outward} selected={selOpId === o.id} onSelect={selectOpening} />;
        if (proj === 'garden') return <Garden3D key={o.id} o={o} outward={outward} selected={selOpId === o.id} onSelect={selectOpening} />;
        return <Window3D key={o.id} o={o} th={th} selected={selOpId === o.id} onSelect={selectOpening} />;
      })}
      {/* base trim line for definition */}
      <mesh position={[L / 2, 0.08, 0]} receiveShadow>
        <boxGeometry args={[L, 0.16, th + 0.04]} />
        <meshStandardMaterial color={TRIM} roughness={0.9} />
      </mesh>
    </group>
  );
}
