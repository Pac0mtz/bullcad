// The toolbox the assistant can call. Schemas are in OpenAI function-calling
// format (works with OpenAI, Azure OpenAI, and most compatible providers).
// `executeTool` runs a single call against the zustand store and returns a short
// text result for the model to read. Every mutation goes through the store's
// `commit`, so AI edits land on the normal undo stack — the user can Ctrl+Z.
import { useStore } from '../store.js';
import { FENCE_TYPES } from '../utils/geometry.js';
import { planSummaryText } from './summary.js';

const num = (d) => ({ type: 'number', description: d });

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_plan',
      description: 'Read the current plan: every wall/fence/opening/gate with its id, coordinates (feet) and sizes, plus detected rooms and overall bounds. Call this whenever you need fresh ids or to verify a change.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_wall',
      description: 'Add a single straight wall between two points (feet). Coordinates: x→right, y→down.',
      parameters: {
        type: 'object',
        properties: { x1: num('start x'), y1: num('start y'), x2: num('end x'), y2: num('end y'), thickness_inches: num('optional wall thickness in inches (default 6)') },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_room',
      description: 'Add a rectangular room (4 connected exterior walls) from two opposite corners (feet).',
      parameters: {
        type: 'object',
        properties: { x1: num('corner x'), y1: num('corner y'), x2: num('opposite corner x'), y2: num('opposite corner y') },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_fence',
      description: 'Add a straight fence run between two points (feet).',
      parameters: {
        type: 'object',
        properties: {
          x1: num('start x'), y1: num('start y'), x2: num('end x'), y2: num('end y'),
          fence_type: { type: 'string', enum: Object.keys(FENCE_TYPES), description: 'fence material/style' },
          height_feet: num('optional fence height in feet'),
        },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_opening',
      description: 'Add a door, window, or plain opening onto an existing wall. Use a wall_id from get_plan. position is 0..1 along the wall (0.5 = centered).',
      parameters: {
        type: 'object',
        properties: {
          wall_id: { type: 'string' },
          kind: { type: 'string', enum: ['door', 'window', 'opening'] },
          position: num('0..1 along the wall, default 0.5'),
          width_feet: num('optional width in feet'),
        },
        required: ['wall_id', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_gate',
      description: 'Add a gate onto an existing fence. Use a fence_id from get_plan. position is 0..1 along the fence.',
      parameters: {
        type: 'object',
        properties: { fence_id: { type: 'string' }, position: num('0..1 along the fence, default 0.5'), width_feet: num('optional gate width in feet') },
        required: ['fence_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_wall',
      description: 'Change properties of an existing wall by id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          thickness_inches: num('new thickness in inches'),
          height_feet: num('new height in feet'),
          material: { type: 'string', description: 'e.g. drywall, brick, concrete' },
          exterior: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_opening',
      description: 'Change an existing door/window/opening by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, width_feet: num('new width in feet'), height_feet: num('new height in feet'), position: num('new 0..1 position along the wall') },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_fence',
      description: 'Change an existing fence by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, fence_type: { type: 'string', enum: Object.keys(FENCE_TYPES) }, height_feet: num('new height in feet') },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_element',
      description: 'Translate an element by an offset in feet. Walls/fences move both ends; stairs/labels move their anchor.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['wall', 'fence', 'stair', 'label'] },
          id: { type: 'string' },
          dx_feet: num('offset along x (right is +)'),
          dy_feet: num('offset along y (down is +)'),
        },
        required: ['type', 'id', 'dx_feet', 'dy_feet'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_element',
      description: 'Delete an element by type and id. Deleting a wall removes its openings; deleting a fence removes its gates/posts.',
      parameters: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['wall', 'fence', 'opening', 'gate', 'post', 'stair', 'label'] }, id: { type: 'string' } },
        required: ['type', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_plan',
      description: 'Erase everything on the current page. Only do this when the user clearly asks to start over.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ---- executor ----
const ok = (msg, extra) => JSON.stringify({ ok: true, message: msg, ...extra });
const err = (msg) => JSON.stringify({ ok: false, error: msg });

export function executeTool(name, args = {}) {
  const st = useStore.getState();
  try {
    switch (name) {
      case 'get_plan':
        return planSummaryText(useStore.getState());

      case 'add_wall': {
        const id = st.addWall({ x: args.x1, y: args.y1 }, { x: args.x2, y: args.y2 });
        if (args.thickness_inches) st.updateElement('wall', id, { thickness: args.thickness_inches / 12 });
        return ok('wall added', { id });
      }
      case 'add_room': {
        st.addRoom({ x: args.x1, y: args.y1 }, { x: args.x2, y: args.y2 });
        return ok('room added (4 walls)');
      }
      case 'add_fence': {
        const id = st.addFence({ x: args.x1, y: args.y1 }, { x: args.x2, y: args.y2 });
        const patch = {};
        if (args.fence_type && FENCE_TYPES[args.fence_type]) patch.fenceType = args.fence_type;
        if (args.height_feet) patch.height = args.height_feet;
        if (Object.keys(patch).length) st.updateElement('fence', id, patch);
        return ok('fence added', { id });
      }
      case 'add_opening': {
        const w = st.walls.find((x) => x.id === args.wall_id);
        if (!w) return err(`no wall with id ${args.wall_id}`);
        const t = args.position == null ? 0.5 : Math.max(0, Math.min(1, args.position));
        const id = st.addOpening(args.wall_id, args.kind, t);
        if (args.width_feet) st.updateElement('opening', id, { width: args.width_feet });
        return ok(`${args.kind} added`, { id });
      }
      case 'add_gate': {
        const f = st.fences.find((x) => x.id === args.fence_id);
        if (!f) return err(`no fence with id ${args.fence_id}`);
        const t = args.position == null ? 0.5 : Math.max(0, Math.min(1, args.position));
        const id = st.addGate(args.fence_id, t);
        if (args.width_feet) st.updateElement('gate', id, { width: args.width_feet });
        return ok('gate added', { id });
      }
      case 'update_wall': {
        if (!st.walls.some((w) => w.id === args.id)) return err(`no wall with id ${args.id}`);
        const patch = {};
        if (args.thickness_inches != null) patch.thickness = args.thickness_inches / 12;
        if (args.height_feet != null) patch.height = args.height_feet;
        if (args.material != null) patch.material = args.material;
        if (args.exterior != null) patch.exterior = args.exterior;
        st.updateElement('wall', args.id, patch, true);
        return ok('wall updated');
      }
      case 'update_opening': {
        if (!st.openings.some((o) => o.id === args.id)) return err(`no opening with id ${args.id}`);
        const patch = {};
        if (args.width_feet != null) patch.width = args.width_feet;
        if (args.height_feet != null) patch.height = args.height_feet;
        if (args.position != null) patch.t = Math.max(0, Math.min(1, args.position));
        st.updateElement('opening', args.id, patch, true);
        return ok('opening updated');
      }
      case 'update_fence': {
        if (!st.fences.some((f) => f.id === args.id)) return err(`no fence with id ${args.id}`);
        const patch = {};
        if (args.fence_type && FENCE_TYPES[args.fence_type]) patch.fenceType = args.fence_type;
        if (args.height_feet != null) patch.height = args.height_feet;
        st.updateElement('fence', args.id, patch, true);
        return ok('fence updated');
      }
      case 'move_element': {
        const key = args.type + 's';
        const el = (st[key] || []).find((e) => e.id === args.id);
        if (!el) return err(`no ${args.type} with id ${args.id}`);
        const dx = args.dx_feet, dy = args.dy_feet;
        let patch;
        if (args.type === 'wall' || args.type === 'fence') patch = { a: { x: el.a.x + dx, y: el.a.y + dy }, b: { x: el.b.x + dx, y: el.b.y + dy } };
        else if (args.type === 'stair') patch = { x: el.x + dx, y: el.y + dy };
        else if (args.type === 'label') patch = { pos: { x: el.pos.x + dx, y: el.pos.y + dy }, anchor: { x: el.anchor.x + dx, y: el.anchor.y + dy } };
        st.updateElement(args.type, args.id, patch, true);
        return ok(`${args.type} moved`);
      }
      case 'delete_element': {
        const key = args.type + 's';
        if (!(st[key] || []).some((e) => e.id === args.id)) return err(`no ${args.type} with id ${args.id}`);
        st.deleteElement(args.type, args.id);
        return ok(`${args.type} deleted`);
      }
      case 'clear_plan':
        st.newPlan();
        return ok('plan cleared');

      default:
        return err(`unknown tool: ${name}`);
    }
  } catch (e) {
    return err(String(e?.message || e));
  }
}
