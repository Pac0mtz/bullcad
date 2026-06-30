import React from 'react';
import { OBJECTS, objectFootprint } from '../../utils/geometry.js';

// ---- palette ----
const WOOD = '#b08d57', WOOD_D = '#8a6e42';
const FABRIC = '#8a94a6';
const WHITE = '#eef2f6', PORCELAIN = '#f4f7fa', METAL = '#c7ccd2', DARK = '#566173';
const BED = '#dfe5ec', PILLOW = '#f1f5f9', GLASS = '#bcd4e6';
const HILITE = '#7cc6ff';

// a box centered at (x,y,z) sized w×h×d
function B({ x = 0, y = 0, z = 0, w, h, d, color, opacity, rough = 0.7, metal = 0, emissive }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[Math.max(0.02, w), Math.max(0.02, h), Math.max(0.02, d)]} />
      <meshStandardMaterial color={color} transparent={opacity != null} opacity={opacity ?? 1}
        roughness={rough} metalness={metal} emissive={emissive || '#000'} emissiveIntensity={emissive ? 0.45 : 0} />
    </mesh>
  );
}
// a cylinder centered at (x,y,z)
function Cyl({ x = 0, y = 0, z = 0, r, h, color, rough = 0.7, metal = 0, rot, seg = 24, emissive }) {
  return (
    <mesh position={[x, y, z]} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, Math.max(0.02, h), seg]} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive || '#000'} emissiveIntensity={emissive ? 0.45 : 0} />
    </mesh>
  );
}

// nominal 3D height (ft) per object
const HEIGHT = {
  refrigerator: 5.8, oven: 3, cookTop: 3, dishwasher: 3, sink: 3, doubleSink: 3,
  counterMiddle: 3, counterCorner: 3, counterEnd: 3,
  toilet: 1.45, bath: 1.6, showerRect: 6.4, showerSquare: 6.4, bathroomSink: 2.9,
  queenBed: 1.9, twinBed: 1.9, sofa: 2.6, loveSeat: 2.6, chair: 2.8,
  coffeeTable: 1.4, endTable: 2, tableRect: 2.4, tableRound: 2.4,
  washer: 3, dryer: 3, washerDryer: 3,
};

