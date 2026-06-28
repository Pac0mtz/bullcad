import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, Rect } from 'react-konva';
import { useStore } from '../store.js';
import {
  dist, lerp, snapPt, snapToNodes, projectOnSegment, formatFeetInches, centroidOf, justifiedSegments, wallPolygons, stairGeometry, snapAngle, detectRooms, roomWalls, roomSignature, parseLength,
} from '../utils/geometry.js';

const FENCE_THICK = 0.3; // nominal fence body width (ft) for alignment offset
import { CANVAS_THEME } from '../utils/theme.js';
import { WallShape, OpeningShape, FenceShape, GateShape, PostShape, DimLabel, WallDimension, WallOpeningDims, LabelShape, StairShape } from './canvas/Shapes.jsx';
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
  const { tool, scale, grid, snapEnabled, walls, openings, fences, gates, posts, labels, stairs, selection, multi, theme, dimMode, dimOffset, wallJustify, fenceJustify, showRoomAreas, layers, detachCorner, roomNames, roomLabelPos } = store;
  // closed wall loops → rooms. Always detected so the interior gets a white
  // floor; the `showRoomAreas` toggle only governs the numeric area label.
  // Each room carries its bounding-wall ids, a stable signature, its name, and
  // its label position (a dragged override, else the room centroid).
  const rooms = useMemo(() => detectRooms(walls).map((rm) => {
    const wallIds = roomWalls(rm, walls);
    const sig = roomSignature(wallIds);
    return { ...rm, wallIds, sig, name: (roomNames || {})[sig] || '', labelPos: (roomLabelPos || {})[sig] || rm.centroid };
  }), [walls, roomNames, roomLabelPos]);
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
  const [marquee, setMarquee] = useState(null); // {x0,y0,x1,y1} feet — rubber-band box (zoom or select)
  const [mDraw, setMDraw] = useState(null); // mobile guided wall draw: { phase:'idle'|'placing', anchor, pointer, start }
  const drag = useRef(null); // active handle drag
  const runPath = useRef([]); // points clicked in the current wall run (for the room-area label)
  const marq = useRef(null);  // active marquee drag
  const suppressClick = useRef(false); // skip the click that ends a marquee drag
  const space = useRef(false);
  const shift = useRef(false);
  const alt = useRef(false);
  const pan = useRef(null);
  const coarse = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, []);
  // mirror view/size into refs so the window mouseup listener (bound once) can read them
  const viewRef = useRef(view); viewRef.current = view;
  const sizeRef = useRef(size); sizeRef.current = size;

  // Adaptive grid: subdivide the 1-ft grid into 6"/3"/1" cells as you zoom in, so
  // the grid (and snapping) work at inch precision. `minorStep` is in feet.
  const pxPerCell = scale * view.k * grid;
  const minorStep =
    pxPerCell >= 110 ? grid / 12 : // 1 in  (grid = 1 ft)
    pxPerCell >= 48 ? grid / 4 :   // 3 in
    pxPerCell >= 24 ? grid / 2 :   // 6 in
    grid;                          // 1 ft
  const stepLabel = minorStep >= 1 ? `${minorStep} ft` : `${Math.round(minorStep * 12)} in`;

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
        const k1 = Math.max(0.2, Math.min(16, v.k * ratio));
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
  const finishRun = (toSelect) => { setDraft(null); setRunStart(null); setLenStr(''); setGuides([]); runPath.current = []; if (toSelect) store.setTool('select'); };

  // when a wall run closes into a loop, drop a draggable area label at the room centroid
  const addRoomAreaLabel = (path) => {
    if (!path || path.length < 3) return;
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length];
      const cr = a.x * b.y - b.x * a.y;
      area += cr; cx += (a.x + b.x) * cr; cy += (a.y + b.y) * cr;
    }
    area /= 2;
    if (Math.abs(area) < 1) return;
    cx /= (6 * area); cy /= (6 * area);
    store.addRoomLabel({ x: cx, y: cy }, `${Math.abs(area).toFixed(1)} ft²`);
  };

  // ---- mobile guided wall draw: drag a target, Begin Wall, then drag a pointer and
  // Continue/End each segment (touch-friendly alternative to tap-to-place) ----
  useEffect(() => {
    if (coarse && (tool === 'wall' || tool === 'fence')) {
      const cx = (size.w / 2 - view.x) / (scale * view.k), cy = (size.h / 2 - view.y) / (scale * view.k);
      const p = snapEnabled ? snapPt({ x: cx, y: cy }, minorStep) : { x: cx, y: cy };
      setMDraw({ phase: 'idle', anchor: null, pointer: p, start: null });
      runPath.current = [];
    } else {
      setMDraw(null);
    }
  }, [coarse, tool]); // eslint-disable-line react-hooks/exhaustive-deps
  const mBegin = () => setMDraw((m) => ({ ...m, phase: 'placing', anchor: m.pointer, start: m.pointer }));
  const mAddSeg = (cont) => setMDraw((m) => {
    if (!m.anchor) return m;
    const end = m.pointer;
    if (dist(m.anchor, end) > 0.1) {
      tool === 'wall' ? store.addWall(m.anchor, end) : store.addFence(m.anchor, end);
      if (!runPath.current.length) runPath.current.push(m.start);
      runPath.current.push(end);
    }
    const closed = m.start && dist(end, m.start) < 0.35;
    if (!cont || closed) {
      if (closed && tool === 'wall') addRoomAreaLabel(runPath.current);
      runPath.current = [];
      return { phase: 'idle', anchor: null, pointer: end, start: null };
    }
    return { ...m, anchor: end, pointer: end };
  });

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
    // snap onto a wall/fence mid-span so you can tie into a wall (T-junction)
    let onSeg = null, host = null, bestD = 0.5;
    for (const s of [...walls, ...fences]) {
      const pr = projectOnSegment(pt, s.a, s.b);
      if (pr.t > 0.03 && pr.t < 0.97 && pr.distance < bestD) { bestD = pr.distance; onSeg = pr.point; host = s; }
    }
    if (onSeg) {
      const dx = host.b.x - host.a.x, dy = host.b.y - host.a.y, hl = Math.hypot(dx, dy) || 1;
      return { x: onSeg.x, y: onSeg.y, onNode: true, onWall: true, wallDir: { x: dx / hl, y: dy / hl } };
    }
    return { ...snapPt(pt, minorStep), onNode: false };
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
    // start a rubber-band marquee on empty canvas: Zoom → zoom-to-area, Select → multi-select
    if (e.target === stageRef.current && (tool === 'zoom' || tool === 'select') && evt.button === 0) {
      const raw = getFeet();
      if (raw) { marq.current = { mode: tool, x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y, moved: false, add: evt.shiftKey }; setMarquee({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y }); }
    }
  };

  const onMouseMove = () => {
    if (pan.current) return;
    const raw = getFeet();
    if (!raw) return;
    if (marq.current) {
      const m = marq.current; m.x1 = raw.x; m.y1 = raw.y;
      if (!m.moved && Math.hypot(raw.x - m.x0, raw.y - m.y0) > 0.2) m.moved = true;
      setMarquee({ x0: m.x0, y0: m.y0, x1: raw.x, y1: raw.y });
      return;
    }
    if (drag.current) {
      handleDragMove(raw);
      return;
    }
    if (tool === 'wall' || tool === 'fence') setCursor(drawPt(raw));
    else if (tool === 'room') setCursor(snapDraw(raw));
    else setCursor(raw);
  };

  // finalize a marquee on release — kept in a ref so the once-bound mouseup
  // listener always calls the latest closure (current geometry / view / size)
  const finishMarqueeRef = useRef();
  finishMarqueeRef.current = (m) => {
    const r = { x0: Math.min(m.x0, m.x1), y0: Math.min(m.y0, m.y1), x1: Math.max(m.x0, m.x1), y1: Math.max(m.y0, m.y1) };
    if (m.mode === 'zoom') {
      const wft = Math.max(0.3, r.x1 - r.x0), hft = Math.max(0.3, r.y1 - r.y0), sz = sizeRef.current;
      const k = Math.max(0.2, Math.min(16, Math.min(sz.w / (wft * scale), sz.h / (hft * scale)) * 0.92));
      const cx = (r.x0 + r.x1) / 2 * scale, cy = (r.y0 + r.y1) / 2 * scale;
      setView({ k, x: sz.w / 2 - cx * k, y: sz.h / 2 - cy * k });
    } else {
      const inside = (p) => p && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
      const items = [];
      if (layers.walls) walls.forEach((w) => { if (inside(w.a) && inside(w.b)) items.push({ type: 'wall', id: w.id }); });
      if (layers.fences) fences.forEach((f) => { if (inside(f.a) && inside(f.b)) items.push({ type: 'fence', id: f.id }); });
      if (layers.stairs) stairs.forEach((s) => { if (inside({ x: s.x, y: s.y })) items.push({ type: 'stair', id: s.id }); });
      if (layers.labels) labels.forEach((l) => { if (inside(l.pos)) items.push({ type: 'label', id: l.id }); });
      const merged = m.add ? [...store.multi.filter((a) => !items.some((b) => b.id === a.id)), ...items] : items;
      store.selectMany(merged);
    }
  };

  // native pan via window listeners (so it keeps working off-stage)
  useEffect(() => {
    const move = (e) => {
      if (!pan.current) return;
      setView((v) => ({ ...v, x: pan.current.vx + (e.clientX - pan.current.sx), y: pan.current.vy + (e.clientY - pan.current.sy) }));
    };
    const up = () => {
      if (pan.current) pan.current = null;
      if (marq.current) {
        const m = marq.current; marq.current = null;
        if (m.moved) finishMarqueeRef.current(m);
        else if (m.mode === 'select') useStore.getState().clearSelection();
        setMarquee(null);
      }
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
    if (marq.current && marq.current.moved) return; // a marquee drag, not a click (Konva fires click before mouseup)
    // allow touch taps (button is undefined); block only real non-left mouse buttons
    if (space.current || (e.evt.button != null && e.evt.button !== 0)) return;
    const raw = getFeet();
    if (!raw) return;

    if (tool === 'wall' || tool === 'fence') {
      if (mDraw) return; // mobile guided draw owns the gesture (use the Begin/Continue buttons)
      const pt = drawPt(raw);
      const clean = { x: pt.x, y: pt.y };
      if (!draft) { setDraft(clean); setRunStart(clean); runPath.current = [clean]; return; } // begin a run
      if (dist(draft, clean) < 0.1) { finishRun(false); return; }   // clicked the same point → finish (stay in tool)
      tool === 'wall' ? store.addWall(draft, clean) : store.addFence(draft, clean);
      if (runStart && dist(clean, runStart) < 0.1) { // closed the loop → tag the room area, back to Select
        if (tool === 'wall') addRoomAreaLabel(runPath.current);
        finishRun(true); return;
      }
      runPath.current.push(clean);
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
    } else if (tool === 'post') {
      const hit = nearest(raw, fences);
      if (hit) { const id = store.addPost(hit.id, hit.t); store.setTool('select'); store.select({ type: 'post', id }); }
    } else if (tool === 'measure') {
      setMeasure((m) => (m.length >= 2 ? [raw] : [...m, raw]));
    } else if (tool === 'label') {
      // anchor the callout at the clicked spot, then drop into Select to drag it
      const pt = snapEnabled ? snapPt(raw, minorStep) : raw;
      const id = store.addLabel(pt);
      store.setTool('select');
      store.select({ type: 'label', id });
    } else if (tool === 'stairs') {
      const pt = snapEnabled ? snapPt(raw, minorStep) : raw;
      const id = store.addStair(pt);
      store.setTool('select');
      store.select({ type: 'stair', id });
    } else if (tool === 'zoom') {
      // click to zoom in at the point; Alt/Shift-click to zoom out
      const ptr = stageRef.current.getPointerPosition();
      const k0 = view.k;
      const k1 = Math.max(0.2, Math.min(16, k0 * (e.evt.altKey || e.evt.shiftKey ? 1 / 1.4 : 1.4)));
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
      // Apple Pencil / stylus draws precisely and never pans — finger pans.
      const pen = t.touchType === 'stylus';
      touch.current = { mode: pen ? 'pen' : null, pen, sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY };
      if (pen) { const raw = getFeet(); if (raw && ['wall', 'fence', 'room'].includes(tool)) setCursor(drawPt(raw)); }
    }
  };
  const onTouchMove = (e) => {
    // dragging a resize/move handle takes priority over pan
    if (drag.current) { e.evt.preventDefault(); const raw = getFeet(); if (raw) handleDragMove(raw); return; }
    if (pinch.current) return; // two-finger pinch owns the gesture
    const c = touch.current, ts = e.evt.touches; if (!c || ts.length !== 1) return;
    const t = ts[0];
    // pencil down: keep the rubber-band preview under the tip, but never pan
    if (c.pen) {
      e.evt.preventDefault();
      const raw = getFeet();
      if (raw && ['wall', 'fence', 'room'].includes(tool)) setCursor(drawPt(raw));
      return;
    }
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
    const k1 = Math.max(0.2, Math.min(16, k0 * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1)));
    const wx = (ptr.x - view.x) / k0;
    const wy = (ptr.y - view.y) / k0;
    setView({ k: k1, x: ptr.x - wx * k1, y: ptr.y - wy * k1 });
  };

  // ---------------- handle dragging (endpoints / openings / gates) ----------------
  const startHandle = (payload) => (e) => {
    e.cancelBubble = true;
    if (tool !== 'select') return;
    // Anchor the corner under the exact spot you grabbed: remember where the
    // cursor sat relative to the node so dragging from ANY side of the big round
    // handle keeps the geometry centered on the node (no jump to the cursor).
    const cur = getFeet();
    const grab = (cur && payload.origin) ? { x: payload.origin.x - cur.x, y: payload.origin.y - cur.y } : { x: 0, y: 0 };
    drag.current = { ...payload, grab, moved: false, before: useStore.getState().snapshotGeom() };
  };

  // click a room's floor: select the whole room (its bounding walls) and arm a
  // group drag so dragging moves every wall of the room together
  const startRoomDrag = (rm) => (e) => {
    e.cancelBubble = true;
    if (tool !== 'select') return;
    store.selectRoom(rm.sig, rm.wallIds);
    const raw = getFeet(); if (!raw) return;
    drag.current = { kind: 'group', items: rm.wallIds.map((id) => ({ type: 'wall', id })), last: snapEnabled ? snapPt(raw, minorStep) : raw, moved: false, before: useStore.getState().snapshotGeom() };
  };

  // drag a room's NAME/AREA label to reposition it (independent of the room).
  // Selects the room too, so the grip handle shows while you drag.
  const startRoomLabelDrag = (rm) => (e) => {
    e.cancelBubble = true;
    if (tool !== 'select') return;
    store.selectRoom(rm.sig, rm.wallIds);
    drag.current = { kind: 'roomLabel', sig: rm.sig, moved: false, before: useStore.getState().snapshotGeom() };
  };

  // drag the group bounding box to move every selected element together
  const startGroupDrag = (e) => {
    e.cancelBubble = true;
    if (tool !== 'select' || multi.length < 2) return;
    const raw = getFeet(); if (!raw) return;
    drag.current = { kind: 'group', items: multi, last: snapEnabled ? snapPt(raw, minorStep) : raw, moved: false, before: useStore.getState().snapshotGeom() };
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
    if (d.kind === 'group') {
      const sp = snapEnabled ? snapPt(raw, minorStep) : raw;
      const dx = sp.x - d.last.x, dy = sp.y - d.last.y;
      if (dx || dy) { store.translateSelection(d.items, dx, dy); d.last = sp; }
      return;
    }
    if (d.kind === 'wallEnd' || d.kind === 'fenceEnd') {
      const type = d.kind === 'wallEnd' ? 'wall' : 'fence';
      const list = type === 'wall' ? walls : fences;
      // resolve the joined corner once: every endpoint of this element type that
      // shares the dragged corner moves together (keeps rooms/runs connected)
      if (!d.joints) {
        // detach (split handle, Alt held, or toggle) moves just this corner;
        // otherwise the whole joint moves together
        if (d.solo || alt.current || detachCorner) {
          d.joints = [{ id: d.id, end: d.end }];
        } else {
          const o = d.origin || (list.find((e) => e.id === d.id) || {})[d.end] || raw;
          d.joints = [];
          for (const e of list) for (const end of ['a', 'b']) if (dist(e[end], o) < 0.05) d.joints.push({ id: e.id, end });
          if (!d.joints.length) d.joints = [{ id: d.id, end: d.end }];
        }
      }
      // keep the node where it sat under the cursor when grabbed, so the band
      // stays centered no matter which side of the round handle you pulled on
      const g = d.grab || { x: 0, y: 0 };
      let pt = { x: raw.x + g.x, y: raw.y + g.y };
      if (snapEnabled) {
        // snap to grid or to other nodes (excluding the corner being dragged)
        const jointSet = new Set(d.joints.map((j) => j.id + j.end));
        const others = list.flatMap((e) => ['a', 'b'].filter((end) => !jointSet.has(e.id + end)).map((end) => e[end]));
        const n = snapToNodes(pt, others, 0.8);
        pt = n.snapped ? { x: n.x, y: n.y } : snapPt(pt, minorStep);
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
        if (snapEnabled) off = Math.round(off / minorStep) * minorStep;
        store.moveJoints(type, d.jointsA, { x: d.origA.x + d.perp.x * off, y: d.origA.y + d.perp.y * off });
        store.moveJoints(type, d.jointsB, { x: d.origB.x + d.perp.x * off, y: d.origB.y + d.perp.y * off });
      }
    } else if (d.kind === 'opening' || d.kind === 'gate' || d.kind === 'post') {
      const host = (d.kind === 'opening' ? walls : fences).find((x) => x.id === d.hostId);
      if (host) {
        const { t, gs } = snapAlignT(raw, host, d.kind, d.id);
        store.updateElement(d.kind, d.id, { t });
        setGuides(gs);
      }
    } else if (d.kind === 'openingWidth' || d.kind === 'gateWidth') {
      // resize a door/window/gate by dragging an edge — center stays put, both
      // jambs move symmetrically; snap to 1/4" so half/quarter inches are reachable
      const type = d.kind === 'openingWidth' ? 'opening' : 'gate';
      const host = (type === 'opening' ? walls : fences).find((x) => x.id === d.hostId);
      if (host) {
        const L = dist(host.a, host.b) || 1;
        const ux = (host.b.x - host.a.x) / L, uy = (host.b.y - host.a.y) / L;
        let half = Math.abs((raw.x - d.center.x) * ux + (raw.y - d.center.y) * uy);
        let width = Math.max(0.5, Math.min(L, half * 2));
        if (snapEnabled) { const Q = 1 / 48; width = Math.round(width / Q) * Q; } // 1/4 inch
        store.updateElement(type, d.id, { width });
      }
    } else if (d.kind === 'stair') {
      const pt = snapEnabled ? snapPt(raw, minorStep) : raw;
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
    } else if (d.kind === 'roomLabel') {
      const pt = snapEnabled ? snapPt(raw, minorStep) : raw;
      store.setRoomLabelPos(d.sig, pt);
    } else if (d.kind === 'labelPos') {
      store.updateElement('label', d.id, { pos: { x: raw.x, y: raw.y } });
    } else if (d.kind === 'labelAnchor') {
      const pt = snapEnabled ? snapPt(raw, minorStep) : raw;
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
    const k1 = Math.max(0.2, Math.min(16, v.k * m));
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
    const pxPerFt = scale * view.k;
    // only build lines across the visible viewport (+ margin) so the fine inch
    // grid stays cheap when zoomed in
    const m = 2; // ft margin
    const left = Math.floor((-view.x) / pxPerFt) - m, right = Math.ceil((size.w - view.x) / pxPerFt) + m;
    const top = Math.floor((-view.y) / pxPerFt) - m, bottom = Math.ceil((size.h - view.y) / pxPerFt) + m;
    const isMul = (v, k) => Math.abs(v / k - Math.round(v / k)) < 1e-4;
    const stroke = (onFoot, onFive) => onFive ? t.gridMajor : onFoot ? t.gridMajor : t.gridMinor;
    const width = (onFoot, onFive) => onFive ? 1.2 : onFoot ? 0.9 : 0.5; // screen px (strokeScaleEnabled off)
    const x0 = Math.floor(left / minorStep) * minorStep, y0 = Math.floor(top / minorStep) * minorStep;
    for (let x = x0; x <= right + 1e-6; x += minorStep) {
      const f = isMul(x, 1), f5 = isMul(x, 5);
      lines.push(<Line key={'v' + x.toFixed(3)} points={[x * scale, top * scale, x * scale, bottom * scale]}
        stroke={stroke(f, f5)} strokeWidth={width(f, f5)} opacity={f ? 1 : 0.6} strokeScaleEnabled={false} />);
    }
    for (let y = y0; y <= bottom + 1e-6; y += minorStep) {
      const f = isMul(y, 1), f5 = isMul(y, 5);
      lines.push(<Line key={'h' + y.toFixed(3)} points={[left * scale, y * scale, right * scale, y * scale]}
        stroke={stroke(f, f5)} strokeWidth={width(f, f5)} opacity={f ? 1 : 0.6} strokeScaleEnabled={false} />);
    }
    // axes
    lines.push(<Line key="ax" points={[left * scale, 0, right * scale, 0]} stroke={t.axis} strokeWidth={1.4} strokeScaleEnabled={false} />);
    lines.push(<Line key="ay" points={[0, top * scale, 0, bottom * scale]} stroke={t.axis} strokeWidth={1.4} strokeScaleEnabled={false} />);
    return lines;
  }, [minorStep, scale, t, view, size]);

  const cursorPx = cursor ? { x: cursor.x * scale, y: cursor.y * scale } : null;
  const showDraftPreview = draft && cursor && ['wall', 'fence'].includes(tool);
  // dimension visibility ramps off when zoomed out — based on effective screen
  // px-per-foot so it adapts to the scale setting (full ≥9px/ft, gone ≤5px/ft)
  const dimOpacity = Math.max(0, Math.min(1, (scale * view.k - 5) / 4));

  const selWall = selection?.type === 'wall' ? walls.find((w) => w.id === selection.id) : null;
  const selFence = selection?.type === 'fence' ? fences.find((f) => f.id === selection.id) : null;
  const selOpening = selection?.type === 'opening' ? openings.find((o) => o.id === selection.id) : null;
  const selGate = selection?.type === 'gate' ? gates.find((g) => g.id === selection.id) : null;

  // marquee group: set of selected ids + the group bounding box (feet)
  const multiSet = useMemo(() => new Set(multi.map((m) => m.id)), [multi]);
  const groupBounds = useMemo(() => {
    if (multi.length < 2) return null;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const add = (p) => { if (p) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); } };
    multi.forEach((it) => {
      if (it.type === 'wall') { const w = walls.find((x) => x.id === it.id); if (w) { add(w.a); add(w.b); } }
      else if (it.type === 'fence') { const f = fences.find((x) => x.id === it.id); if (f) { add(f.a); add(f.b); } }
      else if (it.type === 'stair') { const s = stairs.find((x) => x.id === it.id); if (s) add({ x: s.x, y: s.y }); }
      else if (it.type === 'label') { const l = labels.find((x) => x.id === it.id); if (l) add(l.pos); }
    });
    return isFinite(minx) ? { minx, miny, maxx, maxy } : null;
  }, [multi, walls, fences, stairs, labels]);

  // building center — tells interior from exterior for dimensioning + alignment
  const wallCentroid = useMemo(() => centroidOf(walls.flatMap((w) => [w.a, w.b])), [walls]);
  const fenceCentroid = useMemo(() => centroidOf(fences.flatMap((f) => [f.a, f.b])), [fences]);
  const kindsFor = (m) => (m === 'off' ? [] : m === 'both' ? ['interior', 'exterior'] : [m]);
  const dimKinds = kindsFor(dimMode);
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
  const wallPolys = useMemo(
    () => wallPolygons(walls, wallJustify, wallCentroid, (w) => w.thickness || 0.5),
    [walls, wallJustify, wallCentroid]);
  const fenceSegs = useMemo(
    () => justifiedSegments(fences, fenceJustify, fenceCentroid, () => FENCE_THICK),
    [fences, fenceJustify, fenceCentroid]);

  // corner grips: ONE per shared node (deduped by the raw endpoint), positioned
  // at the AVERAGE of the walls' justified band-center endpoints — so the circle
  // sits centered on the wall band corner, not offset to the drawn face, and
  // junctions don't produce overlapping doubles. Diameter = wall thickness.
  const nodeKey = (p) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const cornerDots = useMemo(() => {
    const m = new Map(); // raw-node key -> { sx, sy, n, thick }
    const add = (raw, just, th) => {
      const k = nodeKey(raw);
      const cur = m.get(k);
      if (cur) { cur.sx += just.x; cur.sy += just.y; cur.n++; cur.thick = Math.max(cur.thick, th); }
      else m.set(k, { key: k, sx: just.x, sy: just.y, n: 1, thick: th });
    };
    // at a T-junction the band endpoint is stretched into the through-wall, so
    // grip on the raw connection point instead (keeps the circle centered there)
    walls.forEach((w) => { const s = wallSegs.get(w.id); add(w.a, s?.aT ? w.a : (s?.a || w.a), w.thickness || 0.5); add(w.b, s?.bT ? w.b : (s?.b || w.b), w.thickness || 0.5); });
    fences.forEach((f) => { const s = fenceSegs.get(f.id); add(f.a, s?.aT ? f.a : (s?.a || f.a), FENCE_THICK); add(f.b, s?.bT ? f.b : (s?.b || f.b), FENCE_THICK); });
    return [...m.values()].map((c) => ({ key: c.key, x: c.sx / c.n, y: c.sy / c.n, thick: c.thick }));
  }, [walls, fences, wallSegs, fenceSegs]);

  // corners of the currently-selected wall/fence — their gray grip is hidden so
  // the blue handle is the ONLY circle there (one circle per corner, like 4plan)
  const selectedNodeKeys = useMemo(() => {
    const s = new Set();
    if (selWall) { s.add(nodeKey(selWall.a)); s.add(nodeKey(selWall.b)); }
    if (selFence) { s.add(nodeKey(selFence.a)); s.add(nodeKey(selFence.b)); }
    return s;
  }, [selWall, selFence]);

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

          {/* room floors: a solid fill inside every closed wall loop, drawn under
              the walls so the wall poché trims it to the interior faces. Click to
              select the whole room (its bounding walls); drag to move them all. */}
          {layers.walls && rooms.map((rm, i) => {
            const selRoom = selection?.type === 'room' && selection.id === rm.sig;
            return (
              <Line key={'floor' + i} points={rm.polygon.flatMap((p) => [p.x * scale, p.y * scale])}
                closed fill={selRoom ? t.roomFillSel : t.roomFill}
                listening={tool === 'select'}
                onMouseDown={startRoomDrag(rm)} onTouchStart={startRoomDrag(rm)} />
            );
          })}

          {/* fences (under walls) */}
          {layers.fences && fences.map((f) => (
            <FenceShape key={f.id} fence={f} scale={scale} palette={t} seg={fenceSegs.get(f.id)} gates={gatesByFence[f.id] || []} selected={selection?.id === f.id || multiSet.has(f.id)}
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
          {/* individually placed posts (draggable along their fence) */}
          {layers.fences && posts.map((p) => {
            const f = fences.find((x) => x.id === p.fenceId);
            return (
              <PostShape key={p.id} post={p} fence={f} scale={scale} palette={t} seg={f ? fenceSegs.get(f.id) : null} selected={selection?.id === p.id}
                onSelect={(e) => {
                  e.cancelBubble = true;
                  if (tool === 'select') { store.select({ type: 'post', id: p.id }); startHandle({ kind: 'post', id: p.id, hostId: p.fenceId })(e); }
                }} />
            );
          })}

          {/* walls */}
          {layers.walls && walls.map((w) => (
            <WallShape key={w.id} wall={w} scale={scale} palette={t} seg={wallSegs.get(w.id)} poly={wallPolys.get(w.id)} selected={selection?.id === w.id || multiSet.has(w.id)}
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
              if (w.noDim) return null; // dimensions hidden for this wall
              const base = w.dimOff ?? dimOffset;
              // an interior partition has no meaningful exterior face — measuring it
              // "exterior" overshoots into the walls it ties into. Dimension it by its
              // location: fall back to the interior (true span) for non-exterior walls.
              const kinds = [...new Set(kindsFor(w.dimMode || dimMode)
                .map((k) => (k === 'exterior' && !w.exterior ? 'interior' : k)))];
              return kinds.map((k) => { // per-wall mode override
                // push the outer (exterior/centerline) row out so it clears the opening string
                const extra = hasOpenings && k !== 'interior' ? ROW_GAP : 0;
                return (
                  <WallDimension key={'dw' + w.id + k} wall={w} kind={k} offset={base + extra} justify={w.justify || wallJustify}
                    centroid={wallCentroid} scale={scale} palette={t} color={t.wallDim} onPillDown={startOffsetDrag(w, 'wall', w.id, extra)} zoom={view.k} />
                );
              });
            })}
            {/* opening dimension strings (wall length split at each opening) */}
            {walls.map((w) => (
              !w.noDim && (w.dimMode || dimMode) !== 'off' && openingsByWall[w.id]?.length
                ? <WallOpeningDims key={'od' + w.id} wall={w} openings={openingsByWall[w.id]} perpOffset={w.openDimOff ?? dimOffset}
                    centroid={wallCentroid} justify={w.justify || wallJustify} scale={scale} palette={t} color={t.wallDim} onPillDown={startOffsetDrag(w, 'wall', w.id, 0, 'openDimOff')} zoom={view.k} />
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

          {/* always-visible gray corner grips on every wall + fence corner
              (the selected element's corners get blue handles on top, below) */}
          {/* each grip's DIAMETER matches its corner's wall thickness, so it reads as
              a round post filling the wall at the corner (min size keeps it tappable) */}
          <Group listening={false}>
            {cornerDots.map((p, i) => {
              if (selectedNodeKeys.has(p.key)) return null; // blue handle covers this corner
              const r = Math.max(coarse ? 4 : 3, p.thick / 2 * scale * view.k); // = wall thickness on screen
              return (
                <Group key={'cd' + i} x={p.x * scale} y={p.y * scale} scaleX={1 / view.k} scaleY={1 / view.k}>
                  <Circle radius={r} fill="#94a3b8" stroke="#fff" strokeWidth={Math.max(1, r * 0.1)} />
                </Group>
              );
            })}
          </Group>

          {/* selected wall/fence endpoint handles — round blue = move the whole
              joined corner; amber diamond (only at shared corners, pulled into
              the segment) = split off and move just this segment */}
          {[[selWall, walls, 'wallEnd'], [selFence, fences, 'fenceEnd']].map(([segEl, list, kind]) => segEl && (() => {
            // size the move + split handles to the wall body so they scale with it,
            // clamped so they're grabbable when zoomed out and not huge when zoomed in
            const thick = kind === 'wallEnd' ? (segEl.thickness || 0.375) : FENCE_THICK;
            const band = thick * scale * view.k; // wall width in screen px
            const rr = Math.max(coarse ? 9 : 6, Math.min(band * 0.5, coarse ? 46 : 40));
            const amberS = Math.max(coarse ? 8 : 6, Math.min(band * 0.42, coarse ? 36 : 30));
            const offScreen = Math.max(coarse ? 34 : 26, band * 1.25); // the "break" sits ~1.25 wall-widths off the corner
            // render the handles on the JUSTIFIED band corner (centered on the wall),
            // but still drag the raw node — matches the gray grips
            const jseg = (kind === 'wallEnd' ? wallSegs : fenceSegs).get(segEl.id);
            // T-extended ends grip the raw connection point (band-center elsewhere)
            const jpt = (e) => (jseg?.[e + 'T'] ? segEl[e] : (jseg?.[e] || segEl[e]));
            return (
              <React.Fragment key={kind}>
                {['a', 'b'].map((end) => (
                  <Group key={end} x={jpt(end).x * scale} y={jpt(end).y * scale} scaleX={1 / view.k} scaleY={1 / view.k}
                    onMouseDown={startHandle({ kind, id: segEl.id, end, origin: { ...segEl[end] } })}
                    onTouchStart={startHandle({ kind, id: segEl.id, end, origin: { ...segEl[end] } })}>
                    <Circle radius={rr} fill="#fff" stroke={BLUE} strokeWidth={Math.max(2, rr * 0.14)} hitStrokeWidth={Math.max(coarse ? 22 : 10, rr)} />
                  </Group>
                ))}
                {['a', 'b'].map((end) => {
                  const pt = segEl[end];
                  const shared = list.some((e) => e.id !== segEl.id && (dist(e.a, pt) < 0.05 || dist(e.b, pt) < 0.05));
                  if (!shared) return null;
                  const other = end === 'a' ? 'b' : 'a';
                  const jp = jpt(end);
                  const L = dist(pt, segEl[other]) || 1;
                  const D = offScreen / view.k; // screen-constant offset into the segment
                  const hx = jp.x * scale + (segEl[other].x - pt.x) / L * D;
                  const hy = jp.y * scale + (segEl[other].y - pt.y) / L * D;
                  const start = startHandle({ kind, id: segEl.id, end, origin: { ...pt }, solo: true });
                  const s = amberS;
                  const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
                  return (
                    <Group key={'sp' + end} x={hx} y={hy} scaleX={1 / view.k} scaleY={1 / view.k} onMouseDown={start} onTouchStart={start} onMouseEnter={setCur('move')} onMouseLeave={setCur('')}>
                      <Line points={[0, -s, s, 0, 0, s, -s, 0]} closed fill="#fff" stroke="#f59e0b" strokeWidth={Math.max(2, s * 0.16)} hitStrokeWidth={Math.max(coarse ? 24 : 12, s)} />
                      <Line points={[-s * 0.4, 0, s * 0.4, 0]} stroke="#f59e0b" strokeWidth={Math.max(1.5, s * 0.12)} listening={false} />
                    </Group>
                  );
                })}
              </React.Fragment>
            );
          })())}

          {/* width-resize handles on a selected door / window / opening or gate —
              drag a jamb to resize (center stays put; snaps to 1/4") */}
          {[[selOpening, 'opening', walls, wallSegs], [selGate, 'gate', fences, fenceSegs]].map(([el, type, hosts, segs]) => el && (() => {
            const hostId = type === 'opening' ? el.wallId : el.fenceId;
            const host = hosts.find((h) => h.id === hostId);
            if (!host) return null;
            const seg = segs.get(host.id);
            const a = seg?.a || host.a, b = seg?.b || host.b;
            const L = dist(a, b) || 1;
            const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
            const center = lerp(a, b, el.t);
            const angDeg = Math.atan2(uy, ux) * 180 / Math.PI;
            const kind = type === 'opening' ? 'openingWidth' : 'gateWidth';
            const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
            return (
              <React.Fragment key={'wz' + el.id}>
                {[-1, 1].map((sgn) => {
                  const ex = (center.x + ux * sgn * el.width / 2) * scale;
                  const ey = (center.y + uy * sgn * el.width / 2) * scale;
                  const start = startHandle({ kind, id: el.id, hostId, center: { ...center } });
                  return (
                    <Group key={sgn} x={ex} y={ey} rotation={angDeg} scaleX={1 / view.k} scaleY={1 / view.k}
                      onMouseDown={start} onTouchStart={start} onMouseEnter={setCur('move')} onMouseLeave={setCur('')}>
                      <Rect x={coarse ? -4 : -3} y={coarse ? -11 : -8} width={coarse ? 8 : 6} height={coarse ? 22 : 16}
                        fill="#fff" stroke={BLUE} strokeWidth={2} cornerRadius={2} hitStrokeWidth={coarse ? 22 : 12} />
                    </Group>
                  );
                })}
              </React.Fragment>
            );
          })())}

          {/* group bounding box — drag it to move every selected element together */}
          {groupBounds && (() => {
            const pad = 6 / view.k;
            const x = groupBounds.minx * scale - pad, y = groupBounds.miny * scale - pad;
            const w = (groupBounds.maxx - groupBounds.minx) * scale + pad * 2, h = (groupBounds.maxy - groupBounds.miny) * scale + pad * 2;
            const setCur = (c) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = c; };
            return (
              <Group>
                <Rect x={x} y={y} width={w} height={h} stroke={BLUE} strokeWidth={1.5 / view.k} dash={[8 / view.k, 5 / view.k]} fill="rgba(37,99,235,0.06)"
                  onMouseDown={startGroupDrag} onTouchStart={startGroupDrag} onMouseEnter={setCur('move')} onMouseLeave={setCur('')} />
              </Group>
            );
          })()}

          {/* rubber-band marquee (zoom = amber, select = blue) */}
          {marquee && (() => {
            const x = Math.min(marquee.x0, marquee.x1) * scale, y = Math.min(marquee.y0, marquee.y1) * scale;
            const w = Math.abs(marquee.x1 - marquee.x0) * scale, h = Math.abs(marquee.y1 - marquee.y0) * scale;
            const zoom = marq.current?.mode === 'zoom' || tool === 'zoom';
            const col = zoom ? '#f59e0b' : BLUE;
            return <Rect x={x} y={y} width={w} height={h} stroke={col} strokeWidth={1.5 / view.k} dash={[6 / view.k, 4 / view.k]}
              fill={zoom ? 'rgba(245,158,11,0.08)' : 'rgba(37,99,235,0.08)'} listening={false} />;
          })()}

          {/* mobile guided draw: rubber band + draggable position pointer */}
          {mDraw && (
            <>
              {mDraw.phase === 'placing' && mDraw.anchor && (
                <Line points={[mDraw.anchor.x * scale, mDraw.anchor.y * scale, mDraw.pointer.x * scale, mDraw.pointer.y * scale]}
                  stroke={tool === 'wall' ? BLUE : TEAL} strokeWidth={2.5 / view.k} dash={[7 / view.k, 5 / view.k]} listening={false} />
              )}
              {mDraw.phase === 'placing' && mDraw.anchor && (
                <Group x={mDraw.anchor.x * scale} y={mDraw.anchor.y * scale} scaleX={1 / view.k} scaleY={1 / view.k} listening={false}>
                  <Circle radius={6} fill={BLUE} stroke="#fff" strokeWidth={2} />
                </Group>
              )}
              <Group x={mDraw.pointer.x * scale} y={mDraw.pointer.y * scale} draggable
                onDragStart={(e) => { e.cancelBubble = true; }}
                onDragMove={(e) => { e.cancelBubble = true; const p = drawPt({ x: e.target.x() / scale, y: e.target.y() / scale }); setMDraw((m) => m && { ...m, pointer: { x: p.x, y: p.y } }); }}>
                <Group scaleX={1 / view.k} scaleY={1 / view.k}>
                  <Circle radius={26} stroke={BLUE} strokeWidth={2} opacity={0.5} />
                  {[[0, -26, 0, -12], [0, 26, 0, 12], [-26, 0, -12, 0], [26, 0, 12, 0]].map((p, i) => (
                    <Line key={i} points={p} stroke={BLUE} strokeWidth={2.5} lineCap="round" />
                  ))}
                  <Circle radius={9} fill={BLUE} stroke="#fff" strokeWidth={2.5} />
                </Group>
              </Group>
            </>
          )}

          {/* room labels: the name (if set) sits above the interior area, as plain
              black text — no pill/border/background. Tap-and-drag the label to
              relocate it; a grip handle appears once the room is selected. The
              area number obeys the Canvas "show room areas" toggle. */}
          {rooms.map((rm, i) => {
            const area = `${Math.round(rm.area)} sq ft`;
            if (!rm.name && !showRoomAreas) return null;
            const W = 240; // generous box so centered text never clips
            const selRoom = selection?.type === 'room' && selection.id === rm.sig;
            const nameY = showRoomAreas ? -19 : -8;
            const hitW = Math.max((rm.name || '').length * 8.5, area.length * 7, 30) + 14;
            const hitTop = (rm.name ? nameY : -8) - 3;
            const hitH = (rm.name && showRoomAreas) ? 42 : 24;
            const gripY = hitTop - 5; // grip sits just above the text
            const dots = []; for (const dy of [-2.2, 2.2]) for (const dx of [-4.4, 0, 4.4]) dots.push({ dx, dy });
            return (
              <Group key={'room' + i} x={rm.labelPos.x * scale} y={rm.labelPos.y * scale} scaleX={1 / view.k} scaleY={1 / view.k}
                listening={tool === 'select'} onMouseDown={startRoomLabelDrag(rm)} onTouchStart={startRoomLabelDrag(rm)}>
                {/* invisible hit area so the whole label is grab-able to drag */}
                <Rect x={-hitW / 2} y={hitTop} width={hitW} height={hitH} fill="rgba(0,0,0,0.001)" />
                {selRoom && (
                  <Group y={gripY}>
                    <Rect x={-11} y={-6.5} width={22} height={13} cornerRadius={6.5} fill={BLUE} />
                    {dots.map((d, k) => <Circle key={k} x={d.dx} y={d.dy} radius={1.1} fill="#fff" listening={false} />)}
                  </Group>
                )}
                {rm.name && (
                  <Text x={-W / 2} y={nameY} width={W} align="center" text={rm.name} fontSize={14} fontStyle="700" fill={t.roomText} listening={false} />
                )}
                {showRoomAreas && (
                  <Text x={-W / 2} y={rm.name ? 2 : -7} width={W} align="center" text={area} fontSize={12} fontStyle="600" fill={t.roomText} listening={false} />
                )}
              </Group>
            );
          })}

          {/* stairs */}
          {layers.stairs && stairs.map((stp) => (
            <StairShape key={stp.id} stair={stp} scale={scale} palette={t} zoom={view.k} selected={selection?.id === stp.id || multiSet.has(stp.id)}
              onSelect={(e) => { e.cancelBubble = true; if (tool === 'select') { store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stair', id: stp.id })(e); } }}
              onWidthDown={(e) => { e.cancelBubble = true; store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stairWidth', id: stp.id })(e); }}
              onRunDown={(e) => { e.cancelBubble = true; store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stairRun', id: stp.id })(e); }}
              onRotateDown={(e) => { e.cancelBubble = true; store.select({ type: 'stair', id: stp.id }); startHandle({ kind: 'stairRotate', id: stp.id })(e); }} />
          ))}

          {/* labels (leader-line callouts) */}
          {layers.labels && labels.map((lb) => (
            <LabelShape key={lb.id} label={lb} scale={scale} zoom={view.k} selected={selection?.id === lb.id || multiSet.has(lb.id)}
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

          {/* touch anchor reticle — after the first tap, a target marker sits on the
              start point so it's obvious where the run is anchored (paired with the
              on-screen coach hint below) */}
          {coarse && draft && ['wall', 'fence', 'room'].includes(tool) && (
            <Group x={draft.x * scale} y={draft.y * scale} scaleX={1 / view.k} scaleY={1 / view.k} listening={false}>
              <Circle radius={18} stroke={TEAL} strokeWidth={1.5} opacity={0.45} />
              <Circle radius={11} stroke={TEAL} strokeWidth={2} />
              {[[0, -18, 0, -7], [0, 18, 0, 7], [-18, 0, -7, 0], [18, 0, 7, 0]].map((p, i) => (
                <Line key={i} points={p} stroke={TEAL} strokeWidth={2} lineCap="round" />
              ))}
              <Circle radius={2.5} fill={TEAL} />
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
          {cursorPx && ['wall', 'fence', 'room'].includes(tool) && (() => {
            // tie-in: landing on another wall's mid-span (T-junction) gets a distinct
            // amber marker + a tick along the host wall, so you know the join was detected
            if (cursor?.onWall && cursor.wallDir) {
              const L = 16, dx = cursor.wallDir.x * L, dy = cursor.wallDir.y * L;
              return (
                <Group listening={false}>
                  <Line points={[cursorPx.x - dx, cursorPx.y - dy, cursorPx.x + dx, cursorPx.y + dy]}
                    stroke="#f59e0b" strokeWidth={3} lineCap="round" />
                  <Circle x={cursorPx.x} y={cursorPx.y} radius={7} stroke="#f59e0b" strokeWidth={2.5}
                    fill="rgba(245,158,11,0.25)" />
                  <Text x={cursorPx.x + 11} y={cursorPx.y - 22} text="tie-in" fontSize={11} fontStyle="bold"
                    fill="#b45309" />
                </Group>
              );
            }
            return (
              <Circle x={cursorPx.x} y={cursorPx.y} radius={cursor?.onNode ? 7 : 4}
                stroke={cursor?.onNode ? t.snapNode : t.snap} strokeWidth={2} fill={cursor?.onNode ? 'rgba(20,184,166,0.2)' : 'transparent'} listening={false} />
            );
          })()}

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
      <div className="scale-readout">grid = {stepLabel} &nbsp;·&nbsp; {Math.round(view.k * 100)}%<span className="sr-pan">&nbsp;·&nbsp; pan: Space-drag / middle-mouse</span></div>

      {/* compact length entry — anchored to the last placed point (stays put
          while you aim, so the ✓ stays clickable/tappable) */}
      {draft && (tool === 'wall' || tool === 'fence') && (() => {
        const p = draft;
        const px = view.x + p.x * scale * view.k;
        const py = Math.max(28, Math.min(size.h - 28, view.y + p.y * scale * view.k));
        const flipLeft = px > size.w - 180; // not enough room on the right → put it on the left
        return (
          <div className="len-entry" style={{ left: px, top: py, right: 'auto', bottom: 'auto', transform: flipLeft ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)' }}>
            <input ref={lenInputRef} type="text" inputMode="decimal" value={lenStr}
              placeholder={cursor ? formatFeetInches(dist(draft, cursor)) : '—'}
              onChange={(e) => setLenStr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTypedLength(); }
                else if (e.key === 'Escape') { e.preventDefault(); finishRun(false); e.currentTarget.blur(); }
              }} />
            <button className="le-finish" onMouseDown={(e) => { e.preventDefault(); finishRun(true); }} title="Finish (Enter on empty, or double-click)">✓ End {tool === 'wall' ? 'wall' : 'fence'}</button>
          </div>
        );
      })()}

      {/* room start prompt */}
      {tool === 'room' && !draft && (
        <div className="draw-hint">{coarse ? 'Tap one corner, then the opposite' : 'Click one corner, then the opposite'}</div>
      )}

      {/* wall/fence drawing toolbar — live thickness + Exit Drawing (magicplan-style) */}
      {(tool === 'wall' || tool === 'fence') && (
        <div className="draw-toolbar">
          {!mDraw && <span className="dt-hint">{draft ? `Drawing ${tool} — click each corner` : `Click to start the ${tool}`}</span>}
          {tool === 'wall' && (() => {
            const inch = store.wallThickness * 12;
            const step = (d) => store.setDefault('wallThickness', Math.max(1, Math.min(24, inch + d)) / 12);
            return (
              <div className="dt-thick">
                <span className="dt-label">Thickness</span>
                <button onClick={() => step(-0.5)} aria-label="Thinner">−</button>
                <span className="dt-val">{Number.isInteger(inch) ? inch : inch.toFixed(1)}″</span>
                <button onClick={() => step(0.5)} aria-label="Thicker">+</button>
              </div>
            );
          })()}
          <button className="dt-exit" onMouseDown={(e) => { e.preventDefault(); finishRun(true); }}>Exit Drawing</button>
        </div>
      )}

      {/* touch coach — once a run is anchored, explain how to continue/finish */}
      {coarse && !mDraw && draft && (tool === 'wall' || tool === 'fence') && (
        <div className="draw-coach">
          <strong>{tool === 'wall' ? 'Wall' : 'Fence'} started</strong>
          Tap the next corner to extend · drag the plan to pan · double-tap to finish
        </div>
      )}

      {/* mobile guided-draw modal */}
      {mDraw && (
        <div className="mdraw-modal">
          {mDraw.phase === 'idle' ? (
            <>
              <div className="md-title">Drag the target to where the {tool} starts</div>
              <div className="md-row">
                <button className="md-primary" onClick={mBegin}>Begin {tool === 'wall' ? 'Wall' : 'Fence'}</button>
                <button className="md-ghost" onMouseDown={(e) => { e.preventDefault(); finishRun(true); }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="md-title">Drag the pointer to the {tool} end · <b>{formatFeetInches(dist(mDraw.anchor, mDraw.pointer))}</b></div>
              <div className="md-row">
                <button className="md-primary" onClick={() => mAddSeg(true)}>Continue {tool}</button>
                <button className="md-ghost" onClick={() => mAddSeg(false)}>End {tool}</button>
              </div>
            </>
          )}
        </div>
      )}

      <FenceLegend fences={fences} />
    </div>
  );
}
