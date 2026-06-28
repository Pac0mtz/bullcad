// AI provider configuration — persisted locally so the key/model survive reloads.
// Designed OpenAI-first but provider-agnostic: `baseURL` lets you point at the
// OpenAI API, Azure OpenAI, a local model, or your own proxy (so the key never
// has to live in the browser). The request shape is the OpenAI Chat Completions
// + tools (function-calling) format, which most providers now speak.
const KEY = 'planforge:ai:v1';

export const DEFAULT_CONFIG = {
  provider: 'openai',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
};

export function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* private mode / quota — config just won't persist */
  }
}

export const isConfigured = (cfg) => !!(cfg && cfg.apiKey && cfg.model && cfg.baseURL);
