import * as THREE from 'three';

// Live handle to the mounted 3D scene, populated by Scene3D while in 3D mode and
// consumed by the PDF export to snapshot the model from several camera angles.
export const view3d = { gl: null, scene: null, camera: null, bounds: null };

export function setView3D(patch) { Object.assign(view3d, patch); }
export function clearView3D() { view3d.gl = null; view3d.scene = null; view3d.camera = null; }
export function has3DView() { return !!(view3d.gl && view3d.scene && view3d.camera && view3d.bounds); }

// Preset camera angles around the model, used both for the labels and the render.
function presetsFor(cx, cz, span) {
  const d = span * 1.4 + 14;
  return [
    { label: 'Aerial — north-east', pos: [cx + d * 0.78, d * 0.72, cz + d * 0.92] },
    { label: 'Aerial — south-west', pos: [cx - d * 0.78, d * 0.72, cz - d * 0.92] },
    { label: 'Corner — north-west', pos: [cx - d * 0.92, d * 0.5, cz + d * 0.85] },
    { label: 'Eye level — south', pos: [cx, span * 0.45 + 6, cz - d * 1.18] },
  ];
}

// Render the live scene from each preset angle and grab the canvas as an image.
// Uses a cloned camera so the on-screen camera / OrbitControls stay put; the live
// view is re-rendered at the end. Requires the renderer to preserve its drawing
// buffer (set on the R3F <Canvas>). Returns [{ label, dataUrl, w, h }].
export function capture3DViews() {
  if (!has3DView()) return [];
  const { gl, scene, camera, bounds } = view3d;
  const { cx, cz, span } = bounds;
  const target = new THREE.Vector3(cx, span * 0.18, cz);
  const presets = presetsFor(cx, cz, span);
  const canvas = gl.domElement;

  // Render each view into a SQUARE (1:1) buffer so the PDF shows equal squares.
  // We temporarily resize the renderer (drawing buffer only — updateStyle=false),
  // then restore the live on-screen size and frame when done.
  const S = 900;
  const prevSize = gl.getSize(new THREE.Vector2());
  const prevPR = gl.getPixelRatio();

  const cam = camera.clone();
  cam.aspect = 1;
  cam.far = Math.max(cam.far, (span + 80) * 6);

  const out = [];
  try {
    gl.setPixelRatio(1);
    gl.setSize(S, S, false);
    for (const p of presets) {
      cam.position.set(p.pos[0], p.pos[1], p.pos[2]);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      gl.render(scene, cam);
      out.push({ label: p.label, dataUrl: canvas.toDataURL('image/png'), w: S, h: S });
    }
  } finally {
    gl.setPixelRatio(prevPR);
    gl.setSize(prevSize.x, prevSize.y, false);
    gl.render(scene, camera); // restore the on-screen frame
  }
  return out;
}
