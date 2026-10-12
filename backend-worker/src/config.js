/**
 * Config helpers — reads from Cloudflare Worker env bindings.
 * In Workers, env vars are passed as the `env` parameter to fetch(),
 * not via process.env.
 */

export function groqKey(env) {
  return env?.GROQ_API_KEY || '';
}

export function groqModel(env) {
  return env?.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

export function tavilyKey(env) {
  return env?.TAVILY_API_KEY || '';
}

/**
 * Return strict, normalized CORS allowlist array from environment.
 * Default includes local dev origins if CORS_ORIGINS is not set.
 */
export function corsOrigins(env) {
  const raw = env?.CORS_ORIGINS || '';
  const productionOrigins = [
    'https://milo-voice.pages.dev',
    'https://milo-frontend.pages.dev',
  ];
  if (!raw) {
    return [
      ...productionOrigins,
      'http://localhost:5173',
      'http://localhost:4173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4173',
    ];
  }
  const origins = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  for (const prod of productionOrigins) {
    if (!origins.includes(prod)) {
      origins.push(prod);
    }
  }
  return origins;
}
