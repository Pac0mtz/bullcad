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
      'IMAGE TRACING MODE — the user attached a photo/sketch/aerial of a layout to reproduce as geometry:',
      '1. SCALE: read any dimension labels, a scale bar, or known references in the image to work out feet-per-pixel,',
      '   so every coordinate you emit is in REAL FEET. State the scale and how you derived it in your reply.',
      '   If nothing in the image gives a scale, do NOT guess silently — make a clear assumption (e.g. treat the',
      '   longest wall as a round number), say so, and tell the user how to correct it.',
      '2. TRACE: build the layout with the tools. Use add_room for rectangular rooms; add_wall for other segments;',
      '   add_fence for fence lines; add a door/window with add_opening where the drawing clearly shows one.',
      '3. Start the drawing near origin (0,0) unless the existing plan suggests otherwise. Square up near-orthogonal',
      '   lines and round dimensions to sensible values; aim for a clean, editable result, not pixel-perfect tracing.',
      '4. Finish with a short summary: overall size, room count, and the scale you used.',
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
