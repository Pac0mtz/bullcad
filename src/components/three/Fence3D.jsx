import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { dist, angleOf, postsAlong, FENCE_TYPES, picketOutline } from '../../utils/geometry.js';

const HILITE = '#2563eb';
const GALV = '#8a949f';   // galvanized rail / frame
const GALV_DK = '#5b6570'; // post / darker tube

// Procedural chain-link fabric: a tileable diamond lattice drawn to a canvas and
// used as a cut-out (alpha) texture so the fence reads as see-through mesh.
function makeChainTexture(wire) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = wire;
  g.lineCap = 'round';
  g.lineWidth = 5;
  // one diamond cell joining the four edge midpoints; tiling yields a mesh of
  // diamonds touching at their corners (classic chain-link weave).
  g.beginPath();
  g.moveTo(0, S / 2); g.lineTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.lineTo(0, S / 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// A chain-link fabric plane sized w x h (ft). Memoizes its own texture and sets
// the repeat so diamonds stay a realistic ~2.7" across regardless of panel size.
function ChainLinkFabric({ w, h, wire = '#aeb6bf', sel }) {
  const tex = useMemo(() => {
    const t = makeChainTexture(wire);
    t.repeat.set(Math.max(1, Math.round(w / 0.28)), Math.max(1, Math.round(h / 0.28)));
    return t;
  }, [w, h, wire]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.4} side={THREE.DoubleSide}
        metalness={0.55} roughness={0.45} color={sel ? HILITE : '#dfe3e9'}
        emissive={sel ? HILITE : '#000000'} emissiveIntensity={sel ? 0.35 : 0} />
    </mesh>
  );
}

