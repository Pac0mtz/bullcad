import React from 'react';

// A clean, modern north compass. North = up (−Y in plan). Purely decorative —
// orients the reader; the plan itself is drawn with north at the top.
export default function Compass({ size = 50 }) {
  return (
    <svg className="compass" width={size} height={size} viewBox="0 0 100 100" aria-label="North up">
      <circle cx="50" cy="50" r="45" fill="var(--surface)" stroke="var(--slate-200)" strokeWidth="2" />
      {/* cardinal ticks */}
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1="50" y1="9" x2="50" y2="15" stroke="var(--slate-200)" strokeWidth="2" transform={`rotate(${a} 50 50)`} />
      ))}
      {/* needle: north half accent, south half muted */}
      <polygon points="50,20 57,50 50,45 43,50" fill="var(--danger)" />
      <polygon points="50,80 43,50 50,55 57,50" fill="var(--muted)" />
      <circle cx="50" cy="50" r="3.2" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.6" />
      <text x="50" y="36" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)" fontFamily="Inter, system-ui, sans-serif">N</text>
    </svg>
  );
}
