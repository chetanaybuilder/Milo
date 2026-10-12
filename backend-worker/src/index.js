import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { corsOrigins, groqKey, tavilyKey } from './config.js';
import { respond } from './assistant/controller.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// Security: Redact API keys and secrets from any logged string
// ---------------------------------------------------------------------------
const REDACT_RE = /(gsk_[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]+)/gi;
function redact(str) {
  return typeof str === 'string' ? str.replace(REDACT_RE, '[REDACTED]') : str;
}

// ---------------------------------------------------------------------------
// Rate limiting (token bucket per IP with LRU pruning to prevent memory exhaustion)
// ---------------------------------------------------------------------------
const RATE_LIMIT_CAPACITY = 30; // Maximum burst tokens
const RATE_LIMIT_REFILL = 0.5; // Tokens added per second (30 requests/minute sustained)
const MAX_TRACKED_IPS = 5000; // Hard cap on memory map size
const IP_INACTIVE_TTL = 600; // Evict IPs inactive for 10 minutes

const buckets = new Map();
let requestCounter = 0;

function pruneBuckets(now) {
  for (const [ip, b] of buckets.entries()) {
    if (now - b.last > IP_INACTIVE_TTL) {
      buckets.delete(ip);
    }
  }
  // If still above cap, evict oldest entries
  if (buckets.size > MAX_TRACKED_IPS) {
    const keysToDelete = Array.from(buckets.keys()).slice(0, 1000);
    for (const k of keysToDelete) buckets.delete(k);
  }
}

function checkRateLimit(ip) {
  const now = Date.now() / 1000;

  // Periodic pruning every 50 checks
  if (++requestCounter % 50 === 0) {
    pruneBuckets(now);
  }

  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_CAPACITY - 1, last: now };
    buckets.set(ip, bucket);
    return true;
  }

  const elapsed = Math.max(0, now - bucket.last);
  bucket.tokens = Math.min(RATE_LIMIT_CAPACITY, bucket.tokens + elapsed * RATE_LIMIT_REFILL);
  bucket.last = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

function extractClientIp(c) {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp && typeof cfIp === 'string' && cfIp.length <= 45) {
    return cfIp.trim();
  }
  const xReal = c.req.header('x-real-ip');
  if (xReal && typeof xReal === 'string' && xReal.length <= 45) {
    return xReal.trim();
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// CORS middleware — strict allowlist, no arbitrary wildcards
// ---------------------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  const allowed = corsOrigins(c.env);
  const corsMiddleware = cors({
    origin: (requestOrigin) => {
      if (!requestOrigin) return null; // Reject requests without Origin header or null origins
      const norm = requestOrigin.replace(/\/+$/, '');
      if (allowed.includes(norm)) return norm;
      return null; // Deny by default
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// ---------------------------------------------------------------------------
// Security headers middleware (Defense-in-depth on all API responses)
// ---------------------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
});

// ---------------------------------------------------------------------------
// Request size limits middleware (strict 64 KB cap for chat API)
// ---------------------------------------------------------------------------
app.use('/api/chat', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const length = parseInt(c.req.header('content-length') || '0', 10);
  if (length > 65536) {
    return c.json({ detail: 'Payload too large (max 64 KB)' }, 413);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Rate limit middleware for chat endpoint
// ---------------------------------------------------------------------------
app.use('/api/chat', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const ip = extractClientIp(c);
  if (!checkRateLimit(ip)) {
    c.header('Retry-After', '60');
    c.header('X-RateLimit-Limit', '30');
    return c.json({ detail: 'Too many requests. Please wait a moment.' }, 429);
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
app.get('/robots.txt', (c) =>
  c.text('User-agent: *\nDisallow: /', 200, { 'Content-Type': 'text/plain' })
);

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
    return c.json({ detail: 'Invalid JSON payload' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return c.json({ detail: 'Request body must be an object' }, 400);
  }

  // Input validation: message
  if (typeof body.message !== 'string') {
    return c.json({ detail: 'message field must be a string' }, 400);
  }

  const rawMessage = body.message.trim();
  // Strip dangerous ASCII control characters
  const cleanMessage = rawMessage.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  if (!cleanMessage || cleanMessage.length > 2000) {
    return c.json({ detail: 'message must be between 1 and 2,000 characters' }, 400);
  }

  // Input validation: history array (role sanitization & length limits)
  const validatedHistory = [];
  if (Array.isArray(body.history)) {
    const rawHistory = body.history.slice(-10); // Cap history to last 10 messages
    for (const h of rawHistory) {
      if (h && typeof h === 'object') {
        const role = String(h.role || '').toLowerCase();
        // Strictly allow only 'user' or 'assistant' roles (block injected 'system' role)
        if (role === 'user' || role === 'assistant') {
          const content = String(h.content || '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .slice(0, 1200);
          if (content.trim()) {
            validatedHistory.push({ role, content });
          }
        }
      }
    }
  }

  // respond() returns a Response with a ReadableStream body
  return respond(c.env, cleanMessage, validatedHistory);
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.all('*', (c) => c.json({ detail: 'Not found' }, 404));

export default app;