// ---- model builders. Local frame: X = width (W), Z = depth (D), Y up (0..H). ----
function seating(W, D, H, c) {
  const seatH = 0.45, baseY = 0.4, armW = Math.min(0.35, W * 0.12);
  return (
    <group>
      <B y={baseY} w={W} h={0.5} d={D} color={c} />
      <B y={seatH + 0.55} w={W - armW * 2} h={0.45} d={D - 0.4} color={c} rough={0.85} />
      <B y={(seatH + H) / 2 + 0.2} z={-(D / 2 - 0.2)} w={W} h={H - 0.6} d={0.4} color={c} />
      <B x={-(W / 2 - armW / 2)} y={0.9} w={armW} h={0.95} d={D} color={c} />
      <B x={W / 2 - armW / 2} y={0.9} w={armW} h={0.95} d={D} color={c} />
    </group>
  );
}
function bed(W, D, H) {
  return (
    <group>
      <B y={0.28} w={W} h={0.55} d={D} color={WOOD} />        {/* frame */}
      <B y={0.95} w={W - 0.2} h={0.7} d={D - 0.2} color={BED} rough={0.95} /> {/* mattress */}
      <B y={(H + 0.4) / 2} z={-(D / 2 - 0.15)} w={W} h={H + 0.4} d={0.3} color={WOOD_D} /> {/* headboard */}
      <B x={-W / 4} y={1.45} z={-(D / 2 - 1.1)} w={W / 2 - 0.4} h={0.35} d={1.3} color={PILLOW} rough={1} />
      {W > 4 && <B x={W / 4} y={1.45} z={-(D / 2 - 1.1)} w={W / 2 - 0.4} h={0.35} d={1.3} color={PILLOW} rough={1} />}
    </group>
  );
}
function table(W, D, H) {
  const lt = 0.13, ly = (H - 0.15) / 2;
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <group>
      <B y={H - 0.08} w={W} h={0.16} d={D} color={WOOD} />
      {legs.map(([sx, sz], i) => <B key={i} x={sx * (W / 2 - lt)} z={sz * (D / 2 - lt)} y={ly} w={lt} h={H - 0.15} d={lt} color={WOOD_D} />)}
    </group>
  );
}
function roundTable(W, H) {
  return (
    <group>
      <Cyl y={H - 0.08} r={W / 2} h={0.16} color={WOOD} />
      <Cyl y={(H - 0.15) / 2} r={0.16} h={H - 0.15} color={WOOD_D} />
      <Cyl y={0.05} r={W / 4} h={0.1} color={WOOD_D} />
    </group>
  );
}
function appliance(W, D, H, c, opts = {}) {
  return (
    <group>
      <B y={H / 2} w={W} h={H} d={D} color={c} rough={0.5} metal={opts.metal ?? 0.15} />
      {opts.split && <B y={H / 2} z={D / 2 + 0.01} w={0.04} h={H - 0.2} d={0.02} color={DARK} />}
      {opts.round && <Cyl z={D / 2 - 0.02} y={H * 0.55} r={Math.min(W, H) * 0.32} h={0.06} color={GLASS} rot={[Math.PI / 2, 0, 0]} rough={0.2} />}
      {opts.handle && <B x={opts.handle * (W / 2 - 0.18)} y={H * 0.6} z={D / 2 + 0.05} w={0.1} h={H * 0.5} d={0.06} color={METAL} metal={0.8} rough={0.3} />}
    </group>
  );
}
function counter(W, D, extra) {
  const H = 3;
  return (
    <group>
      <B y={1.45} w={W} h={2.9} d={D} color={WHITE} rough={0.6} />
      <B y={H + 0.05} w={W + 0.1} h={0.12} d={D + 0.1} color={DARK} rough={0.3} />
      {extra}
    </group>
  );
}
function sink(W, D, dbl) {
  return counter(W, D, (
    <group>
      {dbl
        ? <>
          <B x={-W / 4} y={2.92} w={W / 2 - 0.35} h={0.35} d={D - 0.7} color={METAL} metal={0.6} rough={0.25} />
          <B x={W / 4} y={2.92} w={W / 2 - 0.35} h={0.35} d={D - 0.7} color={METAL} metal={0.6} rough={0.25} />
        </>
        : <B y={2.92} w={W - 0.7} h={0.35} d={D - 0.7} color={METAL} metal={0.6} rough={0.25} />}
      <Cyl y={3.35} z={-(D / 2 - 0.35)} r={0.07} h={0.7} color={METAL} metal={0.85} rough={0.2} />
    </group>
  ));
}

