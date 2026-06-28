import { create } from 'zustand';
import { uid, FENCE_TYPES, OPENING_DEFAULTS, WINDOW_STYLES } from './utils/geometry.js';

// ----- snapshot helpers for undo/redo -----
const GEOM_KEYS = ['walls', 'openings', 'fences', 'gates', 'posts', 'labels', 'stairs'];
const snapshot = (s) => JSON.parse(JSON.stringify(Object.fromEntries(GEOM_KEYS.map((k) => [k, s[k]]))));
// live geometry of a state, and an empty page's geometry
const geomOf = (s) => Object.fromEntries(GEOM_KEYS.map((k) => [k, s[k]]));
const emptyGeom = () => Object.fromEntries(GEOM_KEYS.map((k) => [k, []]));

// ----- a small sample plan so the app looks alive on first load -----
function samplePlan() {
  // A 24' x 16' building footprint with a perimeter fence + gate.
  const W = 24, H = 16, t = 0.5; // 6" walls
  const corners = [
    { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H },
  ];
  const walls = corners.map((c, i) => ({
    id: uid('wall'),
    a: c,
    b: corners[(i + 1) % corners.length],
    thickness: t,
    material: 'drywall',
    exterior: true,
  }));
  const openings = [
    { id: uid('op'), wallId: walls[0].id, type: 'door', t: 0.5, width: 3, height: 6.75 },
    { id: uid('op'), wallId: walls[1].id, type: 'window', t: 0.5, width: 6, height: 4, sill: 2, style: 'bay' },
    { id: uid('op'), wallId: walls[2].id, type: 'window', t: 0.5, width: 2.5, height: 4.5, sill: 2.5, style: 'casement' },
    { id: uid('op'), wallId: walls[3].id, type: 'window', t: 0.4, width: 4, height: 3, sill: 3, style: 'slider' },
  ];

  // Perimeter fence offset 8' around the building.
  const m = 8;
  const fc = [
    { x: -m, y: -m }, { x: W + m, y: -m }, { x: W + m, y: H + m }, { x: -m, y: H + m },
  ];
  const fences = fc.map((c, i) => ({
    id: uid('fence'),
    a: c,
    b: fc[(i + 1) % fc.length],
    fenceType: 'wood',
    height: FENCE_TYPES.wood.height,
    postSpacing: 8,
  }));
  const gates = [
    { id: uid('gate'), fenceId: fences[0].id, t: 0.5, width: 4 },
  ];

  return { walls, openings, fences, gates, posts: [], labels: [], stairs: [] };
}

// ----- autosave: persist the whole project to localStorage so a refresh (or a
// dev-server reload) never loses work -----
const PERSIST_KEY = 'planforge:project:v1';
function serializeProject(s) {
  const pages = s.pages.map((p) => ({
    id: p.id, name: p.name,
    geom: p.id === s.activePage ? geomOf(s) : (s.pageStore[p.id] || emptyGeom()),
  }));
  return { v: 1, pages, activePage: s.activePage, settings: { scale: s.scale, grid: s.grid, dimMode: s.dimMode, wallJustify: s.wallJustify } };
}
function loadPersisted() {
  try {
    const data = JSON.parse(localStorage.getItem(PERSIST_KEY));
    return data && Array.isArray(data.pages) && data.pages.length ? data : null;
  } catch { return null; }
}
// hydrate initial geometry/pages from autosave when present, else the sample plan
const _saved = typeof localStorage !== 'undefined' ? loadPersisted() : null;
const _activeId = _saved ? (_saved.pages.some((p) => p.id === _saved.activePage) ? _saved.activePage : _saved.pages[0].id) : 'page1';
const _initGeom = _saved ? { ...emptyGeom(), ...((_saved.pages.find((p) => p.id === _activeId) || {}).geom || {}) } : samplePlan();
const _initPages = _saved ? _saved.pages.map((p) => ({ id: p.id, name: p.name })) : [{ id: 'page1', name: 'Page 1' }];
const _initPageStore = _saved ? Object.fromEntries(_saved.pages.filter((p) => p.id !== _activeId).map((p) => [p.id, { ...emptyGeom(), ...(p.geom || {}) }])) : {};
const _initSettings = _saved?.settings || {};

