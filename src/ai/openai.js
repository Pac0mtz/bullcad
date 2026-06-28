// Minimal OpenAI Chat Completions client (function-calling). No SDK — a plain
// fetch keeps the bundle lean and works with any OpenAI-compatible endpoint
// (OpenAI, Azure OpenAI, local servers, or your own proxy) via config.baseURL.
export async function chatCompletion({ messages, tools, config, signal }) {
  const url = `${config.baseURL.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
    }),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message;
}
