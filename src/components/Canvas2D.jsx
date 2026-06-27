import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Rect } from 'react-konva';
import { useStore } from '../store.js';
import {
  dist, lerp, snapPt, snapToNodes, projectOnSegment, formatFeetInches, centroidOf, justifiedSegments, stairGeometry, snapAngle, detectRooms, parseLength,
} from '../utils/geometry.js';

const FENCE_THICK = 0.3; // nominal fence body width (ft) for alignment offset
import { CANVAS_THEME } from '../utils/theme.js';
import { WallShape, OpeningShape, FenceShape, GateShape, DimLabel, WallDimension, WallOpeningDims, LabelShape, StairShape } from './canvas/Shapes.jsx';
import { IconZoomIn, IconZoomOut, IconFit } from './Icons.jsx';
import FenceLegend from './FenceLegend.jsx';
import Compass from './Compass.jsx';

const NAVY = '#0a2540';
const BLUE = '#2563eb';
const TEAL = '#14b8a6';

export default function Canvas2D() {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);

  const store = useStore();
  const { tool, scale, grid, snapEnabled, walls, openings, fences, gates, labels, stairs, selection, theme, dimMode, dimOffset, wallJustify, fenceJustify, showRoomAreas, layers } = store;
  const rooms = useMemo(() => (showRoomAreas ? detectRooms(walls) : []), [showRoomAreas, walls]);
  const t = CANVAS_THEME[theme] || CANVAS_THEME.light;

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ x: 120, y: 90, k: 1 });
  const [cursor, setCursor] = useState(null); // feet pt under pointer (snapped)
  const [draft, setDraft] = useState(null); // feet pt: start of current wall/fence segment
  const [runStart, setRunStart] = useState(null); // first point of the current run (for closing the loop)
  const [lenStr, setLenStr] = useState(''); // typed length (numeric entry while drawing)
  const lenInputRef = useRef(null);
  const [measure, setMeasure] = useState([]); // feet pts
  const [guides, setGuides] = useState([]); // alignment guide lines (feet) while dragging
  const drag = useRef(null); // active handle drag
  const space = useRef(false);
  const shift = useRef(false);
  const alt = useRef(false);
  const pan = useRef(null);
  const coarse = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, []);

  // ---- size to container ----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- space-to-pan + shift-to-constrain-angle ----
  useEffect(() => {
    const down = (e) => { if (e.code === 'Space') space.current = true; if (e.shiftKey) shift.current = true; if (e.altKey) alt.current = true; };
    const up = (e) => { if (e.code === 'Space') space.current = false; if (!e.shiftKey) shift.current = false; if (!e.altKey) alt.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ---- touch: one-finger pan via Konva's Stage events (see onTouch* below);
  // two-finger pinch-zoom via a native listener (Konva drops multi-touch moves).
  const touch = useRef(null);   // single-finger pan state
  const pinch = useRef(null);   // two-finger pinch state
  useEffect(() => {
    const el = stageRef.current?.container();
    if (!el) return;
    const D = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1;
    const C = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    const onStart = (e) => {
      if (e.touches.length === 2) { const m = C(e.touches[0], e.touches[1]); pinch.current = { dist: D(e.touches[0], e.touches[1]), cx: m.x, cy: m.y }; touch.current = null; e.preventDefault(); }
    };
    const onMove = (e) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), p = pinch.current;
      const dist = D(e.touches[0], e.touches[1]), m = C(e.touches[0], e.touches[1]);
      // capture ratio + previous centre BEFORE the (batched) state update — p is
      // mutated synchronously below, so the updater must not read it
      const ratio = dist / p.dist, pcx = p.cx, pcy = p.cy, mx = m.x, my = m.y;
      setView((v) => {
        const Wx = (pcx - r.left - v.x) / v.k, Wy = (pcy - r.top - v.y) / v.k;
        const k1 = Math.max(0.2, Math.min(5, v.k * ratio));
        return { k: k1, x: (mx - r.left) - Wx * k1, y: (my - r.top) - Wy * k1 };
      });
      p.dist = dist; p.cx = m.x; p.cy = m.y;
    };
    const onEnd = (e) => { if (e.touches.length < 2) pinch.current = null; };
    const opt = { passive: false };
    el.addEventListener('touchstart', onStart, opt);
    el.addEventListener('touchmove', onMove, opt);
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart, opt);
      el.removeEventListener('touchmove', onMove, opt);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // reset draft/measure when tool changes
  useEffect(() => { setDraft(null); setRunStart(null); setMeasure([]); setLenStr(''); }, [tool]);

  // finish the current wall/fence run; `toSelect` also drops back to the Select tool
  const finishRun = (toSelect) => { setDraft(null); setRunStart(null); setLenStr(''); setGuides([]); if (toSelect) store.setTool('select'); };

  // focus the length-entry box as soon as a wall/fence run is started
  useEffect(() => {
    if (draft && (tool === 'wall' || tool === 'fence')) lenInputRef.current?.focus();
  }, [draft, tool]);

  // commit a segment of an exact typed length, in the current cursor direction
  const commitTypedLength = () => {
    const L = parseLength(lenStr);
    if (!(L > 0) || !draft || !cursor) return;
    const dx = cursor.x - draft.x, dy = cursor.y - draft.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return; // no direction yet — move the cursor first
    const end = { x: draft.x + (dx / d) * L, y: draft.y + (dy / d) * L };
    tool === 'wall' ? store.addWall(draft, end) : store.addFence(draft, end);
    setDraft(end);
    setLenStr('');
  };

  const allNodes = useMemo(() => {
    const ns = [];
    walls.forEach((w) => { ns.push(w.a, w.b); });
    fences.forEach((f) => { ns.push(f.a, f.b); });
    return ns;
  }, [walls, fences]);

  // pointer -> feet (content coords / scale)
  const getFeet = () => {
    const layer = layerRef.current;
    if (!layer) return null;
    const p = layer.getRelativePointerPosition();
    return { x: p.x / scale, y: p.y / scale };
  };

  const snapDraw = (pt) => {
    if (!snapEnabled) return pt;
    const n = snapToNodes(pt, allNodes, 0.8);
    if (n.snapped) return { x: n.x, y: n.y, onNode: true };
    return { ...snapPt(pt, grid), onNode: false };
  };

  // draw point for wall/fence: snap to grid/nodes, then (when Shift is held mid
  // run) constrain the segment to the nearest 15° from the previous point.
  const drawPt = (raw) => {
    const pt = snapDraw(raw);
    if (draft && shift.current) return { ...snapAngle(draft, pt, 15), onNode: false };
    return pt;
  };

  const nearest = (pt, segs) => {
    let best = null;
    for (const s of segs) {
      const pr = projectOnSegment(pt, s.a, s.b);
      if (pr.distance < 1.6 && (!best || pr.distance < best.distance)) best = { id: s.id, t: pr.t, distance: pr.distance };
    }
    return best;
  };

  // ---------------- stage interactions ----------------
  const onMouseDown = (e) => {
    const evt = e.evt;
    if (evt.button === 1 || (evt.button === 0 && (space.current || tool === 'pan'))) {
      pan.current = { sx: evt.clientX, sy: evt.clientY, vx: view.x, vy: view.y };
      evt.preventDefault();
      return;
    }
    if (drag.current) return; // handle drag already started on a handle
    if (e.target === stageRef.current && tool === 'select') {
      store.clearSelection();
    }
  };

  const onMouseMove = () => {
    if (pan.current) return;
    const raw = getFeet();
    if (!raw) return;
    if (drag.current) {
      handleDragMove(raw);
      return;
    }
    if (tool === 'wall' || tool === 'fence') setCursor(drawPt(raw));
    else if (tool === 'room') setCursor(snapDraw(raw));
    else setCursor(raw);
  };

  // native pan via window listeners (so it keeps working off-stage)
  useEffect(() => {
    const move = (e) => {
      if (!pan.current) return;
      setView((v) => ({ ...v, x: pan.current.vx + (e.clientX - pan.current.sx), y: pan.current.vy + (e.clientY - pan.current.sy) }));
    };
    const up = () => {
      if (pan.current) pan.current = null;
      if (drag.current) {
        // only record an undo step if the handle actually moved
        if (drag.current.moved && drag.current.before) useStore.getState().pushPast(drag.current.before);
        drag.current = null;
        setGuides([]);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up); window.removeEventListener('touchcancel', up);
    };
  }, []);

  const onClick = (e) => {
    // allow touch taps (button is undefined); block only real non-left mouse buttons
    if (space.current || (e.evt.button != null && e.evt.button !== 0)) return;
    const raw = getFeet();
    if (!raw) return;

    if (tool === 'wall' || tool === 'fence') {
      const pt = drawPt(raw);
      const clean = { x: pt.x, y: pt.y };
      if (!draft) { setDraft(clean); setRunStart(clean); return; } // begin a run
      if (dist(draft, clean) < 0.1) { finishRun(false); return; }   // clicked the same point → finish (stay in tool)
      tool === 'wall' ? store.addWall(draft, clean) : store.addFence(draft, clean);
      if (runStart && dist(clean, runStart) < 0.1) { finishRun(true); return; } // closed the loop → done, back to Select
      setDraft(clean);
    } else if (tool === 'room') {
      const pt = snapDraw(raw);
      const clean = { x: pt.x, y: pt.y };
      if (!draft) { setDraft(clean); return; }
      store.addRoom(draft, clean);
      setDraft(null);
      store.setTool('select'); // one room per pick, then back to Select
    } else if (['door', 'window', 'opening'].includes(tool)) {
      const hit = nearest(raw, walls);
      if (hit) { const id = store.addOpening(hit.id, tool, hit.t); store.setTool('select'); store.select({ type: 'opening', id }); }
    } else if (tool === 'gate') {
      const hit = nearest(raw, fences);
      if (hit) { const id = store.addGate(hit.id, hit.t); store.setTool('select'); store.select({ type: 'gate', id }); }
    } else if (tool === 'measure') {
      setMeasure((m) => (m.length >= 2 ? [raw] : [...m, raw]));
    } else if (tool === 'label') {
      // anchor the callout at the clicked spot, then drop into Select to drag it
      const pt = snapEnabled ? snapPt(raw, grid) : raw;
      const id = store.addLabel(pt);
      store.setTool('select');
      store.select({ type: 'label', id });
    } else if (tool === 'stairs') {
      const pt = snapEnabled ? snapPt(raw, grid) : raw;
      const id = store.addStair(pt);
      store.setTool('select');
      store.select({ type: 'stair', id });
    } else if (tool === 'zoom') {
      // click to zoom in at the point; Alt/Shift-click to zoom out
      const ptr = stageRef.current.getPointerPosition();
      const k0 = view.k;
      const k1 = Math.max(0.2, Math.min(5, k0 * (e.evt.altKey || e.evt.shiftKey ? 1 / 1.4 : 1.4)));
      const wx = (ptr.x - view.x) / k0, wy = (ptr.y - view.y) / k0;
      setView({ k: k1, x: ptr.x - wx * k1, y: ptr.y - wy * k1 });
    }
  };

  const onDblClick = () => { if (tool === 'wall' || tool === 'fence') finishRun(true); };

  // single-finger pan (Konva Stage touch events); a small move stays a tap so
  // Konva still fires onTap → place/select
  const onTouchStart = (e) => {
    if (drag.current) return; // a handle started a drag — don't begin a pan
    if (e.evt.touches.length === 1 && !pinch.current) {
      const t = e.evt.touches[0];
      touch.current = { mode: null, sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY };
    }
  };
  const onTouchMove = (e) => {
    // dragging a resize/move handle takes priority over pan
    if (drag.current) { e.evt.preventDefault(); const raw = getFeet(); if (raw) handleDragMove(raw); return; }
    if (pinch.current) return; // two-finger pinch owns the gesture
    const c = touch.current, ts = e.evt.touches; if (!c || ts.length !== 1) return;
    const t = ts[0];
    if (c.mode === null && Math.hypot(t.clientX - c.sx, t.clientY - c.sy) > 8) c.mode = 'pan';
    if (c.mode === 'pan') {
      e.evt.preventDefault();
      const dx = t.clientX - c.lx, dy = t.clientY - c.ly; // capture before mutating c
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      c.lx = t.clientX; c.ly = t.clientY;
    }
  };
  const onTouchEnd = (e) => {
    if (e.evt.touches.length > 0) return;
    touch.current = null;
    if (drag.current) { // commit the handle drag (mirror the window mouseup)
      if (drag.current.moved && drag.current.before) useStore.getState().pushPast(drag.current.before);
      drag.current = null;
      setGuides([]);
    }
  };

  const onWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const ptr = stage.getPointerPosition();
    const k0 = view.k;
    const k1 = Math.max(0.2, Math.min(5, k0 * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1)));
    const wx = (ptr.x - view.x) / k0;
    const wy = (ptr.y - view.y) / k0;
    setView({ k: k1, x: ptr.x - wx * k1, y: ptr.y - wy * k1 });
  };

  // ---------------- handle dragging (endpoints / openings / gates) ----------------
  const startHandle = (payload) => (e) => {
    e.cancelBubble = true;
    if (tool !== 'select') return;
    drag.current = { ...payload, moved: false, before: useStore.getState().snapshotGeom() };
  };

  // Snap an opening/gate to align with other openings/gates (and the host's
  // ends/middle); returns the snapped `t` and alignment guide lines to draw.
  const snapAlignT = (raw, host, kind, id) => {
    const c01 = (v) => Math.max(0, Math.min(1, v));
    let t = projectOnSegment(raw, host.a, host.b).t;
    let center = lerp(host.a, host.b, t);
    const horiz = Math.abs(host.b.x - host.a.x) >= Math.abs(host.b.y - host.a.y);
    const cands = [host.a, host.b, lerp(host.a, host.b, 0.5)];
    openings.forEach((o) => { if (o.id === id) return; const w = walls.find((x) => x.id === o.wallId); if (w) cands.push(lerp(w.a, w.b, o.t)); });
    gates.forEach((g) => { if (g.id === id) return; const f = fences.find((x) => x.id === g.fenceId); if (f) cands.push(lerp(f.a, f.b, g.t)); });
    const tol = 0.3 + 0.4 / (view.k || 1);
    const gs = [], EXT = 160;
    if (horiz && Math.abs(host.b.x - host.a.x) > 0.01) {
      let best = null; for (const p of cands) { const dd = Math.abs(center.x - p.x); if (dd < tol && (best == null || dd < Math.abs(center.x - best))) best = p.x; }
      if (best != null) { t = c01((best - host.a.x) / (host.b.x - host.a.x)); center = lerp(host.a, host.b, t); gs.push([best, center.y - EXT, best, center.y + EXT]); }
    } else if (Math.abs(host.b.y - host.a.y) > 0.01) {
      let best = null; for (const p of cands) { const dd = Math.abs(center.y - p.y); if (dd < tol && (best == null || dd < Math.abs(center.y - best))) best = p.y; }
      if (best != null) { t = c01((best - host.a.y) / (host.b.y - host.a.y)); center = lerp(host.a, host.b, t); gs.push([center.x - EXT, best, center.x + EXT, best]); }
    }
    return { t: c01(t), gs };
  };

  // drag a dimension pill perpendicular to its element to set that element's own
  // dimension offset (`dimOff`). `rowExtra` is the extra gap of the dragged row
  // (overall rows sit ROW_GAP past the split string). Works in any tool.
  const startOffsetDrag = (wallLike, elemType, elemId, rowExtra = 0, field = 'dimOff') => (e) => {
    e.cancelBubble = true;
    drag.current = { kind: 'dimOffset', wall: wallLike, elemType, elemId, rowExtra, field, moved: false, before: useStore.getState().snapshotGeom() };
  };

  const handleDragMove = (raw) => {
    const d = drag.current;
    d.moved = true;
    if (d.kind === 'wallEnd' || d.kind === 'fenceEnd') {
      const type = d.kind === 'wallEnd' ? 'wall' : 'fence';
      const list = type === 'wall' ? walls : fences;
      // resolve the joined corner once: every endpoint of this element type that
      // shares the dragged corner moves together (keeps rooms/runs connected)
      if (!d.joints) {
        // Alt at grab time detaches just this corner; otherwise the whole joint
        // (every segment sharing the corner) moves together
        if (alt.current) {
          d.joints = [{ id: d.id, end: d.end }];
        } else {
          const o = d.origin || (list.find((e) => e.id === d.id) || {})[d.end] || raw;
          d.joints = [];
          for (const e of list) for (const end of ['a', 'b']) if (dist(e[end], o) < 0.05) d.joints.push({ id: e.id, end });
          if (!d.joints.length) d.joints = [{ id: d.id, end: d.end }];
        }
      }
      let pt = raw;
      if (snapEnabled) {
        // snap to grid or to other nodes (excluding the corner being dragged)
        const jointSet = new Set(d.joints.map((j) => j.id + j.end));
        const others = list.flatMap((e) => ['a', 'b'].filter((end) => !jointSet.has(e.id + end)).map((end) => e[end]));
        const n = snapToNodes(raw, others, 0.8);
        pt = n.snapped ? { x: n.x, y: n.y } : snapPt(raw, grid);
      }
      store.moveJoints(type, d.joints, pt);
    } else if (d.kind === 'wallMove' || d.kind === 'fenceMove') {
      // slide a whole wall/fence perpendicular to itself; both its corners move
      // and every segment joined at those corners stretches to follow
      const type = d.kind === 'wallMove' ? 'wall' : 'fence';
      const list = type === 'wall' ? walls : fences;
      const w = list.find((x) => x.id === d.id);
      if (w) {
        if (!d.start) {
          d.start = raw; d.origA = { ...w.a }; d.origB = { ...w.b };
          const L = dist(w.a, w.b) || 1;
          d.perp = { x: -(w.b.y - w.a.y) / L, y: (w.b.x - w.a.x) / L };
          const jointsAt = (pt) => { const o = []; for (const e of list) for (const end of ['a', 'b']) if (dist(e[end], pt) < 0.05) o.push({ id: e.id, end }); return o; };
          d.jointsA = jointsAt(d.origA); d.jointsB = jointsAt(d.origB);
        }
        let off = (raw.x - d.start.x) * d.perp.x + (raw.y - d.start.y) * d.perp.y;
        if (snapEnabled) off = Math.round(off / grid) * grid;
        store.moveJoints(type, d.jointsA, { x: d.origA.x + d.perp.x * off, y: d.origA.y + d.perp.y * off });
        store.moveJoints(type, d.jointsB, { x: d.origB.x + d.perp.x * off, y: d.origB.y + d.perp.y * off });
      }
    } else if (d.kind === 'opening' || d.kind === 'gate') {
      const host = (d.kind === 'opening' ? walls : fences).find((x) => x.id === d.hostId);
      if (host) {
        const { t, gs } = snapAlignT(raw, host, d.kind, d.id);
        store.updateElement(d.kind, d.id, { t });
        setGuides(gs);
      }
    } else if (d.kind === 'stair') {
      const pt = snapEnabled ? snapPt(raw, grid) : raw;
      store.updateElement('stair', d.id, { x: pt.x, y: pt.y });
    } else if (d.kind === 'stairWidth' || d.kind === 'stairRun' || d.kind === 'stairRotate') {
      const stp = stairs.find((x) => x.id === d.id);
      if (stp) {
        const th = (stp.rotation || 0) * Math.PI / 180;
        const dx = raw.x - stp.x, dy = raw.y - stp.y;
        const g = stairGeometry(stp);
        if (d.kind === 'stairRotate') {
          const cxr = (g.outline[0].x + g.outline[2].x) / 2;
          const base = Math.atan2(g.outline[0].y - 1.4, cxr);
          let deg = (Math.atan2(dy, dx) - base) * 180 / Math.PI;
          deg = ((Math.round(deg / 5) * 5) % 360 + 360) % 360; // snap 5°
          store.updateElement('stair', d.id, { rotation: deg });
        } else {
          const lx = dx * Math.cos(th) + dy * Math.sin(th);
          const ly = -dx * Math.sin(th) + dy * Math.cos(th);
          if (d.kind === 'stairWidth') {
            store.updateElement('stair', d.id, { width: +Math.max(2, Math.min(20, lx / (g.resize.widthDiv || 1))).toFixed(2) });
          } else if (g.resize.runDiv) {
            store.updateElement('stair', d.id, { tread: +Math.max(0.6, Math.min(2.5, ly / g.resize.runDiv)).toFixed(3) });
          }
        }
      }
    } else if (d.kind === 'labelPos') {
      store.updateElement('label', d.id, { pos: { x: raw.x, y: raw.y } });
    } else if (d.kind === 'labelAnchor') {
      const pt = snapEnabled ? snapPt(raw, grid) : raw;
      store.updateElement('label', d.id, { anchor: { x: pt.x, y: pt.y } });
    } else if (d.kind === 'dimOffset') {
      const wl = d.wall;
      const L = dist(wl.a, wl.b) || 1;
      const nx = -(wl.b.y - wl.a.y) / L, ny = (wl.b.x - wl.a.x) / L;
      const pd = Math.abs((raw.x - wl.a.x) * nx + (raw.y - wl.a.y) * ny);
      const th = wl.thickness || 0.375;
      const val = Math.max(0, Math.min(8, +(pd - th / 2 - (d.rowExtra || 0)).toFixed(2)));
      store.updateElement(d.elemType, d.elemId, { [d.field || 'dimOff']: val });
    }
  };

  // ---------------- view helpers ----------------
  const zoomBy = (m) => setView((v) => {
    const k1 = Math.max(0.2, Math.min(5, v.k * m));
    const cx = size.w / 2, cy = size.h / 2;
    const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
    return { k: k1, x: cx - wx * k1, y: cy - wy * k1 };
  });

  const fitView = () => {
    const pts = [];
    walls.forEach((w) => { pts.push(w.a, w.b); });
    fences.forEach((f) => { pts.push(f.a, f.b); });
    if (!pts.length) { setView({ x: size.w / 2, y: size.h / 2, k: 1 }); return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = size.w < 600 ? 24 : 60; // tighter margins on phones so more of the plan shows
    const bw = (maxX - minX) * scale || 1, bh = (maxY - minY) * scale || 1;
    const k = Math.min((size.w - pad * 2) / bw, (size.h - pad * 2) / bh, 3);
    const cx = ((minX + maxX) / 2) * scale, cy = ((minY + maxY) / 2) * scale;
    setView({ k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k });
  };
  // fit once on mount
  const didFit = useRef(false);
  useEffect(() => { if (!didFit.current && size.w > 100) { didFit.current = true; setTimeout(fitView, 0); } }, [size.w]);

  // ---------------- grid lines ----------------
  const gridLines = useMemo(() => {
    const lines = [];
    const span = 160; // feet each way
    for (let i = -span; i <= span; i += grid) {
      const major = i % 5 === 0;
      lines.push(<Line key={'v' + i} points={[i * scale, -span * scale, i * scale, span * scale]}
        stroke={major ? t.gridMajor : t.gridMinor} strokeWidth={major ? 1 : 0.5} />);
      lines.push(<Line key={'h' + i} points={[-span * scale, i * scale, span * scale, i * scale]}
        stroke={major ? t.gridMajor : t.gridMinor} strokeWidth={major ? 1 : 0.5} />);
    }
    // axes
    lines.push(<Line key="ax" points={[-span * scale, 0, span * scale, 0]} stroke={t.axis} strokeWidth={1.2} />);
    lines.push(<Line key="ay" points={[0, -span * scale, 0, span * scale]} stroke={t.axis} strokeWidth={1.2} />);
    return lines;
  }, [grid, scale, t]);

  const cursorPx = cursor ? { x: cursor.x * scale, y: cursor.y * scale } : null;
  const showDraftPreview = draft && cursor && ['wall', 'fence'].includes(tool);
  // dimension visibility ramps off when zoomed out — based on effective screen
  // px-per-foot so it adapts to the scale setting (full ≥9px/ft, gone ≤5px/ft)
  const dimOpacity = Math.max(0, Math.min(1, (scale * view.k - 5) / 4));

  const selWall = selection?.type === 'wall' ? walls.find((w) => w.id === selection.id) : null;
  const selFence = selection?.type === 'fence' ? fences.find((f) => f.id === selection.id) : null;

  // building center — tells interior from exterior for dimensioning + alignment
  const wallCentroid = useMemo(() => centroidOf(walls.flatMap((w) => [w.a, w.b])), [walls]);
  const fenceCentroid = useMemo(() => centroidOf(fences.flatMap((f) => [f.a, f.b])), [fences]);
  const dimKinds = dimMode === 'off' ? [] : dimMode === 'both' ? ['interior', 'exterior'] : [dimMode];
  const openingsByWall = useMemo(() => {
    const m = {};
    openings.forEach((o) => { (m[o.wallId] ||= []).push(o); });
    return m;
  }, [openings]);
  const gatesByFence = useMemo(() => {
    const m = {};
    gates.forEach((g) => { (m[g.fenceId] ||= []).push(g); });
    return m;
  }, [gates]);
  const ROW_GAP = 1.6; // ft — push the overall row out past the opening string
  const hasOpenings = openings.length > 0;
  // Justified, miter-joined endpoints per wall/fence so corners stay clean when
  // the drawn line is shifted to a face (interior/exterior). See justifiedSegments.
  const wallSegs = useMemo(
    () => justifiedSegments(walls, wallJustify, wallCentroid, (w) => w.thickness),
    [walls, wallJustify, wallCentroid]);
  const fenceSegs = useMemo(
    () => justifiedSegments(fences, fenceJustify, fenceCentroid, () => FENCE_THICK),
    [fences, fenceJustify, fenceCentroid]);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: (space.current || tool === 'pan') ? 'grab' : tool === 'zoom' ? 'zoom-in' : tool === 'select' ? 'default' : 'crosshair' }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.k}
        scaleY={view.k}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onClick={onClick}
        onDblClick={onDblClick}
        onTap={onClick}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ background: t.stageBg }}
      >
        <Layer ref={layerRef} listening={true}>
          {/* grid */}
          <Group listening={false}>{gridLines}</Group>

          {/* fences (under walls) */}
          {layers.fences && fences.map((f) => (
            <FenceShape key={f.id} fence={f} scale={scale} palette={t} seg={fenceSegs.get(f.id)} gates={gatesByFence[f.id] || []} selected={selection?.id === f.id}
              onSelect={(e) => { e.cancelBubble = true; if (tool === 'select') { store.select({ type: 'fence', id: f.id }); startHandle({ kind: 'fenceMove', id: f.id })(e); } }} />
          ))}
          {/* gates */}
          {layers.gates && gates.map((g) => {
            const f = fences.find((x) => x.id === g.fenceId);
            return (
              <GateShape key={g.id} gate={g} fence={f} scale={scale} palette={t} seg={f ? fenceSegs.get(f.id) : null} centroid={fenceCentroid} selected={selection?.id === g.id}
                onSelect={(e) => {
                  e.cancelBubble = true;
                  if (tool === 'select') { store.select({ type: 'gate', id: g.id }); startHandle({ kind: 'gate', id: g.id, hostId: g.fenceId })(e); }
                }} />
            );
          })}

          {/* walls */}
          {layers.walls && walls.map((w) => (
            <WallShape key={w.id} wall={w} scale={scale} palette={t} seg={wallSegs.get(w.id)} selected={selection?.id === w.id}
              onSelect={(e) => { e.cancelBubble = true; if (tool === 'select') { store.select({ type: 'wall', id: w.id }); startHandle({ kind: 'wallMove', id: w.id })(e); } }} />
          ))}
          {/* openings */}
          {layers.openings && openings.map((o) => {
            const w = walls.find((x) => x.id === o.wallId);
            return (
              <OpeningShape key={o.id} op={o} wall={w} scale={scale} palette={t} centroid={wallCentroid} seg={w ? wallSegs.get(w.id) : null} selected={selection?.id === o.id}
                onSelect={(e) => {
                  e.cancelBubble = true;
                  if (tool === 'select') { store.select({ type: 'opening', id: o.id }); startHandle({ kind: 'opening', id: o.id, hostId: o.wallId })(e); }
                }} />
            );
          })}

          {/* dimension labels — fade out when zoomed far out so they don't
              swamp the plan (they're secondary; zoom in to read them) */}
          {layers.dims && dimOpacity > 0.02 && <Group opacity={dimOpacity} listening={dimOpacity > 0.5}>
            {walls.map((w) => {
              if (w.noDim) return null; // dimensions hidden for this wall (per-wall override)
              const base = w.dimOff ?? dimOffset;
              return dimKinds.map((k) => {
                // push the outer (exterior/centerline) row out so it clears the opening string
                const extra = hasOpenings && k !== 'interior' ? ROW_GAP : 0;
                return (
                  <WallDimension key={'dw' + w.id + k} wall={w} kind={k} offset={base + extra} justify={wallJustify}
                    centroid={wallCentroid} scale={scale} palette={t} color={t.wallDim} onPillDown={startOffsetDrag(w, 'wall', w.id, extra)} zoom={view.k} />
                );
              });
            })}
            {/* opening dimension strings (wall length split at each opening) */}
            {dimMode !== 'off' && walls.map((w) => (
              !w.noDim && openingsByWall[w.id]?.length
                ? <WallOpeningDims key={'od' + w.id} wall={w} openings={openingsByWall[w.id]} perpOffset={w.openDimOff ?? dimOffset}
                    centroid={wallCentroid} justify={wallJustify} scale={scale} palette={t} color={t.wallDim} onPillDown={startOffsetDrag(w, 'wall', w.id, 0, 'openDimOff')} zoom={view.k} />
                : null
            ))}
            {/* fence dimensions — overall length + gate splits, like walls */}
            {dimMode !== 'off' && fences.map((f) => {
              const fw = { ...f, thickness: FENCE_THICK };
              const fgates = gatesByFence[f.id];
              const extra = fgates?.length ? ROW_GAP : 0;
              const base = f.dimOff ?? dimOffset;
              return (
                <React.Fragment key={'fd' + f.id}>
                  <WallDimension wall={fw} kind="centerline" offset={base + extra} justify={fenceJustify}
                    centroid={fenceCentroid} scale={scale} palette={t} color={t.fenceDim} onPillDown={startOffsetDrag(fw, 'fence', f.id, extra)} zoom={view.k} />
                  {fgates?.length ? (
                    <WallOpeningDims wall={fw} openings={fgates} perpOffset={f.openDimOff ?? dimOffset}
                      centroid={fenceCentroid} justify={fenceJustify} scale={scale} palette={t} color={t.fenceDim} onPillDown={startOffsetDrag(fw, 'fence', f.id, 0, 'openDimOff')} zoom={view.k} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </Group>}

          {/* selected wall endpoint handles */}
          {selWall && ['a', 'b'].map((end) => (
            <Circle key={end} x={selWall[end].x * scale} y={selWall[end].y * scale} radius={coarse ? 10 : 6}
              fill="#fff" stroke={BLUE} strokeWidth={2} hitStrokeWidth={coarse ? 22 : 10}
              onMouseDown={startHandle({ kind: 'wallEnd', id: selWall.id, end, origin: { ...selWall[end] } })}
              onTouchStart={startHandle({ kind: 'wallEnd', id: selWall.id, end, origin: { ...selWall[end] } })} />
          ))}
          {selFence && ['a', 'b'].map((end) => (
            <Circle key={end} x={selFence[end].x * scale} y={selFence[end].y * scale} radius={coarse ? 10 : 6}
              fill="#fff" stroke={BLUE} strokeWidth={2} hitStrokeWidth={coarse ? 22 : 10}
              onMouseDown={startHandle({ kind: 'fenceEnd', id: selFence.id, end, origin: { ...selFence[end] } })}
              onTouchStart={startHandle({ kind: 'fenceEnd', id: selFence.id, end, origin: { ...selFence[end] } })} />
          ))}

          {/* room area labels */}
          {rooms.map((rm, i) => {
            const txt = `${Math.round(rm.area)} sq ft`;
            const w = txt.length * 7 + 14;
            return (
              <Group key={'room' + i} x={rm.centroid.x * scale} y={rm.centroid.y * scale} scaleX={1 / view.k} scaleY={1 / view.k} listening={false}>
                <Rect x={-w / 2} y={-11} width={w} height={22} cornerRadius={5} fill="rgba(20,184,166,0.12)" stroke={t.fenceDim || '#0d9488'} strokeWidth={1} />
                <Text x={-w / 2} y={-6} width={w} align="center" text={txt} fontSize={12} fontStyle="700" fill={t.fenceDim || '#0d9488'} />
              </Group>
            );
          })}

          {/* stairs */}
          {layers.stairs && stairs.map((stp) => (
            <StairShape key={stp.id} stair={stp} scale={scale} palette={t} zoom={view.k} selected={selection?.id === stp.id}
              onSelect={(e) => { e.cancelBubble = true; if (tool === 'select') { store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stair', id: stp.id })(e); } }}
              onWidthDown={(e) => { e.cancelBubble = true; store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stairWidth', id: stp.id })(e); }}
              onRunDown={(e) => { e.cancelBubble = true; store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stairRun', id: stp.id })(e); }}
              onRotateDown={(e) => { e.cancelBubble = true; store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stairRotate', id: stp.id })(e); }} />
          ))}

          {/* labels (leader-line callouts) */}
          {layers.labels && labels.map((lb) => (
            <LabelShape key={lb.id} label={lb} scale={scale} zoom={view.k} selected={selection?.id === lb.id}
              onPillDown={(e) => { e.cancelBubble = true; if (tool === 'select') { store.select({ type: 'label', id: lb.id }); startHandle({ kind: 'labelPos', id: lb.id })(e); } }}
              onAnchorDown={(e) => { e.cancelBubble = true; if (tool === 'select') { store.select({ type: 'label', id: lb.id }); startHandle({ kind: 'labelAnchor', id: lb.id })(e); } }} />
          ))}

          {/* alignment guides while dragging a component */}
          {guides.length > 0 && (
            <Group listening={false}>
              {guides.map((g, i) => (
                <Line key={'guide' + i} points={[g[0] * scale, g[1] * scale, g[2] * scale, g[3] * scale]}
                  stroke={TEAL} strokeWidth={1} dash={[5, 4]} strokeScaleEnabled={false} />
              ))}
            </Group>
          )}

          {/* draft preview */}
          {showDraftPreview && (
            <Group listening={false}>
              <Line points={[draft.x * scale, draft.y * scale, cursor.x * scale, cursor.y * scale]}
                stroke={tool === 'wall' ? BLUE : TEAL} strokeWidth={2} dash={[6, 5]} />
              <DimLabel a={draft} b={{ x: cursor.x, y: cursor.y }} scale={scale} palette={t} color={tool === 'wall' ? BLUE : t.fenceDim} zoom={view.k} />
              {/* "close the loop" target — click the start point to finish */}
              {runStart && dist(runStart, draft) > 0.1 && (
                <Circle x={runStart.x * scale} y={runStart.y * scale} radius={9 / view.k}
                  stroke={t.snapNode || TEAL} strokeWidth={2.5 / view.k}
                  fill={dist(cursor, runStart) < 0.8 ? 'rgba(20,184,166,0.25)' : 'transparent'} />
              )}
            </Group>
          )}

          {/* room draft preview */}
          {tool === 'room' && draft && cursor && (() => {
            const x0 = draft.x, y0 = draft.y, x1 = cursor.x, y1 = cursor.y;
            const c = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
            const pts = c.flatMap((p) => [p.x * scale, p.y * scale]);
            return (
              <Group listening={false}>
                <Line points={pts} stroke={BLUE} strokeWidth={2} dash={[6, 5]} closed />
                <DimLabel a={{ x: x0, y: y0 }} b={{ x: x1, y: y0 }} scale={scale} palette={t} color={BLUE} zoom={view.k} />
                <DimLabel a={{ x: x1, y: y0 }} b={{ x: x1, y: y1 }} scale={scale} palette={t} color={BLUE} zoom={view.k} />
              </Group>
            );
          })()}

          {/* snap indicator */}
          {cursorPx && ['wall', 'fence', 'room'].includes(tool) && (
            <Circle x={cursorPx.x} y={cursorPx.y} radius={cursor?.onNode ? 7 : 4}
              stroke={cursor?.onNode ? t.snapNode : t.snap} strokeWidth={2} fill={cursor?.onNode ? 'rgba(20,184,166,0.2)' : 'transparent'} listening={false} />
          )}

          {/* measure tool */}
          {measure.length > 0 && (
            <Group listening={false}>
              {measure.length === 1 && cursor && (
                <>
                  <Line points={[measure[0].x * scale, measure[0].y * scale, cursor.x * scale, cursor.y * scale]}
                    stroke="#a855f7" strokeWidth={2} dash={[5, 4]} />
                  <DimLabel a={measure[0]} b={{ x: cursor.x, y: cursor.y }} scale={scale} palette={t} color="#a855f7" zoom={view.k} />
                </>
              )}
              {measure.length === 2 && (
                <>
                  <Line points={[measure[0].x * scale, measure[0].y * scale, measure[1].x * scale, measure[1].y * scale]}
                    stroke="#a855f7" strokeWidth={2} />
                  <DimLabel a={measure[0]} b={measure[1]} scale={scale} palette={t} color="#a855f7" zoom={view.k} />
                </>
              )}
              {measure.map((m, i) => <Circle key={i} x={m.x * scale} y={m.y * scale} radius={4} fill="#a855f7" />)}
            </Group>
          )}
        </Layer>
      </Stage>

      {/* floating view controls */}
      <div className="float-controls">
        <button className="icon-btn" title="Zoom in" onClick={() => zoomBy(1.2)}><IconZoomIn /></button>
        <button className="icon-btn" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}><IconZoomOut /></button>
        <button className="icon-btn" title="Fit to screen" onClick={fitView}><IconFit /></button>
      </div>

      <div className="compass-control"><Compass size={50} /></div>
      <div className="scale-readout">1 grid = 1 ft &nbsp;·&nbsp; {Math.round(view.k * 100)}%<span className="sr-pan">&nbsp;·&nbsp; pan: Space-drag / middle-mouse</span></div>

      {/* compact length entry — floats next to the point being drawn; type a
          length + Enter to place, ✓ to finish */}
      {draft && (tool === 'wall' || tool === 'fence') && (() => {
        const p = cursor || draft;
        return (
          <div className="len-entry" style={{ left: view.x + p.x * scale * view.k, top: view.y + p.y * scale * view.k, right: 'auto', bottom: 'auto', transform: 'translate(16px, -48px)' }}>
            <input ref={lenInputRef} type="text" inputMode="decimal" value={lenStr}
              placeholder={cursor ? formatFeetInches(dist(draft, cursor)) : '—'}
              onChange={(e) => setLenStr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTypedLength(); }
                else if (e.key === 'Escape') { e.preventDefault(); finishRun(false); e.currentTarget.blur(); }
              }} />
            <button className="le-finish" onMouseDown={(e) => { e.preventDefault(); finishRun(true); }} title="Finish (Enter on empty, or double-click)">✓</button>
          </div>
        );
      })()}

      <FenceLegend fences={fences} />
    </div>
  );
}
