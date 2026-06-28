import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Stage, Layer, Rect, Line, Group, Text, Circle } from 'react-konva';
import { useStore } from '../store.js';
import { dist, formatFeetInches, windowBars, FENCE_TYPES, postsAlong, picketOutline } from '../utils/geometry.js';
import { IconZoomIn, IconZoomOut, IconFit } from './Icons.jsx';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HILITE = '#2563eb';

// A draggable resize handle (module-scope so it isn't remounted every render —
// that was the main source of the elevation-drag lag/jank). `axis`: 'v' locks x,
// 'h' locks y, 'xy' is a free 2D move (onMove gets {x,y}).
function Handle({ cx, cy, axis, lo, hi, loY, hiY, onMove, onStart, onEnd, hs = 9 }) {
  const cursor = axis === 'v' ? 'ns-resize' : axis === 'xy' ? 'move' : 'ew-resize';
  return (
    <Rect x={cx - hs / 2} y={cy - hs / 2} width={hs} height={hs} cornerRadius={2}
      fill="#fff" stroke={HILITE} strokeWidth={1.5} draggable
      onMouseDown={(e) => { e.cancelBubble = true; }}
      onMouseEnter={(e) => { e.target.getStage().container().style.cursor = cursor; }}
      onMouseLeave={(e) => { e.target.getStage().container().style.cursor = 'default'; }}
      dragBoundFunc={(pos) => axis === 'v' ? { x: cx - hs / 2, y: clamp(pos.y, lo, hi) }
        : axis === 'xy' ? { x: clamp(pos.x, lo, hi), y: clamp(pos.y, loY, hiY) }
        : { x: clamp(pos.x, lo, hi), y: cy - hs / 2 }}
      onDragStart={onStart}
      onDragMove={(e) => axis === 'xy' ? onMove({ x: e.target.x() + hs / 2, y: e.target.y() + hs / 2 })
        : onMove(axis === 'v' ? e.target.y() + hs / 2 : e.target.x() + hs / 2)}
      onDragEnd={onEnd} />
  );
}

