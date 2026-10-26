// Whether the user let their AI agent delete personalized pages without asking first.
// Only the user can change this (confirmation overlay or settings); MCP tools cannot.
const KEY = 'luna-personalized-agent-auto-delete';

export function agentMayDeleteAutomatically() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAgentMayDeleteAutomatically(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* Private window or blocked storage: the agent keeps having to ask. */
  }
}
