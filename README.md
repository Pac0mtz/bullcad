# PlanForge — 2D + 3D Wall &amp; Fence Plan Maker

A web-based plan maker for drawing **walls and fencing** in **2D** and viewing them
instantly in **3D**. Manual drawing only — no LiDAR, no camera scanning. Focused on
wall components and fencing (no furniture, no fixtures).

Built with **React + Vite**, **react-konva** (2D), and **three / @react-three/fiber /
drei** (3D). State is held in **Zustand**, entirely client-side — no backend.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173). On **Replit**, the dev
server binds `0.0.0.0` and allows the preview host, so it runs out of the box.

## Features

### 2D editor
- Snap-to-grid drawing on an infinite grid. Default scale **1 ft = 12 px** (adjustable
  slider, 6–30 px/ft).
- **Wall tool** — click to drop points, click to chain, double-click / `Esc` to finish.
  Walls snap to the grid and to existing endpoints. Adjustable thickness (default 4.5").
- **Wall components** — doors, windows, and openings. Click a wall to place; switch to
  Select and drag to slide along the wall. Adjustable width/height (+ window sill).
- **Fence tool** — same click-to-chain drawing. Per-line **fence type** (wood privacy,
  vinyl, chain link, wrought iron), adjustable **height**, **post spacing** (posts auto-
  placed along the run and at corners), and draggable **gates**.
- **Edit** — select / move / reshape by dragging endpoints and component handles; delete
  with `Delete`. Undo/redo (`Ctrl/Cmd+Z`, `Shift` to redo).
- **View** — scroll to zoom, `Space`-drag or middle-mouse to pan, fit-to-screen button.

### Measurements
- Live dimension labels on every wall and fence segment, in **feet &amp; inches**.
- **Tape/measure tool** — click two points to read any distance.
- Right-panel **Quantities summary**: wall LF, fence LF by type, gate count, post count,
  door/window/opening counts. Copy as a **table** or **JSON** for downstream estimating.

### 3D view
- **2D ⇄ 3D toggle** in the toolbar. Shared data model — edits in 2D appear in 3D.
- Walls extrude to an adjustable height (default 8') with real openings cut for doors and
  windows (glass panes + headers/sills).
- Fences render posts at the computed spacing plus type-specific panels (solid privacy /
  translucent chain-link mesh / iron pickets); gates render as a swung leaf in a gap.
- `OrbitControls` — orbit (drag), pan (right-drag), zoom (scroll).

### Data
- One shared model (`src/store.js`) used by 2D and 3D.
- **Export / Import** the plan as JSON (toolbar). In-memory React state only — no
  localStorage, so it runs cleanly in any preview/sandbox.
- **New / Clear** to start over. Loads a **sample plan** (24×16 ft footprint with a
  perimeter wood fence + gate) on first load.

## Project structure

```
src/
  main.jsx              # React entry
  App.jsx               # shell + global shortcuts + JSON import
  store.js              # Zustand model: walls, openings, fences, gates, history
  styles.css            # teal & blue theme
  utils/
    geometry.js         # math, formatting, fence catalog, post spacing
    quantities.js       # bill-of-quantities computation
  components/
    Toolbar.jsx         # tools, undo/redo, 2D/3D toggle, export/import
    LeftPanel.jsx       # tool options + component library
    RightPanel.jsx      # selected-element properties + quantities summary
    Canvas2D.jsx        # Konva stage: drawing, editing, dimensions, measure
    Icons.jsx           # inline SVG icons
    canvas/Shapes.jsx   # Konva wall/opening/fence/gate/dimension shapes
    Scene3D.jsx         # react-three-fiber scene + lighting + controls
    three/Wall3D.jsx    # extruded wall with openings
    three/Fence3D.jsx   # posts + panels + gates per fence type
```

## Theme
Teal `#14b8a6` (active tools/highlights), navy `#0a2540` (headers/panels), accent blue
`#2563eb` (buttons/selection), on white / light-slate backgrounds.

## Notes
- Units are stored in **feet**; 2D rendering multiplies by the px/ft scale, 3D uses feet
  directly.
- All geometry is plain JSON, so exported plans are portable and easy to feed into a cost
  estimator.