export const useStore = create((set, get) => ({
  // ----- view / tooling -----
  mode: '2d', // '2d' | '3d'
  tool: 'select',
  exportOpen: false, // PDF export options modal
  theme: 'light', // 'light' | 'dark' — UI + canvas appearance (not part of undo history)
  scale: _initSettings.scale ?? 12, // pixels per foot
  grid: _initSettings.grid ?? 1, // feet per grid cell
  snapEnabled: true,

  // ----- dimensioning -----
  dimMode: _initSettings.dimMode ?? 'exterior', // 'off' | 'centerline' | 'interior' | 'exterior' | 'both'
  dimOffset: 1.0,      // feet between wall face and dimension line

  // ----- alignment: where the drawn line sits on the wall/fence body -----
  wallJustify: _initSettings.wallJustify ?? 'interior',  // 'center' | 'interior' | 'exterior' — drawn line on the interior face by default
  fenceJustify: 'center', // 'center' | 'interior' | 'exterior'

  // ----- defaults applied to newly drawn elements -----
  wallThickness: 0.5, // 6"
  wallHeight: 8,
  wallColor: '#e2e8f0',
  wallMaterial: 'drywall',
  detachCorner: false, // when on, dragging a corner moves only that wall (split the joint); Alt does this momentarily
  showRoomAreas: false, // overlay computed room areas on the 2D plan

  // ----- layer visibility (view state, not part of undo history) -----
  layers: { walls: true, openings: true, fences: true, gates: true, stairs: true, labels: true, dims: true },
  setLayer: (key, val) => set((s) => ({ layers: { ...s.layers, [key]: val } })),
  fenceType: 'wood',
  fenceHeight: FENCE_TYPES.wood.height,
  fenceColor: FENCE_TYPES.wood.color,
  picketCap: 'dogear',  // default top profile for picket-style fences
  labelColors: { line: '#0a2540', arrow: '#0a2540', border: '#2563eb' }, // default label callout colors
  stairType: 'straight', stairWidth: 3.5, stairSteps: 13, // stair defaults
  fenceSlats: false,         // chain-link privacy slats
  fenceSlatColor: '#2f6b3d',
  fenceBarbed: false,        // barbed-wire top (chain link)
  postSpacing: 8,
  gateStyle: 'swing',
  openingWidth: 3,
  windowStyle: 'slider', // default style for newly placed windows
  windowGrid: false,     // colonial grille overlay
  gateWidth: 4,

  // ----- geometry (the active page's live geometry) -----
  ..._initGeom,

  // ----- pages (multiple plans in one project) -----
  pages: _initPages,
  activePage: _activeId,
  pageStore: _initPageStore, // id -> geometry snapshot for the INACTIVE pages

  // ----- selection + history -----
  selection: null, // { type:'wall'|'opening'|'fence'|'gate', id }
  multi: [], // marquee group selection — [{ type, id }]
  elevationTarget: null, // { type:'wall'|'fence', id } — open elevation editor
  past: [],
  future: [],

  // ---- elevation editor ----
  openElevation: (type, id) => set({ elevationTarget: { type, id }, selection: { type, id } }),
  closeElevation: () => set({ elevationTarget: null }),
  // step to the next/prev element of the same kind (dir = +1 | -1)
  stepElevation: (dir) => set((s) => {
    if (!s.elevationTarget) return {};
    const list = s.elevationTarget.type === 'wall' ? s.walls : s.fences;
    if (!list.length) return {};
    const i = Math.max(0, list.findIndex((e) => e.id === s.elevationTarget.id));
    const ni = (i + dir + list.length) % list.length;
    const id = list[ni].id;
    return { elevationTarget: { type: s.elevationTarget.type, id }, selection: { type: s.elevationTarget.type, id } };
  }),

  // ---- generic helpers ----
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setTool: (tool) => set({ tool, selection: tool === 'select' ? get().selection : null, multi: tool === 'select' ? get().multi : [] }),
  setScale: (scale) => set({ scale: Math.max(4, Math.min(40, scale)) }),
  setSnap: (snapEnabled) => set({ snapEnabled }),
  select: (selection) => set({ selection, multi: selection ? [{ type: selection.type, id: selection.id }] : [] }),
  // marquee multi-select: `multi` is the group; `selection` is the one shown in Properties
  selectMany: (items) => set({ multi: items, selection: items.length === 1 ? { type: items[0].type, id: items[0].id } : null }),
  clearSelection: () => set({ selection: null, multi: [] }),
  setDefault: (k, v) => set({ [k]: v }),

  // push current geometry to undo stack, then mutate.
  commit: (mutator) =>
    set((s) => {
      const past = [...s.past, snapshot(s)].slice(-60);
      const next = mutator(s) || {};
      return { ...next, past, future: [] };
    }),

  // capture / push geometry snapshots — used by live drags in the canvas
  snapshotGeom: () => snapshot(get()),
  pushPast: (snap) => set((s) => ({ past: [...s.past, snap].slice(-60), future: [] })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return {};
      const prev = s.past[s.past.length - 1];
      return {
        ...prev,
        past: s.past.slice(0, -1),
        future: [...s.future, snapshot(s)],
        selection: null,
      };
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length) return {};
      const nxt = s.future[s.future.length - 1];
      return {
        ...nxt,
        future: s.future.slice(0, -1),
        past: [...s.past, snapshot(s)],
        selection: null,
      };
    }),

  // ---- walls ----
  addWall: (a, b) => {
    const id = uid('wall');
    get().commit((s) => ({ walls: [...s.walls, { id, a, b, thickness: s.wallThickness, color: s.wallColor, height: s.wallHeight, material: s.wallMaterial }] }));
    return id;
  },

  // split a wall into two halves at its midpoint, re-homing any openings
  splitWall: (id) => get().commit((s) => {
    const w = s.walls.find((x) => x.id === id);
    if (!w) return {};
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const id1 = uid('wall'), id2 = uid('wall');
    const walls = s.walls.flatMap((x) => x.id === id ? [{ ...w, id: id1, a: w.a, b: mid }, { ...w, id: id2, a: mid, b: w.b }] : [x]);
    const openings = s.openings.map((o) => o.wallId !== id ? o : (o.t < 0.5 ? { ...o, wallId: id1, t: o.t * 2 } : { ...o, wallId: id2, t: (o.t - 0.5) * 2 }));
    return { walls, openings, selection: { type: 'wall', id: id1 } };
  }),

  // copy one wall's thickness / height / color / material onto every wall
  applyWallStyleToAll: (id) => get().commit((s) => {
    const w = s.walls.find((x) => x.id === id);
    if (!w) return {};
    const { thickness, height, color, material } = w;
    return { walls: s.walls.map((x) => ({ ...x, thickness, height, color, material })) };
  }),

  // ---- rooms (4 connected walls from two opposite corners) ----
  addRoom: (p0, p1) => {
    const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x);
    const y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return; // too small / degenerate
    const c = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    get().commit((s) => ({
      walls: [
        ...s.walls,
        ...c.map((a, i) => ({ id: uid('wall'), a, b: c[(i + 1) % 4], thickness: s.wallThickness, color: s.wallColor, height: s.wallHeight, material: s.wallMaterial, exterior: true })),
      ],
    }));
  },

  // ---- fences ----
  addFence: (a, b) => {
    const id = uid('fence');
    get().commit((s) => {
      const isMesh = FENCE_TYPES[s.fenceType]?.style === 'mesh';
      const f = { id, a, b, fenceType: s.fenceType, height: s.fenceHeight, postSpacing: s.postSpacing, color: s.fenceColor, cap: s.picketCap };
      if (isMesh) Object.assign(f, { slats: s.fenceSlats, slatColor: s.fenceSlatColor, barbed: s.fenceBarbed });
      return { fences: [...s.fences, f] };
    });
    return id;
  },

  // ---- openings (door/window/opening on a wall) ----
  addOpening: (wallId, type, t) => {
    const def = OPENING_DEFAULTS[type];
    const id = uid('op');
    get().commit((s) => {
      let op;
      if (type === 'window') {
        // windows take their proportions from the chosen style
        const st = WINDOW_STYLES[s.windowStyle] || WINDOW_STYLES.slider;
        op = { id, wallId, type, t, width: st.w, height: st.h, sill: st.sill, style: s.windowStyle, grid: s.windowGrid };
      } else {
        op = { id, wallId, type, t, width: s.openingWidth || def.width, height: def.height, ...(def.sill ? { sill: def.sill } : {}) };
      }
      return { openings: [...s.openings, op] };
    });
    return id;
  },

  // ---- gates on a fence ----
  addGate: (fenceId, t) => {
    const id = uid('gate');
    get().commit((s) => {
      const f = s.fences.find((x) => x.id === fenceId);
      const material = f?.fenceType || s.fenceType;
      const color = f?.color || FENCE_TYPES[material]?.color;
      // match the fence: inherit its picket top, barbed-wire top, and privacy slats
      const cap = f?.cap || FENCE_TYPES[material]?.cap;
      const barbed = !!f?.barbed;
      const slats = !!f?.slats;
      const slatColor = f?.slatColor;
      const height = f?.height ?? s.fenceHeight;
      return { gates: [...s.gates, { id, fenceId, t, width: s.gateWidth, height, gateType: s.gateStyle, material, color, cap, barbed, slats, slatColor }] };
    });
    return id;
  },

  // ---- extra fence posts (placed individually, on top of the auto-spaced posts) ----
  addPost: (fenceId, t) => {
    const id = uid('post');
    get().commit((s) => {
      const f = s.fences.find((x) => x.id === fenceId);
      const height = f?.height ?? s.fenceHeight;
      const material = f?.fenceType || s.fenceType;
      const color = f?.color || FENCE_TYPES[material]?.color;
      return { posts: [...s.posts, { id, fenceId, t, height, material, color }] };
    });
    return id;
  },

  // ---- labels (leader-line callouts) ----
  addLabel: (anchor) => {
    const id = uid('label');
    get().commit((s) => ({
      labels: [...s.labels, {
        id, anchor: { x: anchor.x, y: anchor.y }, pos: { x: anchor.x + 3, y: anchor.y - 3 },
        text: 'Label', fontSize: 12, ...s.labelColors,
      }],
    }));
    return id;
  },

  // a centered, leader-less label (used for auto room-area tags on loop close)
  addRoomLabel: (pt, text) => {
    const id = uid('label');
    get().commit((s) => ({
      labels: [...s.labels, {
        id, anchor: { x: pt.x, y: pt.y }, pos: { x: pt.x, y: pt.y },
        text, fontSize: 12, room: true, ...s.labelColors,
      }],
    }));
    return id;
  },

  // ---- stairs ----
  addStair: (pt) => {
    const id = uid('stair');
    get().commit((s) => ({
      stairs: [...s.stairs, { id, x: pt.x, y: pt.y, type: s.stairType, width: s.stairWidth, steps: s.stairSteps, rotation: 0 }],
    }));
    return id;
  },

  // ---- generic update of any element (no history per drag-tick; commit on end) ----
  // move a shared corner: set the given endpoints (joints = [{id, end}]) of one
  // element type to `pt` in a single update, so connected walls/fences follow
  // the corner as one (no history per drag-tick; commit on release).
  moveJoints: (type, joints, pt) => {
    const key = type + 's';
    const ends = new Map(joints.map((j) => [j.id, j.end]));
    set((s) => ({ [key]: s[key].map((e) => ends.has(e.id) ? { ...e, [ends.get(e.id)]: { x: pt.x, y: pt.y } } : e) }));
  },

  updateElement: (type, id, patch, withHistory = false) => {
    const key = type + 's';
    const apply = (s) => ({ [key]: s[key].map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    if (withHistory) get().commit(apply);
    else set(apply);
  },

  deleteElement: (type, id) =>
    get().commit((s) => {
      const key = type + 's';
      const out = { [key]: s[key].filter((e) => e.id !== id) };
      // cascade: remove openings on a deleted wall / gates on a deleted fence
      if (type === 'wall') out.openings = s.openings.filter((o) => o.wallId !== id);
      if (type === 'fence') { out.gates = s.gates.filter((g) => g.fenceId !== id); out.posts = s.posts.filter((p) => p.fenceId !== id); }
      return out;
    }),

  // delete the whole marquee group (or the single selection)
  deleteSelected: () => {
    const { multi, selection } = get();
    const items = multi.length ? multi : (selection ? [selection] : []);
    if (!items.length) return;
    const ids = {}; items.forEach((it) => (ids[it.type] ||= new Set()).add(it.id));
    get().commit((s) => {
      const out = {};
      for (const type in ids) out[type + 's'] = s[type + 's'].filter((e) => !ids[type].has(e.id));
      if (ids.wall) out.openings = s.openings.filter((o) => !ids.wall.has(o.wallId));
      if (ids.fence) { out.gates = s.gates.filter((g) => !ids.fence.has(g.fenceId)); out.posts = s.posts.filter((p) => !ids.fence.has(p.fenceId)); }
      return out;
    });
    set({ selection: null, multi: [] });
  },

  // translate a group by (dx,dy) feet during a drag (no per-tick history; commit
  // on release via the drag system). walls/fences move both ends; stairs/labels
  // move their anchor; openings/gates/posts ride their host wall/fence.
  translateSelection: (items, dx, dy) => set((s) => {
    const ids = {}; items.forEach((it) => (ids[it.type] ||= new Set()).add(it.id));
    const seg = (e) => ({ ...e, a: { x: e.a.x + dx, y: e.a.y + dy }, b: { x: e.b.x + dx, y: e.b.y + dy } });
    const out = {};
    if (ids.wall) out.walls = s.walls.map((w) => ids.wall.has(w.id) ? seg(w) : w);
    if (ids.fence) out.fences = s.fences.map((f) => ids.fence.has(f.id) ? seg(f) : f);
    if (ids.stair) out.stairs = s.stairs.map((st) => ids.stair.has(st.id) ? { ...st, x: st.x + dx, y: st.y + dy } : st);
    if (ids.label) out.labels = s.labels.map((l) => ids.label.has(l.id) ? { ...l, pos: { x: l.pos.x + dx, y: l.pos.y + dy }, anchor: { x: l.anchor.x + dx, y: l.anchor.y + dy } } : l);
    return out;
  }),

  // arrow-key nudge of the whole selection by one grid unit (dx,dy in cells)
  nudgeSelected: (dx, dy) => {
    const { multi, selection } = get();
    const items = multi.length ? multi : (selection ? [selection] : []);
    if (!items.length) return;
    const step = get().grid || 1, mx = dx * step, my = dy * step;
    const ids = {}; items.forEach((it) => (ids[it.type] ||= new Set()).add(it.id));
    get().commit((s) => {
      const seg = (e) => ({ ...e, a: { x: e.a.x + mx, y: e.a.y + my }, b: { x: e.b.x + mx, y: e.b.y + my } });
      const out = {};
      if (ids.wall) out.walls = s.walls.map((w) => ids.wall.has(w.id) ? seg(w) : w);
      if (ids.fence) out.fences = s.fences.map((f) => ids.fence.has(f.id) ? seg(f) : f);
      if (ids.stair) out.stairs = s.stairs.map((st) => ids.stair.has(st.id) ? { ...st, x: st.x + mx, y: st.y + my } : st);
      if (ids.label) out.labels = s.labels.map((l) => ids.label.has(l.id) ? { ...l, pos: { x: l.pos.x + mx, y: l.pos.y + my }, anchor: { x: l.anchor.x + mx, y: l.anchor.y + my } } : l);
      for (const type of ['opening', 'gate', 'post']) if (ids[type]) out[type + 's'] = s[type + 's'].map((e) => ids[type].has(e.id) ? { ...e, t: Math.max(0, Math.min(1, e.t + dx * 0.04)) } : e);
      return out;
    });
  },

  // ---- plan-level ----
  newPlan: () =>
    set((s) => ({
      past: [...s.past, snapshot(s)],
      future: [],
      walls: [], openings: [], fences: [], gates: [], posts: [], labels: [], stairs: [],
      selection: null,
    })),

  // ---- pages ----
  addPage: () => set((s) => {
    const id = uid('page');
    return {
      pageStore: { ...s.pageStore, [s.activePage]: geomOf(s) }, // park current page
      pages: [...s.pages, { id, name: `Page ${s.pages.length + 1}` }],
      activePage: id,
      ...emptyGeom(),
      selection: null, elevationTarget: null, past: [], future: [],
    };
  }),
  switchPage: (id) => set((s) => {
    if (id === s.activePage || !s.pages.some((p) => p.id === id)) return {};
    const target = s.pageStore[id] || emptyGeom();
    return {
      pageStore: { ...s.pageStore, [s.activePage]: geomOf(s) },
      activePage: id,
      ...target,
      selection: null, elevationTarget: null, past: [], future: [],
    };
  }),
  renamePage: (id, name) => set((s) => ({ pages: s.pages.map((p) => p.id === id ? { ...p, name: name || p.name } : p) })),
  deletePage: (id) => set((s) => {
    if (s.pages.length <= 1) return {}; // always keep at least one page
    const pages = s.pages.filter((p) => p.id !== id);
    const pageStore = { ...s.pageStore }; delete pageStore[id];
    if (id !== s.activePage) return { pages, pageStore };
    const next = pages[0].id, target = pageStore[next] || emptyGeom();
    return { pages, pageStore, activePage: next, ...target, selection: null, elevationTarget: null, past: [], future: [] };
  }),

  loadSample: () => set((s) => ({ past: [...s.past, snapshot(s)], future: [], ...samplePlan(), selection: null })),

  exportPlan: () => {
    const s = get();
    const pages = s.pages.map((p) => ({ id: p.id, name: p.name, geom: p.id === s.activePage ? geomOf(s) : (s.pageStore[p.id] || emptyGeom()) }));
    return {
      meta: { app: 'wall-fence-plan-maker', version: 2, units: 'feet', exported: new Date().toISOString() },
      settings: { scale: s.scale, grid: s.grid, wallHeight: s.wallHeight },
      pages, activePage: s.activePage,
      ...geomOf(s), // top-level = active page (back-compat with v1 readers)
    };
  },

  loadPlan: (data) =>
    set((s) => {
      // v2: multi-page project · v1 (or external): single page
      if (Array.isArray(data.pages) && data.pages.length) {
        const active = data.activePage && data.pages.some((p) => p.id === data.activePage) ? data.activePage : data.pages[0].id;
        const pageStore = {};
        for (const p of data.pages) if (p.id !== active) pageStore[p.id] = { ...emptyGeom(), ...(p.geom || {}) };
        const liveGeom = { ...emptyGeom(), ...((data.pages.find((p) => p.id === active) || {}).geom || {}) };
        return { past: [], future: [], selection: null, elevationTarget: null, pages: data.pages.map((p) => ({ id: p.id, name: p.name })), activePage: active, pageStore, ...liveGeom };
      }
      return {
        past: [], future: [], selection: null, elevationTarget: null,
        pages: [{ id: 'page1', name: 'Page 1' }], activePage: 'page1', pageStore: {},
        walls: data.walls || [], openings: data.openings || [], fences: data.fences || [], gates: data.gates || [], posts: data.posts || [], labels: data.labels || [], stairs: data.stairs || [],
      };
    }),
}));

// autosave the project to localStorage on any change (debounced)
if (typeof localStorage !== 'undefined') {
  let _t;
  useStore.subscribe((s) => {
    clearTimeout(_t);
    _t = setTimeout(() => {
      try { localStorage.setItem(PERSIST_KEY, JSON.stringify(serializeProject(s))); } catch { /* quota / private mode */ }
    }, 400);
  });
}