export default function Object3D({ obj, selected, onSelect }) {
  const meta = OBJECTS[obj.key] || {};
  const { wFt, hFt } = objectFootprint(obj.size || meta.size || 3, meta.ar || 1);
  const W = wFt, D = hFt, H = HEIGHT[obj.key] || 2.5;
  const key = obj.key;
  const click = (e) => { e.stopPropagation(); onSelect?.(obj.id); };

  let model;
  if (key === 'sofa' || key === 'loveSeat' || key === 'chair') model = seating(W, D, H, FABRIC);
  else if (key === 'queenBed' || key === 'twinBed') model = bed(W, D, H);
  else if (key === 'tableRect' || key === 'coffeeTable' || key === 'endTable') model = table(W, D, H);
  else if (key === 'tableRound') model = roundTable(W, H);
  else if (key === 'refrigerator') model = appliance(W, D, H, WHITE, { split: true, handle: 1 });
  else if (key === 'dishwasher') model = appliance(W, D, H, METAL, { handle: 0, metal: 0.5 });
  else if (key === 'washer' || key === 'dryer') model = appliance(W, D, H, WHITE, { round: true });
  else if (key === 'washerDryer') model = (<group><group position={[-W / 4, 0, 0]}>{appliance(W / 2 - 0.05, D, H, WHITE, { round: true })}</group><group position={[W / 4, 0, 0]}>{appliance(W / 2 - 0.05, D, H, WHITE, { round: true })}</group></group>);
  else if (key === 'oven') model = (<group>{appliance(W, D, H, METAL, { handle: 0, metal: 0.55 })}<B y={H - 0.25} z={D / 2 + 0.01} w={W - 0.3} h={0.4} d={0.05} color={DARK} /></group>);
  else if (key === 'cookTop') model = counter(W, D, [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <Cyl key={i} x={sx * W * 0.22} z={sz * D * 0.22} y={3.07} r={Math.min(W, D) * 0.12} h={0.05} color={DARK} />));
  else if (key === 'sink') model = sink(W, D, false);
  else if (key === 'doubleSink') model = sink(W, D, true);
  else if (key === 'counterMiddle' || key === 'counterCorner' || key === 'counterEnd') model = counter(W, D);
  else if (key === 'bathroomSink') model = (
    <group>
      <B y={1.3} w={W} h={2.6} d={D} color={WOOD} rough={0.6} />
      <B y={2.7} w={W + 0.1} h={0.15} d={D + 0.1} color={PORCELAIN} rough={0.3} />
      <Cyl y={2.78} r={Math.min(W, D) * 0.3} h={0.12} color={PORCELAIN} rough={0.25} />
      <Cyl y={3.05} z={-(D / 2 - 0.3)} r={0.06} h={0.55} color={METAL} metal={0.85} rough={0.2} />
    </group>
  );
  else if (key === 'toilet') model = (
    <group>
      <B y={0.95} z={-(D / 2 - 0.35)} w={W * 0.7} h={1.0} d={0.6} color={PORCELAIN} rough={0.3} /> {/* tank */}
      <Cyl y={0.62} z={D * 0.12} r={W * 0.42} h={0.55} color={PORCELAIN} rough={0.3} seg={20} /> {/* bowl */}
      <Cyl y={0.92} z={D * 0.12} r={W * 0.44} h={0.1} color={WHITE} rough={0.4} seg={20} /> {/* seat */}
    </group>
  );
  else if (key === 'bath') model = (
    <group>
      <B y={H / 2} w={W} h={H} d={D} color={PORCELAIN} rough={0.3} />
      <B y={H * 0.8} w={W - 0.5} h={H * 0.5} d={D - 0.5} color={'#dbe7f0'} rough={0.2} /> {/* inner recess */}
    </group>
  );
  else if (key === 'showerRect' || key === 'showerSquare') model = (
    <group>
      <B y={0.18} w={W} h={0.36} d={D} color={PORCELAIN} rough={0.4} /> {/* base */}
      <B y={H / 2} z={-(D / 2 - 0.04)} w={W} h={H} d={0.06} color={GLASS} opacity={0.28} rough={0.1} metal={0.1} />
      <B x={-(W / 2 - 0.04)} y={H / 2} w={0.06} h={H} d={D} color={GLASS} opacity={0.28} rough={0.1} metal={0.1} />
      <B x={W / 2 - 0.04} y={H / 2} w={0.06} h={H} d={D * 0.55} z={-(D * 0.22)} color={GLASS} opacity={0.28} rough={0.1} metal={0.1} />
    </group>
  );
  else model = <B y={H / 2} w={W} h={H} d={D} color={WHITE} rough={0.7} />; // fallback box

  return (
    <group position={[obj.x, 0, obj.y]} rotation={[0, -(obj.rotation || 0) * Math.PI / 180, 0]} onClick={click}>
      {model}
      {selected && (
        <mesh position={[0, H / 2 + 0.02, 0]}>
          <boxGeometry args={[W + 0.12, H + 0.1, D + 0.12]} />
          <meshStandardMaterial color={HILITE} wireframe transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}
