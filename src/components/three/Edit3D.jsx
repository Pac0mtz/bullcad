import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useStore } from '../../store.js';

// Direct-manipulation gizmos for the selected element in the 3D view:
//   • yellow disc on the floor  → drag to MOVE on the ground
//   • blue ring around it       → drag to ROTATE (snaps to 15°)
//   • green cone above it       → drag to change HEIGHT (walls/fences)
// Live edits write straight to the store; a snapshot is captured on grab and
// pushed to history on release, so every 3D edit is undoable like any other.
const MOVE = '#f59e0b';
const ROT = '#2563eb';
const RAISE = '#10b981';
const snap = (v, step) => Math.round(v / step) * step;

export default function Edit3D() {
  const selection = useStore((s) => s.selection);
  const walls = useStore((s) => s.walls);
  const fences = useStore((s) => s.fences);
  const stairs = useStore((s) => s.stairs);
  const wallHeight = useStore((s) => s.wallHeight);
  const grid = useStore((s) => s.grid);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const { camera, gl, raycaster } = useThree();
  const controls = useThree((s) => s.controls);
  const drag = useRef(null);

  const sel = useMemo(() => {
    if (!selection) return null;
    if (selection.type === 'wall') { const w = walls.find((x) => x.id === selection.id); return w && { kind: 'wall', el: w }; }
    if (selection.type === 'fence') { const f = fences.find((x) => x.id === selection.id); return f && { kind: 'fence', el: f }; }
    if (selection.type === 'stair') { const st = stairs.find((x) => x.id === selection.id); return st && { kind: 'stair', el: st }; }
    return null;
  }, [selection, walls, fences, stairs]);

  if (!sel) return null;

  const { kind, el } = sel;
  const seg = kind === 'wall' || kind === 'fence';
  const center = seg ? { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 } : { x: el.x, y: el.y };
  const len = seg ? Math.hypot(el.b.x - el.a.x, el.b.y - el.a.y) : (el.width || 4);
  const ringR = Math.max(2.4, len * 0.6);
  const height = seg ? (el.height ?? (kind === 'wall' ? wallHeight : 6)) : 0;

  // intersect the pointer ray with a math plane → world point
  const hitPlane = (clientX, clientY, plane) => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  };

  const begin = (mode) => (e) => {
    e.stopPropagation();
    const cx = e.clientX ?? e.nativeEvent?.clientX;
    const cy = e.clientY ?? e.nativeEvent?.clientY;
    const st = useStore.getState();

    // drag plane: horizontal for move/rotate, vertical (facing camera) for height
    let plane;
    if (mode === 'height') {
      const n = new THREE.Vector3(camera.position.x - center.x, 0, camera.position.z - center.y);
      if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
      n.normalize();
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(center.x, 0, center.y));
    } else {
      plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    }
    const p0 = hitPlane(cx, cy, plane);

    const session = {
      mode, plane,
      before: st.snapshotGeom(),
      orig: JSON.parse(JSON.stringify(el)),
      center: { ...center },
      start: p0 ? { x: p0.x, y: p0.y, z: p0.z } : { x: center.x, y: 0, z: center.y },
      startAngle: p0 ? Math.atan2(p0.z - center.y, p0.x - center.x) : 0,
    };

    const onMove = (ev) => {
      const p = hitPlane(ev.clientX, ev.clientY, session.plane);
      if (!p) return;
      const store = useStore.getState();
      if (mode === 'move') {
        let dx = p.x - session.start.x, dz = p.z - session.start.z;
        if (snapEnabled) { dx = snap(dx, grid || 1); dz = snap(dz, grid || 1); }
        if (seg) store.updateElement(kind, el.id, { a: { x: session.orig.a.x + dx, y: session.orig.a.y + dz }, b: { x: session.orig.b.x + dx, y: session.orig.b.y + dz } });
        else store.updateElement('stair', el.id, { x: session.orig.x + dx, y: session.orig.y + dz });
      } else if (mode === 'rotate') {
        let dA = Math.atan2(p.z - session.center.y, p.x - session.center.x) - session.startAngle;
        dA = snap(dA, Math.PI / 12); // 15°
        const c = Math.cos(dA), s = Math.sin(dA);
        const rot = (pt) => ({ x: session.center.x + (pt.x - session.center.x) * c - (pt.y - session.center.y) * s, y: session.center.y + (pt.x - session.center.x) * s + (pt.y - session.center.y) * c });
        if (seg) store.updateElement(kind, el.id, { a: rot(session.orig.a), b: rot(session.orig.b) });
        else store.updateElement('stair', el.id, { rotation: (session.orig.rotation || 0) + (dA * 180) / Math.PI });
      } else if (mode === 'height') {
        let h = p.y;
        if (snapEnabled) h = snap(h, 0.5);
        store.updateElement(kind, el.id, { height: Math.max(1, Math.min(40, h)) });
      }
    };
    const onUp = () => {
      useStore.getState().pushPast(session.before);
      drag.current = null;
      if (controls) controls.enabled = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    drag.current = session;
    if (controls) controls.enabled = false;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const cursor = (c) => (e) => { gl.domElement.style.cursor = c; };

  return (
    <group>
      {/* MOVE — disc on the floor */}
      <mesh position={[center.x, 0.18, center.y]} rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={begin('move')} onPointerOver={cursor('move')} onPointerOut={cursor('default')}>
        <cylinderGeometry args={[1.1, 1.1, 0.25, 28]} />
        <meshStandardMaterial color={MOVE} emissive={MOVE} emissiveIntensity={0.35} roughness={0.5} />
      </mesh>

      {/* ROTATE — ring around the element on the floor */}
      <mesh position={[center.x, 0.14, center.y]} rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={begin('rotate')} onPointerOver={cursor('grab')} onPointerOut={cursor('default')}>
        <torusGeometry args={[ringR, 0.13, 14, 56]} />
        <meshStandardMaterial color={ROT} emissive={ROT} emissiveIntensity={0.3} roughness={0.5} />
      </mesh>

      {/* HEIGHT — cone above the wall/fence top */}
      {seg && (
        <mesh position={[center.x, height + 0.7, center.y]}
          onPointerDown={begin('height')} onPointerOver={cursor('ns-resize')} onPointerOut={cursor('default')}>
          <coneGeometry args={[0.5, 1.3, 18]} />
          <meshStandardMaterial color={RAISE} emissive={RAISE} emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}
