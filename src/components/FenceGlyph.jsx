import React from 'react';

// Diamond cross-hatch points for the chain-link symbol: two interleaved zigzag
// polylines that together read as mesh.
function zig(w, h, flip) {
  const top = 1.5, bot = h - 1.5, pts = [];
  for (let i = 0, x = 1; x <= w - 1; i++, x += 3) pts.push(`${x},${(i % 2 === 0) !== flip ? top : bot}`);
  return pts.join(' ');
}

// A small plan-view symbol for a fence STYLE in the fence's colour. Shared by the
// on-canvas legend and the side-panel quantities; the PDF legend mirrors it with
// jsPDF primitives so screen and print stay consistent.
export default function FenceGlyph({ style, color = '#64748b', width = 30, height = 12 }) {
  const w = width, h = height, my = h / 2;
  const common = { stroke: color, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  let body;
  if (style === 'pickets') {
    const ticks = [];
    for (let x = 2.5; x <= w - 2; x += 4) ticks.push(<line key={x} x1={x} y1={2} x2={x} y2={h - 1.5} {...common} strokeWidth={1.5} />);
    body = <>{ticks}<line x1={1.5} y1={h - 1.5} x2={w - 1.5} y2={h - 1.5} {...common} strokeWidth={1.5} /></>;
  } else if (style === 'mesh') {
    body = <>
      <polyline points={zig(w, h, false)} {...common} strokeWidth={1.3} />
      <polyline points={zig(w, h, true)} {...common} strokeWidth={1.3} />
    </>;
  } else if (style === 'slat') {
    body = <line x1={1.5} y1={my} x2={w - 1.5} y2={my} {...common} strokeWidth={3} strokeDasharray="4 2.5" />;
  } else {
    // board / solid → continuous privacy line
    body = <line x1={1.5} y1={my} x2={w - 1.5} y2={my} {...common} strokeWidth={3.2} />;
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flex: 'none' }}>{body}</svg>
  );
}
