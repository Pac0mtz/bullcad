import React from 'react';
import { picketOutline } from '../utils/geometry.js';

// A small FRONT-VIEW (elevation) glyph of a fence STYLE in its own colour, so a
// dog-ear picket reads as a dog-ear picket on the library card. Plan-view legends
// still use FenceGlyph; this is purely the recognizable "what it looks like" icon.
export default function FenceElevation({ style, cap = 'dogear', color = '#b07a45', slim = false, tight = false, width = 32, height = 24 }) {
  const w = width, h = height;
  const baseY = h - 2;            // ground line
  const fh = baseY - 2;           // available fence height (px)
  const seam = 'rgba(0,0,0,0.18)';
  const edge = 'rgba(0,0,0,0.30)';
  let body;

  if (style === 'pickets' && slim) {
    // ornamental METAL fence: thin vertical bars between a top + bottom rail.
    // Wrought iron (point cap) gets spear finials above the rail; aluminum
    // (flat cap) reads as clean flat-top bars.
    const pointed = cap === 'point';
    const railTopY = baseY - fh * 0.80;
    const railBotY = baseY - fh * 0.16;
    const overshoot = pointed ? 2.4 : 1.2;
    const barTopY = railTopY - overshoot;
    const n = 9, bw = 1.2;
    const gap = (w - 4 - n * bw) / (n - 1);
    const bars = [];
    for (let i = 0; i < n; i++) {
      const x = 2 + bw / 2 + i * (bw + gap);
      bars.push(<rect key={'b' + i} x={x - bw / 2} y={barTopY} width={bw} height={baseY - barTopY} fill={color} />);
      if (pointed) bars.push(<path key={'t' + i} d={`M${x - bw / 2},${barTopY} L${x},${barTopY - 3} L${x + bw / 2},${barTopY} Z`} fill={color} />);
    }
    body = <>
      {bars}
      <rect x={2} y={railTopY} width={w - 4} height={1.6} fill={color} />
      <rect x={2} y={railBotY} width={w - 4} height={1.6} fill={color} />
    </>;
  } else if (style === 'pickets') {
    const n = 5, pw = 3.4;
    const gap = (w - 3 - n * pw) / (n - 1);
    const items = [];
    for (let i = 0; i < n; i++) {
      const cx = 1.5 + pw / 2 + i * (pw + gap);
      const d = picketOutline(cap, pw, fh)
        .map(([px, py], j) => `${j ? 'L' : 'M'}${(cx + px).toFixed(1)},${(baseY - py).toFixed(1)}`)
        .join(' ') + 'Z';
      items.push(<path key={i} d={d} fill={color} stroke={edge} strokeWidth={0.5} strokeLinejoin="round" />);
    }
    body = <>
      <rect x={1.5} y={baseY - fh * 0.74} width={w - 3} height={1.5} fill={color} opacity={0.8} />
      <rect x={1.5} y={baseY - fh * 0.26} width={w - 3} height={1.5} fill={color} opacity={0.8} />
      {items}
    </>;
  } else if (style === 'rail') {
    const rys = [0.78, 0.5, 0.22];
    body = <>
      {rys.map((r, i) => <rect key={i} x={2} y={baseY - fh * r} width={w - 4} height={1.9} rx={0.7} fill={color} />)}
      <rect x={2} y={baseY - fh} width={2.6} height={fh} fill={color} />
      <rect x={w - 4.6} y={baseY - fh} width={2.6} height={fh} fill={color} />
    </>;
  } else if (style === 'mesh') {
    const lines = [];
    for (let x = -fh; x < w; x += 4) {
      lines.push(<line key={'a' + x} x1={x} y1={baseY} x2={x + fh} y2={baseY - fh} stroke={color} strokeWidth={0.8} />);
      lines.push(<line key={'b' + x} x1={x} y1={baseY - fh} x2={x + fh} y2={baseY} stroke={color} strokeWidth={0.8} />);
    }
    body = <>
      <clipPath id="m"><rect x={2} y={baseY - fh} width={w - 4} height={fh} /></clipPath>
      <g clipPath="url(#m)">{lines}</g>
      <rect x={2} y={baseY - fh} width={w - 4} height={1.6} fill={color} />
      <rect x={2} y={baseY - fh} width={2} height={fh} fill={color} />
      <rect x={w - 4} y={baseY - fh} width={2} height={fh} fill={color} />
    </>;
  } else if (style === 'slat') {
    // horizontal slats; `tight` packs them for the privacy variant
    const bars = [];
    const step = tight ? 2.4 : 3.4, bh = tight ? 2.1 : 2;
    for (let y = baseY - fh; y < baseY - 1; y += step) bars.push(<rect key={y} x={2} y={y} width={w - 4} height={bh} rx={0.5} fill={color} />);
    body = <>{bars}</>;
  } else {
    // board / solid privacy → filled panel with vertical seams + cap rail
    const seams = [];
    for (let x = 1.5 + 4; x < w - 2; x += 4) seams.push(<line key={x} x1={x} y1={baseY - fh + 2} x2={x} y2={baseY} stroke={seam} strokeWidth={0.6} />);
    body = <>
      <rect x={1.5} y={baseY - fh} width={w - 3} height={fh} fill={color} />
      <rect x={0.5} y={baseY - fh} width={w - 1} height={2} rx={0.6} fill={color} stroke={edge} strokeWidth={0.4} />
      {seams}
    </>;
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flex: 'none' }}>
      {body}
      <line x1={0.5} y1={baseY + 0.6} x2={w - 0.5} y2={baseY + 0.6} stroke="rgba(0,0,0,0.22)" strokeWidth={0.9} />
    </svg>
  );
}
