/**
 * Config helpers — reads from Cloudflare Worker env bindings.
 * In Workers, env vars are passed as the `env` parameter to fetch(),
 * not via process.env.
 */

export function groqKey(env) {
  return env.GROQ_API_KEY || '';
}

export function groqModel(env) {
  return env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

export function tavilyKey(env) {
  return env.TAVILY_API_KEY || '';
}

export function corsOrigins(env) {
  const raw = env.CORS_ORIGINS || 'http://localhost:5173';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}
