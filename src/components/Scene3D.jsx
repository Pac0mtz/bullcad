import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import { useStore } from '../store.js';
import { SCENE_THEME } from '../utils/theme.js';
import { centroidOf, justifiedSegments } from '../utils/geometry.js';
import { setView3D, clearView3D } from '../utils/scene3d.js';

const FENCE_THICK = 0.3;
import Wall3D from './three/Wall3D.jsx';
import Stair3D from './three/Stair3D.jsx';
import Fence3D from './three/Fence3D.jsx';
import Edit3D from './three/Edit3D.jsx';
import Object3D from './three/Object3D.jsx';

// Compute the plan center + extent so we can frame the camera nicely.
function useBounds(walls, fences) {
  return useMemo(() => {
    const pts = [];
    walls.forEach((w) => pts.push(w.a, w.b));
    fences.forEach((f) => pts.push(f.a, f.b));
    if (!pts.length) return { cx: 0, cz: 0, span: 30 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2,
      span: Math.max(maxX - minX, maxY - minY, 12),
    };
  }, [walls, fences]);
}

export default function Scene3D() {
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const fences = useStore((s) => s.fences);
  const gates = useStore((s) => s.gates);
  const stairs = useStore((s) => s.stairs);
  const objects = useStore((s) => s.objects);
  const layers = useStore((s) => s.layers);
  const wallHeight = useStore((s) => s.wallHeight);
  const theme = useStore((s) => s.theme);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const clearSelection = useStore((s) => s.clearSelection);
  const addOpening = useStore((s) => s.addOpening);
  // null = edit/select mode; 'door' | 'window' = click a wall face to add one
  const [addMode, setAddMode] = useState(null);
  const wallJustify = useStore((s) => s.wallJustify);
  const fenceJustify = useStore((s) => s.fenceJustify);
  const sky = SCENE_THEME[theme] || SCENE_THEME.light;

  const { cx, cz, span } = useBounds(walls, fences);
  const camDist = span * 1.4 + 14;

  // publish the live renderer/scene so the PDF export can snapshot 3D views
  const r3f = useRef(null);
  useEffect(() => { if (r3f.current) setView3D({ bounds: { cx, cz, span } }); }, [cx, cz, span]);
  useEffect(() => () => clearView3D(), []);

  // group openings/gates by host for quick lookup
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

  // building center → which way a wall's projecting (bay/garden) windows bump out
  const wallCentroid = useMemo(() => centroidOf(walls.flatMap((w) => [w.a, w.b])), [walls]);
  const fenceCentroid = useMemo(() => centroidOf(fences.flatMap((f) => [f.a, f.b])), [fences]);
  const outwardOf = (w) => {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const nx = -(w.b.y - w.a.y) / L, ny = (w.b.x - w.a.x) / L; // unit normal
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    return nx * (wallCentroid.x - mid.x) + ny * (wallCentroid.y - mid.y) < 0 ? 1 : -1;
  };

  // justified, miter-joined endpoints — same source of truth as the 2D canvas so
  // 3D corners land on the chosen face exactly like the plan view.
  const wallSegs = useMemo(
    () => justifiedSegments(walls, wallJustify, wallCentroid, (w) => w.thickness),
    [walls, wallJustify, wallCentroid]);
  const fenceSegs = useMemo(
    () => justifiedSegments(fences, fenceJustify, fenceCentroid, () => FENCE_THICK),
    [fences, fenceJustify, fenceCentroid]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: sky.wrapGradient }}>
      <Canvas shadows camera={{ position: [cx + camDist * 0.7, camDist * 0.8, cz + camDist], fov: 45 }}
        onPointerMissed={() => clearSelection()}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={(state) => {
          state.gl.domElement.style.cursor = 'default';
          r3f.current = state;
          setView3D({ gl: state.gl, scene: state.scene, camera: state.camera, bounds: { cx, cz, span } });
        }}>
        <color attach="background" args={[sky.background]} />
        <fog attach="fog" args={[sky.fog, camDist * 1.5, camDist * 4]} />

        <ambientLight intensity={sky.ambient} />
        {sky.hemi > 0 && <hemisphereLight args={['#9fb4cc', '#1a2433', sky.hemi]} />}
        <directionalLight
          position={[cx + 40, 60, cz + 25]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
        />

        {/* ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow>
          <planeGeometry args={[600, 600]} />
          <meshStandardMaterial color={sky.ground} roughness={1} />
        </mesh>
        <Grid
          position={[cx, 0, cz]}
          args={[400, 400]}
          cellSize={1}
          cellColor={sky.gridCell}
          sectionSize={5}
          sectionColor={sky.gridSection}
          fadeDistance={span * 4 + 60}
          fadeStrength={1}
          infiniteGrid
        />

        {/* walls */}
        {layers.walls && walls.map((w) => (
          <Wall3D key={w.id} wall={w} openings={layers.openings ? (openingsByWall[w.id] || []) : []} wallHeight={w.height ?? wallHeight}
            outward={outwardOf(w)} seg={wallSegs.get(w.id)}
            selection={selection} onSelect={select}
            onWallBody={addMode ? (e) => {
              e.stopPropagation();
              const P = e.point; // world (x, z); z maps to plan y
              const vx = w.b.x - w.a.x, vy = w.b.y - w.a.y, L2 = vx * vx + vy * vy || 1;
              let t = ((P.x - w.a.x) * vx + (P.z - w.a.y) * vy) / L2;
              t = Math.max(0.06, Math.min(0.94, t));
              addOpening(w.id, addMode, t);
            } : null} />
        ))}
        {/* fences */}
        {layers.fences && fences.map((f) => (
          <Fence3D key={f.id} fence={f} gates={layers.gates ? (gatesByFence[f.id] || []) : []}
            seg={fenceSegs.get(f.id)}
            selection={selection} onSelect={select} />
        ))}

        {/* stairs */}
        {layers.stairs && stairs.map((stp) => (
          <Stair3D key={stp.id} stair={stp} selection={selection} onSelect={select} />
        ))}

        {/* furniture / fixture objects */}
        {layers.objects && objects.map((o) => (
          <Object3D key={o.id} obj={o} selected={selection?.type === 'object' && selection.id === o.id}
            onSelect={(id) => select({ type: 'object', id })} />
        ))}

        {/* direct-manipulation gizmos for the current selection (move/rotate/height);
            hidden while placing openings so the handles don't intercept wall clicks */}
        {!addMode && <Edit3D />}

        <ContactShadows position={[cx, 0.01, cz]} scale={span * 3 + 40} blur={2} opacity={0.35} far={40} />

        <OrbitControls
          target={[cx, wallHeight / 3, cz]}
          makeDefault
          enablePan
          maxPolarAngle={Math.PI / 2.05}
          minDistance={4}
          maxDistance={camDist * 3}
        />
      </Canvas>

      {/* 3D edit toolbar: select/move vs. place doors/windows */}
      <div className="edit3d-bar">
        <button className={addMode === null ? 'active' : ''} onClick={() => setAddMode(null)} title="Select & move (drag the handles)">Edit</button>
        <button className={addMode === 'door' ? 'active' : ''} onClick={() => setAddMode((m) => (m === 'door' ? null : 'door'))} title="Click a wall to add a door">+ Door</button>
        <button className={addMode === 'window' ? 'active' : ''} onClick={() => setAddMode((m) => (m === 'window' ? null : 'window'))} title="Click a wall to add a window">+ Window</button>
      </div>

      <div className="hint">
        {addMode
          ? `Click a wall to place a ${addMode} · pick Edit to stop`
          : 'Click to select · drag the disc to move, ring to rotate, cone to raise · right-drag to pan'}
      </div>
    </div>
  );
}