// A small architectural dimension (witness lines + ticks + label) between two
// points along one axis. `dir` 'h' = horizontal dim, 'v' = vertical dim.
function DimMark({ dir, a, b, lvl, label, color }) {
  const t = 3, parts = [];
  if (dir === 'h') { // a,b are x; lvl is the dim-line y; witnessFrom is the element edge y
    parts.push(<Line key="l" points={[a, lvl, b, lvl]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Line key="ta" points={[a, lvl - t, a, lvl + t]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Line key="tb" points={[b, lvl - t, b, lvl + t]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Text key="x" x={(a + b) / 2 - 45} y={lvl - 16} width={90} align="center" text={label} fontSize={13.5} fontStyle="700" fill={color} listening={false} />);
  } else {
    parts.push(<Line key="l" points={[lvl, a, lvl, b]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Line key="ta" points={[lvl - t, a, lvl + t, a]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Line key="tb" points={[lvl - t, b, lvl + t, b]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Text key="x" x={lvl + 5} y={(a + b) / 2 - 7} text={label} fontSize={13.5} fontStyle="700" fill={color} listening={false} />);
  }
  return <Group listening={false}>{parts}</Group>;
}

// Front-view (orthographic) editor for a single wall or fence run.
export default function ElevationCanvas() {
  const target = useStore((s) => s.elevationTarget);
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const fences = useStore((s) => s.fences);
  const gates = useStore((s) => s.gates);
  const posts = useStore((s) => s.posts);
  const selection = useStore((s) => s.selection);
  const update = useStore((s) => s.updateElement);
  const select = useStore((s) => s.select);
  const deleteElement = useStore((s) => s.deleteElement);
  const addPost = useStore((s) => s.addPost);
  const spacePostsEvenly = useStore((s) => s.spacePostsEvenly);
  const close = useStore((s) => s.closeElevation);
  const stepElevation = useStore((s) => s.stepElevation);
  const theme = useStore((s) => s.theme);

  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const node = wrapRef.current; if (!node) return;
    const ro = new ResizeObserver(() => setSize({ w: node.clientWidth, h: node.clientHeight }));
    ro.observe(node); setSize({ w: node.clientWidth, h: node.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- rAF-throttled store writes: coalesce many mousemoves into one update/frame ----
  const rafId = useRef(0);
  const pending = useRef(null);
  const dragRef = useRef({ before: null });
  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current); }, []);
  const flush = () => {
    rafId.current = 0;
    const p = pending.current; pending.current = null;
    if (p) update(p.type, p.id, p.patch);
  };
  const queueUpdate = (type, id, patch) => {
    pending.current = pending.current && pending.current.id === id
      ? { type, id, patch: { ...pending.current.patch, ...patch } }
      : { type, id, patch };
    if (!rafId.current) rafId.current = requestAnimationFrame(flush);
  };
  const onStart = () => { dragRef.current = { before: useStore.getState().snapshotGeom() }; };
  const onEnd = () => {
    if (rafId.current) { cancelAnimationFrame(rafId.current); flush(); }
    if (dragRef.current.before) useStore.getState().pushPast(dragRef.current.before);
    dragRef.current = { before: null };
  };

  const C = useMemo(() => theme === 'dark'
    ? { bg: '#0b1220', grid: '#1b2740', body: '#16202f', line: '#9fb1c6', dim: '#8aa0b8', glass: '#13314d', glass2: '#1c4063', mask: '#0b1220', frame: '#2a3b52', panel: '#1b2a3d' }
    : { bg: '#f6f8fb', grid: '#e6ecf3', body: '#ffffff', line: '#0a2540', dim: '#5b7088', glass: '#eaf2fb', glass2: '#dbeafe', mask: '#f6f8fb', frame: '#ffffff', panel: '#eef2f7' }, [theme]);

  const isWall = target?.type === 'wall';
  const el = isWall ? walls.find((w) => w.id === target?.id) : fences.find((f) => f.id === target?.id);
  useEffect(() => { if (target && !el) close(); }, [target, el, close]);

  // ----- view (zoom/pan): fit by default, scroll to zoom, drag bg to pan -----
  const L = el ? dist(el.a, el.b) : 0;
  const Hgt = el ? (el.height || (isWall ? 8 : 6)) : 8;
  const padX = 70, padTop = 64, padBot = 120;
  const fit = useMemo(() => {
    const availH = size.h - padTop - padBot;
    const fk = Math.max(5, Math.min((size.w - padX * 2) / Math.max(L, 1), availH / Math.max(Hgt, 1)));
    return { k: fk, ox: (size.w - L * fk) / 2, oy: padTop + (availH + Hgt * fk) / 2 };
  }, [size.w, size.h, L, Hgt]);
  const [view, setView] = useState(fit);
  const fitKey = `${target?.type}:${target?.id}|${Math.round(size.w)}x${Math.round(size.h)}`;
  const lastFit = useRef('');
  useEffect(() => { if (lastFit.current !== fitKey) { lastFit.current = fitKey; setView(fit); } }, [fitKey, fit]);
  const panRef = useRef(null);
  if (!target || !el) return null;

  const k = view.k, originX = view.ox, groundY = view.oy;
  const X = (xft) => originX + xft * k;
  const Y = (yft) => groundY - yft * k;
  const minH = isWall ? 4 : 2;
  const items = isWall ? openings.filter((o) => o.wallId === el.id) : gates.filter((g) => g.fenceId === el.id);
  const selectTarget = () => select({ type: target.type, id: target.id });

  const ZMIN = 3, ZMAX = 160;
  const onWheel = (e) => {
    e.evt.preventDefault();
    const ptr = e.target.getStage().getPointerPosition(); if (!ptr) return;
    const k0 = view.k, k1 = Math.max(ZMIN, Math.min(ZMAX, k0 * (e.evt.deltaY < 0 ? 1.12 : 1 / 1.12)));
    const r = k1 / k0;
    setView({ k: k1, ox: ptr.x - (ptr.x - view.ox) * r, oy: ptr.y + (view.oy - ptr.y) * r });
  };
  const zoomCenter = (f) => setView((v) => { const cx = size.w / 2, cy = size.h / 2, k1 = Math.max(ZMIN, Math.min(ZMAX, v.k * f)), r = k1 / v.k; return { k: k1, ox: cx - (cx - v.ox) * r, oy: cy + (v.oy - cy) * r }; });
  const onBgDown = (e) => { if (e.target === e.target.getStage()) panRef.current = { sx: e.evt.clientX, sy: e.evt.clientY, ox: view.ox, oy: view.oy, moved: false }; };
  const onBgMove = (e) => {
    if (!panRef.current) return;
    const dx = e.evt.clientX - panRef.current.sx, dy = e.evt.clientY - panRef.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) panRef.current.moved = true;
    setView((v) => ({ ...v, ox: panRef.current.ox + dx, oy: panRef.current.oy + dy }));
  };
  const onBgUp = () => { if (panRef.current) { if (!panRef.current.moved) selectTarget(); panRef.current = null; } };

  // foot grid + a faint vertical-centre reference line (align windows to it)
  const grid = [];
  for (let ft = 1; ft <= Math.ceil(Hgt) + 1; ft++) {
    grid.push(<Line key={'g' + ft} points={[X(-0.5), Y(ft), X(L + 0.5), Y(ft)]} stroke={C.grid} strokeWidth={1} strokeScaleEnabled={false} listening={false} />);
  }
  if (isWall) grid.push(<Line key="centre" points={[X(0), Y(Hgt / 2), X(L), Y(Hgt / 2)]} stroke={C.dim} strokeWidth={0.8} dash={[6, 6]} opacity={0.35} strokeScaleEnabled={false} listening={false} />);

  const body = isWall
    ? <Rect x={X(0)} y={Y(Hgt)} width={L * k} height={Hgt * k} fill={C.body} stroke={C.line} strokeWidth={1.5} strokeScaleEnabled={false} cornerRadius={1}
        onMouseDown={(e) => { e.cancelBubble = true; selectTarget(); }} />
    : <FenceBody fence={el} L={L} Hgt={Hgt} originX={originX} k={k} groundY={groundY} C={C} />;

  const drawItem = (it) => {
    const type = isWall ? 'opening' : 'gate';
    const center = it.t * L, w = it.width;
    const left = center - w / 2, right = center + w / 2;
    const bottom = isWall && it.type === 'window' ? (it.sill ?? 3) : 0;
    const top = isWall ? bottom + it.height : (it.height ?? Hgt);
    const h = top - bottom;
    const cyPx = Y((bottom + top) / 2);
    const halfW = w * k / 2, halfH = h * k / 2;
    const sel = selection?.id === it.id;
    const isWin = isWall && it.type === 'window';
    const moveItem = (px) => queueUpdate(type, it.id, { t: clamp((px - originX) / k / L, 0, 1) });
    const setWidth = (px) => queueUpdate(type, it.id, { width: clamp(Math.abs((px - originX) / k - center) * 2, 0.5, L) });
    // free 2D move for windows (drag anywhere); snaps to the wall's vertical centre
    const moveFree = ({ x, y }) => {
      const t = clamp((x - originX) / k / L, 0, 1);
      let sill = clamp((groundY - y) / k - h / 2, 0, Hgt - h);
      if (Math.abs(sill + h / 2 - Hgt / 2) < 0.3) sill = Hgt / 2 - h / 2; // vertical-centre snap
      queueUpdate('opening', it.id, { t, sill });
    };
    return (
      <Group key={it.id}>
        <OpeningSymbol it={it} isWall={isWall} left={left} right={right} bottom={bottom} top={top} originX={originX} k={k} groundY={groundY} C={C} />
        <Rect x={X(left)} y={Y(top)} width={w * k} height={h * k} fill="transparent"
          onMouseDown={(e) => { e.cancelBubble = true; select({ type, id: it.id }); }} />
        {sel && <Rect x={X(left) - 2} y={Y(top) - 2} width={w * k + 4} height={h * k + 4} stroke={HILITE} strokeWidth={1.5} dash={[5, 4]} strokeScaleEnabled={false} listening={false} />}

        {/* width dim above + witness lines from the head */}
        <Line points={[X(left), Y(top), X(left), Y(top) - 17]} stroke={C.dim} strokeWidth={0.45} strokeScaleEnabled={false} listening={false} />
        <Line points={[X(right), Y(top), X(right), Y(top) - 17]} stroke={C.dim} strokeWidth={0.45} strokeScaleEnabled={false} listening={false} />
        <DimMark dir="h" a={X(left)} b={X(right)} lvl={Y(top) - 14} label={formatFeetInches(w)} color={C.dim} />
        {/* height dim to the right + witness lines from the jamb */}
        <Line points={[X(right), Y(top), X(right) + 17, Y(top)]} stroke={C.dim} strokeWidth={0.45} strokeScaleEnabled={false} listening={false} />
        <Line points={[X(right), Y(bottom), X(right) + 17, Y(bottom)]} stroke={C.dim} strokeWidth={0.45} strokeScaleEnabled={false} listening={false} />
        <DimMark dir="v" a={Y(top)} b={Y(bottom)} lvl={X(right) + 14} label={formatFeetInches(h)} color={C.dim} />
        {/* window sill dim on the left (head-to-floor implied by sill + height) */}
        {isWin && bottom > 0 && (
          <>
            <Line points={[X(left), Y(bottom), X(left) - 17, Y(bottom)]} stroke={C.dim} strokeWidth={0.45} strokeScaleEnabled={false} listening={false} />
            <Line points={[X(left), Y(0), X(left) - 17, Y(0)]} stroke={C.dim} strokeWidth={0.45} strokeScaleEnabled={false} opacity={0.6} listening={false} />
            <DimMark dir="v" a={Y(bottom)} b={Y(0)} lvl={X(left) - 14} label={formatFeetInches(bottom)} color={C.dim} />
          </>
        )}

        {/* handles — windows get a free 2D move (incl. vertical), others horizontal */}
        {isWin
          ? <Handle cx={X(center)} cy={cyPx} axis="xy" lo={X(0) + halfW} hi={X(L) - halfW} loY={Y(Hgt - h / 2)} hiY={Y(h / 2)} onMove={moveFree} onStart={onStart} onEnd={onEnd} />
          : <Handle cx={X(center)} cy={cyPx} axis="h" lo={X(0) + halfW} hi={X(L) - halfW} onMove={moveItem} onStart={onStart} onEnd={onEnd} />}
        <Handle cx={X(left)} cy={cyPx} axis="h" lo={X(0)} hi={X(center) - 2} onMove={setWidth} onStart={onStart} onEnd={onEnd} />
        <Handle cx={X(right)} cy={cyPx} axis="h" lo={X(center) + 2} hi={X(L)} onMove={setWidth} onStart={onStart} onEnd={onEnd} />
        <Handle cx={X(center)} cy={Y(top)} axis="v" lo={Y(isWall ? Hgt : 24)} hi={Y(bottom) - 6} onStart={onStart} onEnd={onEnd}
          onMove={(py) => queueUpdate(type, it.id, { height: clamp((groundY - py) / k - bottom, 0.5, isWall ? Hgt - bottom : 24) })} />
        {isWin && (
          <Handle cx={X(center)} cy={Y(bottom)} axis="v" lo={Y(top) + 6} hi={Y(0)} onStart={onStart} onEnd={onEnd}
            onMove={(py) => { const s2 = clamp((groundY - py) / k, 0, top - 0.5); queueUpdate('opening', it.id, { sill: s2, height: top - s2 }); }} />
        )}
      </Group>
    );
  };

  // ----- dimension strings below the ground: overall width + a distance string
  // broken at every opening/gate edge (and fence-post position) -----
  const dims = [];
  const segY = groundY + 28, ovY = groundY + 58, tick = 5;
  const edges = new Set([0, L]);
  items.forEach((it) => { const cc = it.t * L, w = it.width; edges.add(clamp(cc - w / 2, 0, L)); edges.add(clamp(cc + w / 2, 0, L)); });
  if (!isWall) postsAlong({ x: 0, y: 0 }, { x: L, y: 0 }, el.postSpacing || 8).forEach((p) => edges.add(+p.x.toFixed(2)));
  const stations = [...edges].map((v) => +v.toFixed(2)).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.05);
  // witness lines at the run ends
  [0, L].forEach((s) => dims.push(<Line key={'wt' + s} points={[X(s), groundY, X(s), ovY + tick]} stroke={C.dim} strokeWidth={0.6} strokeScaleEnabled={false} opacity={0.5} listening={false} />));
  // distance string
  dims.push(<Line key="segL" points={[X(0), segY, X(L), segY]} stroke={C.dim} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />);
  stations.forEach((s) => dims.push(<Line key={'st' + s} points={[X(s), segY - tick, X(s), segY + tick]} stroke={C.dim} strokeWidth={0.6} strokeScaleEnabled={false} listening={false} />));
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i], s1 = stations[i + 1]; if (s1 - s0 < 0.05) continue;
    dims.push(<Text key={'sl' + i} x={X((s0 + s1) / 2) - 40} y={segY - 16} width={80} align="center" text={formatFeetInches(s1 - s0)} fontSize={12} fontStyle="600" fill={C.dim} listening={false} />);
  }
  // overall width
  dims.push(<Line key="ovL" points={[X(0), ovY, X(L), ovY]} stroke={C.dim} strokeWidth={0.9} strokeScaleEnabled={false} listening={false} />);
  [0, L].forEach((s) => dims.push(<Line key={'ot' + s} points={[X(s), ovY - tick, X(s), ovY + tick]} stroke={C.dim} strokeWidth={0.9} strokeScaleEnabled={false} listening={false} />));
  dims.push(<Text key="ovT" x={X(L / 2) - 50} y={ovY + 4} width={100} align="center" text={formatFeetInches(L)} fontSize={14} fontStyle="700" fill={C.dim} listening={false} />);

  // individually-placed posts on this fence — draggable horizontally to reposition
  const fencePosts = isWall ? [] : posts.filter((p) => p.fenceId === el.id);
  const moveArrows = [[0, -6, 0, 6], [-6, 0, 6, 0], [0, -6, -2.2, -3.4], [0, -6, 2.2, -3.4], [0, 6, -2.2, 3.4], [0, 6, 2.2, 3.4], [-6, 0, -3.4, -2.2], [-6, 0, -3.4, 2.2], [6, 0, 3.4, -2.2], [6, 0, 3.4, 2.2]];
  const drawPost = (p) => {
    const seld = selection?.type === 'post' && selection.id === p.id;
    const ph = Math.min(Hgt, p.height || Hgt);
    const pwpx = Math.max(4, 0.4 * k); // ~0.4 ft post body
    const cx = X(p.t * L);
    const setCur = (cur) => (e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = cur; };
    return (
      <React.Fragment key={p.id}>
        <Rect x={cx - pwpx / 2} y={Y(ph)} width={pwpx} height={ph * k}
          fill={p.color || C.line} stroke={seld ? HILITE : C.line} strokeWidth={seld ? 2 : 1} strokeScaleEnabled={false}
          cornerRadius={1} draggable
          onMouseDown={(e) => { e.cancelBubble = true; select({ type: 'post', id: p.id }); onStart(); }}
          dragBoundFunc={(pos) => ({ x: clamp(pos.x, X(0) - pwpx / 2, X(L) - pwpx / 2), y: Y(ph) })}
          onDragMove={(e) => { const center = (e.target.x() + pwpx / 2 - originX) / k; queueUpdate('post', p.id, { t: clamp(center / L, 0, 1) }); }}
          onDragEnd={onEnd} />
        {seld && (
          <>
            {/* move handle: drag to slide the post along the run */}
            <Group x={cx} y={Y(ph) - 16} draggable onMouseDown={(e) => { e.cancelBubble = true; onStart(); }}
              dragBoundFunc={(pos) => ({ x: clamp(pos.x, X(0), X(L)), y: Y(ph) - 16 })}
              onDragMove={(e) => queueUpdate('post', p.id, { t: clamp((e.target.x() - originX) / k / L, 0, 1) })}
              onDragEnd={onEnd} onMouseEnter={setCur('move')} onMouseLeave={setCur('')}>
              <Circle radius={11} fill={HILITE} stroke="#fff" strokeWidth={2} />
              {moveArrows.map((pt, i) => <Line key={i} points={pt} stroke="#fff" strokeWidth={1.6} lineCap="round" listening={false} />)}
            </Group>
            {/* delete ✕ */}
            <Group x={cx + 22} y={Y(ph) - 16} onMouseDown={(e) => { e.cancelBubble = true; deleteElement('post', p.id); }} onMouseEnter={setCur('pointer')} onMouseLeave={setCur('')}>
              <Circle radius={10} fill="#ef4444" stroke="#fff" strokeWidth={2} />
              <Line points={[-3.5, -3.5, 3.5, 3.5]} stroke="#fff" strokeWidth={2} lineCap="round" listening={false} />
              <Line points={[-3.5, 3.5, 3.5, -3.5]} stroke="#fff" strokeWidth={2} lineCap="round" listening={false} />
            </Group>
          </>
        )}
      </React.Fragment>
    );
  };

  const heightHandle = (
    <Group>
      <Line points={[X(0), Y(Hgt), X(L), Y(Hgt)]} stroke={HILITE} strokeWidth={2} strokeScaleEnabled={false} opacity={0.5} listening={false} />
      <Handle cx={X(L) + 16} cy={Y(Hgt)} axis="v" lo={Y(24)} hi={Y(minH)} onStart={onStart} onEnd={onEnd}
        onMove={(py) => queueUpdate(target.type, target.id, { height: clamp((groundY - py) / k, minH, 24) })} />
      <Text x={X(L) + 26} y={Y(Hgt) - 9} text={formatFeetInches(Hgt)} fontSize={16} fontStyle="700" fill={C.dim} listening={false} />
    </Group>
  );

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: C.bg }}>
      <Stage width={size.w} height={size.h} onWheel={onWheel} onMouseDown={onBgDown} onMouseMove={onBgMove} onMouseUp={onBgUp}>
        <Layer>
          {grid}
          <Line points={[X(-1), groundY, X(L + 1), groundY]} stroke={C.line} strokeWidth={2} strokeScaleEnabled={false} listening={false} />
          {body}
          {items.map(drawItem)}
          {fencePosts.map(drawPost)}
          {dims}
          {heightHandle}
        </Layer>
      </Stage>

      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
        <button onClick={close} style={btn} title="Back to plan (Esc)">‹ Plan</button>
        <div style={{ ...chip, pointerEvents: 'auto' }}>
          <b>{isWall ? 'Wall' : 'Fence'} elevation</b>
          <span style={{ opacity: 0.7, marginLeft: 8 }}>{formatFeetInches(L)} × {formatFeetInches(Hgt)}{!isWall ? ` · ${(FENCE_TYPES[el.fenceType] || {}).label || ''}` : ''}</span>
        </div>
        <div style={{ flex: 1 }} />
        {!isWall && <button onClick={() => { const id = addPost(el.id, 0.5); if (id) select({ type: 'post', id }); }} style={btn} title="Add a post at the center (then drag it)">+ Post</button>}
        {!isWall && fencePosts.length > 1 && <button onClick={() => spacePostsEvenly(el.id)} style={btn} title="Space the placed posts evenly">Even posts</button>}
        <button onClick={() => stepElevation(-1)} style={btn} title="Previous">‹</button>
        <button onClick={() => stepElevation(1)} style={btn} title="Next">›</button>
      </div>
      {/* zoom controls */}
      <div className="float-controls">
        <button className="icon-btn" title="Zoom in" onClick={() => zoomCenter(1.25)}><IconZoomIn /></button>
        <button className="icon-btn" title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><IconZoomOut /></button>
        <button className="icon-btn" title="Fit" onClick={() => setView(fit)}><IconFit /></button>
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', ...chip, fontSize: 12 }}>
        Click a component to edit · drag <b>handles</b> to resize · scroll to zoom · drag background to pan
      </div>
    </div>
  );
}

