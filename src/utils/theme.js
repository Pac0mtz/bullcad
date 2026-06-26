// Theme palettes for the drawing surfaces. The CSS chrome (toolbar, panels)
// is themed via CSS variables in styles.css; these objects cover the parts that
// are painted imperatively and can't read CSS vars — the Konva 2D canvas and the
// three.js 3D scene. Brand colors (teal/blue) stay constant across themes; only
// the neutral surfaces/grid/structure neutrals flip.

// ---- 2D Konva canvas ----
export const CANVAS_THEME = {
  light: {
    stageBg: '#f1f5f9',
    gridMajor: '#b6c3d2',
    gridMinor: '#d4dde7',
    axis: '#9fb1c2',
    // walls
    wallBody: '#d6dde6',
    wallBodySel: '#bfe9e3',
    wallLine: '#0a2540',
    wallLineSel: '#2563eb',
    // openings
    opMask: '#f1f5f9', // matches stage bg so the opening reads as a real gap
    opStroke: '#0a2540',
    opStrokeSel: '#2563eb',
    // dimension labels
    dimBg: '#ffffff',
    dimShadow: '#0a2540',
    wallDim: '#0a2540',
    fenceDim: '#0f766e',
    // structure neutrals + snap
    postFill: '#0a2540',
    snap: '#94a3b8',
    snapNode: '#14b8a6',
  },
  dark: {
    stageBg: '#0b1220',
    gridMajor: '#1e2c3f',
    gridMinor: '#152233',
    axis: '#33455e',
    wallBody: '#33425a',
    wallBodySel: '#155e57',
    wallLine: '#cbd5e1',
    wallLineSel: '#60a5fa',
    opMask: '#0b1220',
    opStroke: '#cbd5e1',
    opStrokeSel: '#60a5fa',
    dimBg: '#1e293b',
    dimShadow: '#000000',
    wallDim: '#e2e8f0',
    fenceDim: '#5eead4',
    postFill: '#94a3b8',
    snap: '#64748b',
    snapNode: '#2dd4bf',
  },
};

// ---- 3D three.js scene ----
export const SCENE_THEME = {
  light: {
    wrapGradient: 'linear-gradient(#dfe9f3, #f1f5f9)',
    background: '#e7eef5',
    fog: '#e7eef5',
    ground: '#b8c7d6',
    gridCell: '#6f87a0',
    gridSection: '#46627f',
    ambient: 0.6,
    hemi: 0.0,
  },
  dark: {
    wrapGradient: 'linear-gradient(#0d1626, #0b1220)',
    background: '#0b1220',
    fog: '#0b1220',
    ground: '#16202f',
    gridCell: '#243245',
    gridSection: '#33455e',
    ambient: 0.35,
    hemi: 0.35, // a little sky/ground fill so objects don't go muddy at night
  },
};