// Barbed-wire top for chain-link: a 45° support arm at each end and three strands
// tilted outward above the top rail. Local origin sits at the rail (x=0..centered).
function BarbedTop({ w, y, color = GALV }) {
  const strands = [0.16, 0.3, 0.44];
  return (
    <group position={[0, y, 0]}>
      {[-w / 2 + 0.08, w / 2 - 0.08].map((ax, i) => (
        <mesh key={i} position={[ax, 0.26, 0.13]} rotation={[-0.62, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.58, 6]} />
          <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {strands.map((dy, i) => (
        <Tube key={i} y={dy} z={0.05 + i * 0.07} len={w} r={0.016} axis="x" color="#7a838d" cast={false} />
      ))}
    </group>
  );
}

// A single picket extruded from its front silhouette so the top profile (dog-ear,
// gothic, point, flat…) actually reads in 3D. Stands in x-y, thickness along z.
function Picket({ x, w, h, cap = 'dogear', color, metal = false, depth = 0.07, sel = false }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    picketOutline(cap, w, h).forEach(([px, py], i) => (i ? shape.lineTo(px, py) : shape.moveTo(px, py)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [cap, w, h, depth]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={[x, 0, 0]} geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={sel ? HILITE : color} metalness={metal ? 0.6 : 0.05} roughness={metal ? 0.4 : 0.82}
        emissive={sel ? HILITE : '#000000'} emissiveIntensity={sel ? 0.5 : 0} />
    </mesh>
  );
}

// Decorative cap on top of a square post. `top` is the post's top Y, `size` the
// post width. flat/bevel/pyramid/ball/gothic/acorn.
function PostCap({ cap = 'flat', top, size: s, color }) {
  const mat = <meshStandardMaterial color={color} roughness={cap === 'ball' || cap === 'acorn' ? 0.5 : 0.7} metalness={cap === 'ball' ? 0.1 : 0} />;
  const r = s * 0.62;
  if (cap === 'bevel') return <mesh position={[0, top + s * 0.18, 0]} castShadow><cylinderGeometry args={[s * 0.34, s * 0.7, s * 0.36, 4]} />{mat}</mesh>;
  if (cap === 'pyramid') return <mesh position={[0, top + s * 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[s * 0.72, s * 0.6, 4]} />{mat}</mesh>;
  if (cap === 'ball') return <mesh position={[0, top + r, 0]} castShadow><sphereGeometry args={[r, 16, 12]} />{mat}</mesh>;
  if (cap === 'gothic') return <mesh position={[0, top + s * 0.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[s * 0.6, s * 1.1, 4]} />{mat}</mesh>;
  if (cap === 'acorn') return (
    <group position={[0, top, 0]}>
      <mesh position={[0, r * 0.85, 0]} castShadow><sphereGeometry args={[r, 16, 12]} />{mat}</mesh>
      <mesh position={[0, r * 1.7, 0]} castShadow><coneGeometry args={[r * 0.5, r * 0.8, 12]} />{mat}</mesh>
    </group>
  );
  // flat (default): a thin cap board slightly wider than the post
  return <mesh position={[0, top + 0.025, 0]} castShadow><boxGeometry args={[s * 1.25, 0.06, s * 1.25]} />{mat}</mesh>;
}

// A galvanized round tube between two local points along an axis. `axis`:
// 'x' (horizontal rail), 'y' (vertical post). Length `len`, radius `r`.
function Tube({ x = 0, y = 0, z = 0, len, r = 0.06, axis = 'x', color = GALV, cast = true }) {
  const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={[x, y, z]} rotation={rot} castShadow={cast}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.38} />
    </mesh>
  );
}

// Fence in 3D. Local frame: x = 0..L along fence, y up, z thickness.
export default function Fence3D({ fence, gates, seg = null, selection, onSelect }) {
  const a = seg?.a || fence.a, b = seg?.b || fence.b;
  const L = dist(a, b);
  if (L < 0.05) return null;
  const ang = angleOf(a, b);
  const ft = FENCE_TYPES[fence.fenceType] || FENCE_TYPES.wood;
  const col = fence.color || ft.color;
  const H = fence.height;
  const spacing = fence.postSpacing || 8;
  const woody = !ft.slim; // wood picket / ranch rail vs. thin metal bars

  const fenceSelected = selection?.type === 'fence' && selection.id === fence.id;
  const selGateId = selection?.type === 'gate' ? selection.id : null;
  const selectFence = (e) => { e.stopPropagation(); onSelect?.({ type: 'fence', id: fence.id }); };

  // gate gaps along the fence
  const gaps = gates
    .map((g) => ({ id: g.id, c: g.t * L, w: g.width, gh: g.height ?? H, type: g.gateType || 'swing', color: g.color || col, barbed: !!g.barbed,
      slats: !!g.slats, slatColor: g.slatColor || '#2f6b3d', tight: (FENCE_TYPES[g.material] || ft).tight,
      style: (FENCE_TYPES[g.material] || ft).style, cap: g.cap || (FENCE_TYPES[g.material] || ft).cap, slim: (FENCE_TYPES[g.material] || ft).slim }))
    .filter((g) => g.c > 0 && g.c < L)
    .sort((a, b) => a.c - b.c);

  // solid panel spans skipping gate gaps
  const spans = [];
  let cursor = 0;
  for (const g of gaps) {
    const s = Math.max(0, g.c - g.w / 2);
    const e = Math.min(L, g.c + g.w / 2);
    if (s > cursor) spans.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < L) spans.push([cursor, L]);

  // posts along whole length (relative offsets). Drop any that fall inside a gate
  // opening, then add a post at each gate jamb so every gate is framed by posts.
  let postPts = postsAlong({ x: 0, y: 0 }, { x: L, y: 0 }, spacing).map((p) => p.x);
  postPts = postPts.filter((x) => !gaps.some((g) => x > g.c - g.w / 2 + 0.05 && x < g.c + g.w / 2 - 0.05));
  for (const g of gaps) postPts.push(g.c - g.w / 2, g.c + g.w / 2);
  postPts = postPts
    .filter((x) => x >= -0.001 && x <= L + 0.001)
    .sort((a, b) => a - b)
    .filter((x, i, a) => i === 0 || x - a[i - 1] > 0.05); // dedupe coincident posts
  const isMesh = ft.style === 'mesh';
  const postSize = fence.postSize ?? 0.3;
  const postCol = ft.style === 'solid' || ft.style === 'pickets' ? '#52606e' : '#5e564d'; // vinyl/metal vs wood
  const postH = fence.postHeight ?? (H + (isMesh ? 0.3 : 0.2));

  const renderPanel = ([s, e]) => {
    const w = e - s;
    const xc = (s + e) / 2;
    if (w < 0.05) return null;
    if (ft.style === 'solid') {
      return (
        <mesh key={'p' + s} position={[xc, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, H, 0.12]} />
          <meshStandardMaterial color={col} roughness={0.8} />
        </mesh>
      );
    }
    if (ft.style === 'mesh') {
      const slatCol = fence.slatColor || '#2f6b3d';
      const slats = [];
      if (fence.slats) {
        // thin vertical slats threaded BEHIND the mesh, so the galvanized diamond
        // wire still reads in front of them — the real privacy-slat look.
        const sw = 0.13, gap = 0.05, step = sw + gap;
        for (let x = -w / 2 + sw / 2 + 0.02; x < w / 2 - 0.02; x += step) {
          slats.push(<mesh key={'sl' + x} position={[x, H / 2, -0.04]} receiveShadow>
            <boxGeometry args={[sw, H - 0.16, 0.02]} />
            <meshStandardMaterial color={slatCol} roughness={0.92} metalness={0} />
          </mesh>);
        }
      }
      return (
        <group key={'p' + s} position={[xc, 0, 0]}>
          {/* vertical privacy slats woven behind the mesh (drawn first, so the
              see-through mesh fabric overlays them) */}
          {slats}
          {/* see-through chain-link fabric */}
          <group position={[0, H / 2 + 0.06, 0]}>
            <ChainLinkFabric w={w} h={H - 0.12} wire={col} />
          </group>
          {/* galvanized top rail + bottom tension wire */}
          <Tube y={H} len={w} r={0.06} axis="x" />
          <Tube y={0.1} len={w} r={0.025} axis="x" color="#6b7480" cast={false} />
          {/* barbed-wire top: angled arms + three strands */}
          {fence.barbed && <BarbedTop w={w} y={H} />}
        </group>
      );
    }
    if (ft.style === 'board') {
      // vertical wood/composite boards with thin seams + a cap rail
      const boards = [];
      const bw = 0.5, gap = 0.04, step = bw + gap;
      for (let x = s + bw / 2; x < e - 0.02; x += step) {
        boards.push(<mesh key={'b' + x} position={[x, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bw * 0.92, H, 0.12]} />
          <meshStandardMaterial color={col} roughness={0.85} />
        </mesh>);
      }
      return (
        <group key={'p' + s}>
          {boards}
          <mesh position={[xc, H + 0.05, 0]} castShadow>
            <boxGeometry args={[w, 0.14, 0.2]} />
            <meshStandardMaterial color={col} roughness={0.8} />
          </mesh>
        </group>
      );
    }
    if (ft.style === 'slat') {
      // horizontal slats. `tight` butts them together for privacy; metal slats
      // (aluminum) read shinier, wood slats matte. depth thicker for wood boards.
      const slats = [];
      const sh = 0.5, gap = ft.tight ? 0.03 : 0.18, step = sh + gap;
      const depth = woody ? 0.13 : 0.1;
      for (let y = sh / 2 + 0.08; y < H; y += step) {
        slats.push(<mesh key={'s' + y} position={[xc, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, sh, depth]} />
          <meshStandardMaterial color={col} roughness={woody ? 0.82 : 0.5} metalness={woody ? 0.05 : 0.45} />
        </mesh>);
      }
      return <group key={'p' + s}>{slats}</group>;
    }
    if (ft.style === 'rail') {
      // horizontal-rail (ranch / estate) fence — spaced rails, no infill
      const n = ft.rails || 3;
      const rails = [];
      for (let i = 0; i < n; i++) {
        const ry = H * ((i + 0.55) / n);
        rails.push(<mesh key={'r' + i} position={[xc, ry, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.2, 0.22]} />
          <meshStandardMaterial color={col} roughness={0.8} metalness={woody ? 0.05 : 0.4} />
        </mesh>);
      }
      return <group key={'p' + s}>{rails}</group>;
    }
    // pickets (wrought iron / aluminum / wood picket) — shaped tops via Picket
    const cap = fence.cap || ft.cap || 'dogear';
    const pw = ft.slim ? 0.08 : 0.3;   // metal bars are thin; wood pickets are boards
    const pstep = ft.slim ? 0.42 : 0.5;
    const pickets = [];
    for (let x = s + pstep / 2; x < e; x += pstep) {
      pickets.push(<Picket key={x} x={x} w={pw} h={H} cap={cap} color={col} metal={!woody} />);
    }
    return (
      <group key={'p' + s}>
        {pickets}
        {[H * 0.86, H * 0.16].map((ry, i) => (
          <mesh key={i} position={[xc, ry, 0]} castShadow>
            <boxGeometry args={[w, 0.12, woody ? 0.14 : 0.1]} />
            <meshStandardMaterial color={col} metalness={woody ? 0.05 : 0.6} roughness={woody ? 0.82 : 0.4} />
          </mesh>
        ))}
      </group>
    );
  };

  // a gate leaf rendered in the gate's material STYLE (boards / pickets / mesh /
  // slats / solid), origin at the hinge, spanning x: 0..w, y: 0..h.
  const LeafPanel = ({ w, h, color, style, sel, cap = 'dogear', slim = false, barbed = false, slats = false, slatColor = '#2f6b3d', tight = false }) => {
    const c = sel ? HILITE : color;
    const em = sel ? HILITE : '#000000';
    const ei = sel ? 0.6 : 0;
    if (style === 'mesh') {
      // tubular frame + diagonal truss brace + chain-link fabric (like the photo)
      const diag = Math.hypot(w, h);
      const fr = sel ? HILITE : GALV;
      return (
        <group>
          {/* privacy slats woven behind the gate's mesh */}
          {slats && (() => {
            const out = [], sw = 0.13, gp = 0.05, step = sw + gp;
            for (let x = 0.12 + sw / 2; x < w - 0.12; x += step) out.push(<mesh key={x} position={[x, h / 2, -0.04]} receiveShadow><boxGeometry args={[sw, h - 0.2, 0.02]} /><meshStandardMaterial color={slatColor} roughness={0.92} /></mesh>);
            return <group>{out}</group>;
          })()}
          <group position={[w / 2, h / 2, 0]}>
            <ChainLinkFabric w={w - 0.12} h={h - 0.12} wire={c} sel={sel} />
          </group>
          {/* perimeter frame */}
          <Tube x={0.06} y={h / 2} len={h} r={0.05} axis="y" color={fr} />
          <Tube x={w - 0.06} y={h / 2} len={h} r={0.05} axis="y" color={fr} />
          <Tube x={w / 2} y={h - 0.06} len={w} r={0.05} axis="x" color={fr} />
          <Tube x={w / 2} y={0.06} len={w} r={0.05} axis="x" color={fr} />
          {/* diagonal brace, corner to corner */}
          <mesh position={[w / 2, h / 2, -0.03]} rotation={[0, 0, Math.atan2(h, w) - Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, diag - 0.1, 8]} />
            <meshStandardMaterial color={fr} metalness={0.6} roughness={0.4} emissive={em} emissiveIntensity={ei} />
          </mesh>
          {/* matching barbed-wire top */}
          {barbed && <group position={[w / 2, 0, 0]}><BarbedTop w={w} y={h} color={fr} /></group>}
        </group>
      );
    }
    if (style === 'pickets') {
      const pk = [];
      const pw = slim ? 0.07 : 0.26, pstep = slim ? 0.4 : 0.46;
      for (let x = pstep / 2; x < w; x += pstep) pk.push(<Picket key={x} x={x} w={pw} h={h} cap={cap} color={color} metal={slim} sel={sel} />);
      return <group>{pk}{[h * 0.85, h * 0.15].map((y, i) => <mesh key={'r' + i} position={[w / 2, y, 0]}><boxGeometry args={[w, 0.09, 0.09]} /><meshStandardMaterial color={c} metalness={slim ? 0.6 : 0.05} roughness={slim ? 0.4 : 0.82} emissive={em} emissiveIntensity={ei} /></mesh>)}</group>;
    }
    if (style === 'rail') {
      const rl = [];
      for (let i = 0; i < 3; i++) rl.push(<mesh key={i} position={[w / 2, h * ((i + 0.55) / 3), 0]} castShadow><boxGeometry args={[w, 0.16, 0.16]} /><meshStandardMaterial color={c} roughness={0.8} emissive={em} emissiveIntensity={ei} /></mesh>);
      return <group>{rl}</group>;
    }
    if (style === 'slat') {
      const sl = [], sh = 0.45, gap = tight ? 0.03 : 0.15, step = sh + gap, woody = !slim;
      for (let y = sh / 2 + 0.05; y < h; y += step) sl.push(<mesh key={y} position={[w / 2, y, 0]} castShadow><boxGeometry args={[w, sh, woody ? 0.1 : 0.08]} /><meshStandardMaterial color={c} roughness={woody ? 0.82 : 0.5} metalness={woody ? 0.05 : 0.45} emissive={em} emissiveIntensity={ei} /></mesh>);
      return <group>{sl}</group>;
    }
    if (style === 'board') {
      const bd = [], bw = 0.45, gap = 0.04, step = bw + gap;
      for (let x = bw / 2; x < w - 0.02; x += step) bd.push(<mesh key={x} position={[x, h / 2, 0]} castShadow><boxGeometry args={[bw * 0.92, h, 0.1]} /><meshStandardMaterial color={c} roughness={0.85} emissive={em} emissiveIntensity={ei} /></mesh>);
      return <group>{bd}</group>;
    }
    return <mesh position={[w / 2, h / 2, 0]} castShadow><boxGeometry args={[w, h, 0.09]} /><meshStandardMaterial color={c} roughness={0.6} metalness={0.2} emissive={em} emissiveIntensity={ei} /></mesh>;
  };
  const Leaf = ({ pos, rot, w, h, sel, color, style, cap, slim, barbed, slats, slatColor, tight }) => (
    <group position={pos} rotation={rot}><LeafPanel w={w} h={h} color={color} style={style} sel={sel} cap={cap} slim={slim} barbed={barbed} slats={slats} slatColor={slatColor} tight={tight} /></group>
  );

  return (
    <group position={[a.x, 0, a.y]} rotation={[0, -ang, 0]} onClick={selectFence}>
      {/* selection glow rail along the run */}
      {fenceSelected && (
        <mesh position={[L / 2, H + 0.25, 0]}>
          <boxGeometry args={[L, 0.12, 0.12]} />
          <meshStandardMaterial color={HILITE} emissive={HILITE} emissiveIntensity={0.7} />
        </mesh>
      )}
      {/* posts — round galvanized tubes with dome caps for chain-link, else box.
          Height is editable per fence (postHeight), default = panel height + a
          small reveal. */}
      {postPts.map((x, i) => isMesh ? (
        <group key={'post' + i} position={[x, 0, 0]}>
          <mesh position={[0, postH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.11, 0.11, postH, 12]} />
            <meshStandardMaterial color={GALV_DK} metalness={0.55} roughness={0.45} />
          </mesh>
          <mesh position={[0, postH, 0]} castShadow>
            <sphereGeometry args={[0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={GALV_DK} metalness={0.55} roughness={0.45} />
          </mesh>
        </group>
      ) : (
        <group key={'post' + i} position={[x, 0, 0]}>
          <mesh position={[0, postH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[postSize, postH, postSize]} />
            <meshStandardMaterial color={postCol} roughness={0.7} />
          </mesh>
          <PostCap cap={fence.postCap || 'flat'} top={postH} size={postSize} color={postCol} />
        </group>
      ))}
      {/* panels */}
      {spans.map(renderPanel)}
      {/* gates — rendered per gate type */}
      {gaps.map((g, i) => {
        const gSel = selGateId === g.id;
        const lh = g.gh;
        const click = (e) => { e.stopPropagation(); onSelect?.({ type: 'gate', id: g.id }); };
        return (
          <group key={'gate' + i} onClick={click}>
            {g.type === 'swing' && (
              <Leaf pos={[g.c - g.w / 2, 0, 0]} rot={[0, -0.6, 0]} w={g.w} h={lh} sel={gSel} color={g.color} style={g.style} cap={g.cap} slim={g.slim} barbed={g.barbed} slats={g.slats} slatColor={g.slatColor} tight={g.tight} />
            )}
            {g.type === 'double' && (
              <>
                <Leaf pos={[g.c - g.w / 2, 0, 0]} rot={[0, -0.6, 0]} w={g.w / 2} h={lh} sel={gSel} color={g.color} style={g.style} cap={g.cap} slim={g.slim} barbed={g.barbed} slats={g.slats} slatColor={g.slatColor} tight={g.tight} />
                <Leaf pos={[g.c + g.w / 2, 0, 0]} rot={[0, Math.PI + 0.6, 0]} w={g.w / 2} h={lh} sel={gSel} color={g.color} style={g.style} cap={g.cap} slim={g.slim} barbed={g.barbed} slats={g.slats} slatColor={g.slatColor} tight={g.tight} />
              </>
            )}
            {g.type === 'sliding' && (
              // panel slid to one side, sitting just in front of the fence line
              <group position={[g.c + g.w / 2, 0, 0.18]}>
                <LeafPanel w={g.w} h={lh} color={g.color} style={g.style} sel={gSel} cap={g.cap} slim={g.slim} barbed={g.barbed} slats={g.slats} slatColor={g.slatColor} tight={g.tight} />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