const btn = {
  pointerEvents: 'auto', height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--slate-100)',
  background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow)',
};
const chip = {
  background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--slate-100)', borderRadius: 8,
  padding: '6px 12px', fontSize: 13, boxShadow: 'var(--shadow)',
};

// ---- front-view symbol for one opening (wall) or gate (fence) — memoized so it
// only redraws when its own element changes (not on every sibling drag) ----
const OpeningSymbol = React.memo(function OpeningSymbol({ it, isWall, left, right, bottom, top, originX, k, groundY, C }) {
  const X = (xft) => originX + xft * k, Y = (yft) => groundY - yft * k;
  const x = X(left), y = Y(top), w = (right - left) * k, h = (top - bottom) * k;
  if (w < 1 || h < 1) return null;
  const accent = isWall ? (it.type === 'door' ? '#8a5a32' : '#2563eb') : (it.color || (FENCE_TYPES[it.material] || {}).color || '#6b7785');
  const parts = [<Rect key="mask" x={x} y={y} width={w} height={h} fill={C.mask} listening={false} />];

  if (isWall && it.type === 'window') {
    const fw = Math.max(2.5, Math.min(7, w * 0.12, h * 0.12)); // frame width (px)
    const gx = x + fw, gy = y + fw, gw = w - 2 * fw, gh = h - 2 * fw;
    // outer frame
    parts.push(<Rect key="of" x={x} y={y} width={w} height={h} fill={C.frame} stroke={accent} strokeWidth={1.6} cornerRadius={1} strokeScaleEnabled={false} listening={false} />);
    // glazing with a soft diagonal sheen (two stops faked by a lighter triangle)
    parts.push(<Rect key="g" x={gx} y={gy} width={gw} height={gh} fill={C.glass} stroke={accent} strokeWidth={0.8} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Line key="sheen" points={[gx, gy + gh * 0.55, gx + gw * 0.5, gy, gx + gw, gy, gx + gw, gy + gh * 0.18, gx, gy + gh * 0.85]} closed fill={C.glass2} opacity={0.45} listening={false} />);
    // muntins / mullions mapped into the glazed area
    const { V, H } = windowBars(it.style, it.grid);
    V.forEach((b, i) => parts.push(<Line key={'v' + i} points={[gx + b.at * gw, gy, gx + b.at * gw, gy + gh]} stroke={accent} strokeWidth={b.major ? 1.6 : 0.8} strokeScaleEnabled={false} listening={false} />));
    H.forEach((b, i) => parts.push(<Line key={'h' + i} points={[gx, gy + b.at * gh, gx + gw, gy + b.at * gh]} stroke={accent} strokeWidth={b.major ? 1.6 : 0.8} strokeScaleEnabled={false} listening={false} />));
    // projecting sill ledge under the window
    parts.push(<Rect key="sill" x={x - 3} y={y + h - 1} width={w + 6} height={3.5} fill={C.frame} stroke={accent} strokeWidth={1} cornerRadius={0.5} strokeScaleEnabled={false} listening={false} />);
  } else if (isWall && it.type === 'door') {
    // slab + frame
    parts.push(<Rect key="d" x={x} y={y} width={w} height={h} fill={C.frame} stroke={accent} strokeWidth={1.6} strokeScaleEnabled={false} listening={false} />);
    const m = Math.max(3, Math.min(8, w * 0.16)); // stile/rail margin
    const rail = Math.max(3, h * 0.07);
    const innerW = w - 2 * m, splitY = y + rail + (h - 2 * rail) * 0.42;
    // two raised panels (top smaller, bottom larger) with a bevel inset
    const panel = (py, ph, key) => {
      parts.push(<Rect key={key} x={x + m} y={py} width={innerW} height={ph} fill={C.panel} stroke={accent} strokeWidth={1} strokeScaleEnabled={false} listening={false} />);
      parts.push(<Rect key={key + 'b'} x={x + m + 3} y={py + 3} width={innerW - 6} height={ph - 6} stroke={accent} strokeWidth={0.6} opacity={0.6} strokeScaleEnabled={false} listening={false} />);
    };
    panel(y + rail, splitY - (y + rail) - rail / 2, 'pt');
    panel(splitY + rail / 2, (y + h - rail) - (splitY + rail / 2), 'pb');
    // lever handle + rosette on the latch side
    const lat = (it.hinge || 'left') === 'left' ? x + w - m - 1 : x + m + 1;
    const dir = (it.hinge || 'left') === 'left' ? -1 : 1;
    parts.push(<Circle key="ros" x={lat} y={y + h * 0.52} radius={2.2} fill={accent} listening={false} />);
    parts.push(<Line key="lev" points={[lat, y + h * 0.52, lat + dir * 7, y + h * 0.52]} stroke={accent} strokeWidth={2} lineCap="round" listening={false} />);
  } else if (isWall) {
    parts.push(<Rect key="o" x={x} y={y} width={w} height={h} stroke={accent} strokeWidth={1.2} dash={[5, 4]} strokeScaleEnabled={false} listening={false} />);
  } else {
    parts.push(<Rect key="gt" x={x} y={y} width={w} height={h} fill={accent} opacity={0.92} stroke={C.line} strokeWidth={1} strokeScaleEnabled={false} listening={false} />);
    parts.push(<Line key="br" points={[x, y + h, x + w, y]} stroke={C.line} strokeWidth={1} strokeScaleEnabled={false} opacity={0.5} listening={false} />);
  }
  return <Group listening={false}>{parts}</Group>;
});

