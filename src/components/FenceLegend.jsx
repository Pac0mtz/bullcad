import React from 'react';
import { FENCE_TYPES } from '../utils/geometry.js';
import FenceGlyph from './FenceGlyph.jsx';

// Floating key shown over the 2D plan: every fence type in use with its plan
// symbol, colour and label. Mirrors the symbols drawn in the PDF legend.
export default function FenceLegend({ fences }) {
  const seen = new Set();
  const used = [];
  for (const f of fences || []) {
    const k = f.fenceType || 'wood';
    if (seen.has(k)) continue;
    seen.add(k);
    const ft = FENCE_TYPES[k];
    if (!ft) continue;
    used.push({ key: k, label: ft.label, style: ft.style, color: f.color || ft.color });
  }
  if (!used.length) return null;
  return (
    <div className="fence-legend">
      <div className="fl-title">Fence Legend</div>
      {used.map((u) => (
        <div key={u.key} className="fl-row">
          <FenceGlyph style={u.style} color={u.color} />
          <span>{u.label}</span>
        </div>
      ))}
    </div>
  );
}
