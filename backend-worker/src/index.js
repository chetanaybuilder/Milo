import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { corsOrigins, groqKey, tavilyKey } from './config.js';
import { respond } from './assistant/controller.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// Security: Redact API keys from any logged string
// ---------------------------------------------------------------------------
const REDACT_RE = /(gsk_[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{20,})/g;
function redact(str) {
  return typeof str === 'string' ? str.replace(REDACT_RE, '[REDACTED]') : str;
}

// ---------------------------------------------------------------------------
// Rate limiting (token bucket per IP, stored in-memory)
// ---------------------------------------------------------------------------
const RATE_LIMIT_TOKENS = 60;
const RATE_LIMIT_REFILL = 1.0; // tokens per second
const buckets = new Map();

function checkRateLimit(ip) {
  const now = Date.now() / 1000;
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_TOKENS, last: now };
    buckets.set(ip, bucket);
    return true;
  }
  const elapsed = now - bucket.last;
  bucket.tokens = Math.min(RATE_LIMIT_TOKENS, bucket.tokens + elapsed * RATE_LIMIT_REFILL);
  bucket.last = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// CORS middleware — configured per-request from env
// ---------------------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  const origins = corsOrigins(c.env);
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (origins.includes('*') || origins.includes(origin)) return origin;
      if (
        origin.endsWith('.pages.dev') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      )
        return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  return corsMiddleware(c, next);
});

// ---------------------------------------------------------------------------
// Security headers middleware
// ---------------------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  c.header('Cache-Control', 'no-store');
});

// ---------------------------------------------------------------------------
// Rate limit middleware for chat endpoint
// ---------------------------------------------------------------------------
app.use('/api/chat', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return c.json({ detail: 'Too many requests' }, 429);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Max body size middleware (1 MB)
// ---------------------------------------------------------------------------
app.use('/api/chat', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const length = parseInt(c.req.header('content-length') || '0', 10);
  if (length > 1048576) {
    return c.json({ detail: 'Payload too large' }, 413);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/', (c) =>
  c.json({
    name: 'milo-api',
    status: 'ok',
    endpoints: {
      health: '/api/health',
      chat: '/api/chat',
    },
  })
);

app.get('/favicon.ico', (c) => c.text('', 204));
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /', 200, { 'Content-Type': 'text/plain' }));

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    groq_configured: Boolean(groqKey(c.env)),
    search_configured: Boolean(tavilyKey(c.env)),
  });
});

app.post('/api/chat', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ detail: 'Invalid JSON' }, 400);
  }

  const message = (body.message || '').trim();
  if (!message || message.length > 2000) {
    return c.json({ detail: 'message must be 1-2000 chars' }, 400);
  }

  const history = Array.isArray(body.history) ? body.history.slice(0, 50) : [];

  // respond() returns a Response with a ReadableStream body
  const streamResponse = respond(c.env, message, history);

  // Copy headers to the Hono response
  return streamResponse;
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.all('*', (c) => c.json({ detail: 'Not found' }, 404));

export default app;
