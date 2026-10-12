import { tavilyKey } from '../config.js';

export class ToolError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ToolError';
  }
}

/**
 * Search the web via Tavily API with images, favicons, and metadata.
 * @param {object} env - Cloudflare Worker env bindings
 * @param {string} query
 * @param {number} [maxResults=5]
 * @returns {Promise<Array<{title: string, url: string, domain: string, snippet: string, favicon: string, thumbnail: string|null}>>}
 */
export async function search(env, query, maxResults = 5) {
  const key = tavilyKey(env);
  if (!key) {
    throw new ToolError('TAVILY_API_KEY is not set');
  }

  let raw = [];
  let topImages = [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query.slice(0, 300),
        max_results: maxResults,
        search_depth: 'basic',
        include_images: true,
      }),
    });

    if (!res.ok) {
      console.error(`Tavily returned HTTP ${res.status}`);
      throw new ToolError('http error');
    }

    const data = await res.json();
    raw = data.results || [];
    if (Array.isArray(data.images)) {
      topImages = data.images
        .map((img) => (typeof img === 'string' ? img : img?.url))
        .filter(Boolean);
    }
  } catch (e) {
    if (e instanceof ToolError) throw e;
    console.error('Tavily failure:', e.message);
    throw new ToolError('transport');
  }

  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const url = item.url;
    if (!url || !item.title) continue;
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // skip malformed URLs
      continue;
    }

    const favicon = domain
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
      : '';
    const thumbnail = item.image || item.thumbnail || topImages[i] || null;

    out.push({
      title: item.title.trim(),
      url,
      domain,
      snippet: (item.content || '').trim().slice(0, 220),
      favicon,
      thumbnail,
    });
  }

  return out;
}