// ---- front-view of a fence run: posts + style-aware infill (memoized) ----
const FenceBody = React.memo(function FenceBody({ fence, L, Hgt, originX, k, groundY, C }) {
  const X = (xft) => originX + xft * k, Y = (yft) => groundY - yft * k;
  const ft = FENCE_TYPES[fence.fenceType] || FENCE_TYPES.wood;
  const col = fence.color || ft.color;
  const parts = [];
  const y0 = Y(Hgt), hpx = Hgt * k;

  if (ft.style === 'pickets') {
    const slim = ft.slim;
    const pw = slim ? 0.08 : 0.4, step = slim ? 0.42 : 0.55;
    for (let xf = step / 2; xf < L; xf += step) {
      const out = picketOutline(fence.cap || ft.cap || 'dogear', pw, Hgt).map(([px, py]) => `${X(xf + px).toFixed(1)},${Y(py).toFixed(1)}`).join(' ');
      parts.push(<Line key={'pk' + xf} points={out.split(/[ ,]/).map(Number)} closed fill={col} stroke={C.line} strokeWidth={0.4} strokeScaleEnabled={false} listening={false} />);
    }
    [Hgt * 0.85, Hgt * 0.2].forEach((ry, i) => parts.push(<Rect key={'r' + i} x={X(0)} y={Y(ry) - 2} width={L * k} height={4} fill={col} listening={false} />));
  } else if (ft.style === 'rail') {
    for (let i = 0; i < (ft.rails || 3); i++) parts.push(<Rect key={'r' + i} x={X(0)} y={Y(Hgt * ((i + 0.6) / (ft.rails || 3))) - 3} width={L * k} height={6} cornerRadius={2} fill={col} listening={false} />);
  } else if (ft.style === 'mesh') {
    parts.push(<Rect key="bg" x={X(0)} y={y0} width={L * k} height={hpx} fill={col} opacity={0.18} listening={false} />);
    for (let d = -hpx; d < L * k; d += 10) {
      parts.push(<Line key={'a' + d} points={[X(0) + d, y0 + hpx, X(0) + d + hpx, y0]} stroke={col} strokeWidth={0.6} strokeScaleEnabled={false} opacity={0.6} listening={false} />);
      parts.push(<Line key={'b' + d} points={[X(0) + d, y0, X(0) + d + hpx, y0 + hpx]} stroke={col} strokeWidth={0.6} strokeScaleEnabled={false} opacity={0.6} listening={false} />);
    }
    parts.push(<Rect key="tr" x={X(0)} y={y0 - 2} width={L * k} height={4} fill={col} listening={false} />);
  } else if (ft.style === 'slat') {
    const gap = ft.tight ? 0.06 : 0.18, sh = 0.5, st = sh + gap;
    for (let yf = sh / 2; yf < Hgt; yf += st) parts.push(<Rect key={'s' + yf} x={X(0)} y={Y(yf + sh / 2)} width={L * k} height={sh * k} fill={col} listening={false} />);
  } else {
    parts.push(<Rect key="bd" x={X(0)} y={y0} width={L * k} height={hpx} fill={col} listening={false} />);
    for (let xf = 0.5; xf < L; xf += 0.5) parts.push(<Line key={'sm' + xf} points={[X(xf), y0, X(xf), y0 + hpx]} stroke="rgba(0,0,0,0.18)" strokeWidth={0.5} strokeScaleEnabled={false} listening={false} />);
  }
  const postTopY = Y(fence.postHeight ?? (Hgt + 0.2));
  const pwPx = Math.max(3, (fence.postSize ?? 0.3) * k);
  postsAlong({ x: 0, y: 0 }, { x: L, y: 0 }, fence.postSpacing || 8).forEach((p, i) => {
    parts.push(<Rect key={'po' + i} x={X(p.x) - pwPx / 2} y={postTopY} width={pwPx} height={Y(0) - postTopY} fill="#475569" listening={false} />);
  });
  return <Group listening={false}>{parts}</Group>;
});

