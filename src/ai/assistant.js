// The agent loop: send the user's message + a fresh plan snapshot, let the model
// call tools to edit the plan, feed results back, and repeat until it answers.
import { useStore } from '../store.js';
import { chatCompletion } from './openai.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { planSummaryText } from './summary.js';

const MAX_STEPS = 10; // safety cap on tool round-trips per user message

function systemPrompt({ hasImage } = {}) {
  const lines = [
    'You are the in-app design assistant for PlanForge, a 2D architectural + site plan editor.',
    'You help the user build and edit the plan, and you answer questions / review the plan.',
    '',
    'Coordinate system: units are FEET. x increases to the right, y increases DOWNWARD.',
    'To CHANGE the plan you MUST call the provided tools — never claim a change you did not make with a tool.',
    'Element ids come from get_plan or from a tool result; never invent ids. When unsure of the current',
    'geometry (ids, positions, what already exists), call get_plan first.',
    '',
    'Guidance:',
    '- Place new geometry near the existing drawing using the bounds from the plan snapshot, unless told otherwise.',
    '- Prefer add_room for rectangular rooms; use add_wall for individual segments.',
    '- Keep edits minimal and only do what was asked. Every change is undoable, so act decisively.',
    '- After making changes, reply with a brief, plain-English summary of what you did (with key sizes).',
    '- For review/estimate questions, read the plan and answer concretely (lengths, areas, counts); no tool call needed.',
  ];
  if (hasImage) {
    lines.push(
      '',
      'IMAGE TRACING MODE — the user attached a photo/sketch/aerial/PDF page of a floor plan to reproduce:',
      '1. SCALE: read any dimension labels, a scale bar, or known references to work out feet-per-pixel, so every',
      '   coordinate you emit is in REAL FEET. State the scale and how you derived it. If nothing gives a scale, make a',
      '   clear assumption (e.g. treat the longest wall as a round number), say so, and tell the user how to correct it.',
      '',
      'ROOMS ARE THE PRIORITY. A "room" here is DETECTED automatically from a CLOSED LOOP of connected walls — it is',
      'never added directly. So you MUST produce closed, connected wall loops or no rooms appear. Rules:',
      '  • Identify EVERY room in the image (count them first) and reproduce each one.',
      '  • For a rectangular room, use add_room with its two opposite corners — that emits 4 connected walls at once.',
      '  • Build the whole layout on a shared grid of corner coordinates. Endpoints that touch MUST be the SAME number',
      '    (e.g. a partition that meets a wall at x=20 must use exactly 20, not 19.9). Walls auto-weld on commit, so',
      '    coincident endpoints merge into one shared wall — adjacent rooms should share their dividing wall exactly.',
      '  • For a multi-room building: first add_room (or walls) for the outer shell, THEN add interior partition walls',
      '    whose endpoints land EXACTLY on the shell walls, splitting the interior into the separate rooms.',
      '  • For an L-shaped / non-rectangular room, add_wall around a closed loop where each segment ends exactly where',
      '    the next begins, returning to the start point.',
      '  • Round all corner coordinates to whole inches (or whole feet) so endpoints align cleanly. Square up walls.',
      '2. Also add fences (add_fence), and doors/windows (add_opening) where the drawing clearly shows them.',
      '3. Start near origin (0,0) unless the existing plan suggests otherwise.',
      '4. VERIFY: after tracing, call get_plan and check the detected room count matches what you see in the image.',
      '   If a room is missing, a wall loop is not closed — fix the offending endpoints so they coincide, then re-check.',
      '5. Finish with a short summary: overall size, the ROOM COUNT detected, and the scale you used.',
    );
  }
  lines.push('', 'Current plan snapshot (JSON):', planSummaryText(useStore.getState()));
  return lines.join('\n');
}

// userText: the typed instruction (optional when an image is attached).
// image: optional data URL (jpeg/png) to trace.
// history: prior [{role:'user'|'assistant', content}] turns (text only).
// onStep: optional callback(stepInfo) for UI status while tools run.
export async function runAssistant({ userText, image = null, history = [], config, onStep, signal }) {
  const userContent = image
    ? [
        { type: 'text', text: userText || 'Trace this drawing into the plan. Read the dimensions to set the scale.' },
        { type: 'image_url', image_url: { url: image, detail: 'high' } },
      ]
    : userText;
  const messages = [
    { role: 'system', content: systemPrompt({ hasImage: !!image }) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ];

  const toolsUsed = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await chatCompletion({ messages, tools: TOOL_SCHEMAS, config, signal });
    if (!msg) throw new Error('Empty response from the model.');
    messages.push(msg);

    const calls = msg.tool_calls || [];
    if (!calls.length) {
      return { text: msg.content || '', toolsUsed };
    }

    for (const tc of calls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* malformed args */ }
      onStep?.({ tool: tc.function.name, args });
      const result = executeTool(tc.function.name, args);
      toolsUsed.push(tc.function.name);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }
  return { text: "I made several changes but stopped to avoid looping — check the canvas and let me know if you'd like more.", toolsUsed };
}
