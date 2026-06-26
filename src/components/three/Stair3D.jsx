import React from 'react';
import { stairGeometry } from '../../utils/geometry.js';

const HILITE = '#2563eb';
const RISE = 0.6; // per-step rise (ft)

// Solid stepped staircase. Each tread is a box rising to its level; plan (x,y)
// maps to world (x,z), height is world y. Rotated by the stair's plan rotation.
export default function Stair3D({ stair, selection, onSelect }) {
  const g = stairGeometry(stair);
  const sel = selection?.type === 'stair' && selection.id === stair.id;
  const col = sel ? HILITE : '#c2c9d2';
  const totalRise = g.steps * RISE;
  const click = (e) => { e.stopPropagation(); onSelect?.({ type: 'stair', id: stair.id }); };
  return (
    <group position={[stair.x, 0, stair.y]} rotation={[0, -(stair.rotation || 0) * Math.PI / 180, 0]} onClick={click}>
      {g.treads.map((t, i) => {
        const b = t.box; if (!b) return null;
        const h = (t.level + 1) * RISE;
        return (
          <mesh key={i} position={[b.cx, h / 2, b.cy]} rotation={[0, -b.a, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.d, h, b.w]} />
            <meshStandardMaterial color={col} roughness={0.85} emissive={sel ? HILITE : '#000000'} emissiveIntensity={sel ? 0.25 : 0} />
          </mesh>
        );
      })}
      {g.post && (
        <mesh position={[0, totalRise / 2, 0]} castShadow>
          <cylinderGeometry args={[g.post.r, g.post.r, totalRise + 0.4, 14]} />
          <meshStandardMaterial color={sel ? HILITE : '#8a93a3'} roughness={0.5} metalness={0.4} />
        </mesh>
      )}
    </group>
  );
}
