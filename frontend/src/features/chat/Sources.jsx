import { useState } from 'react';

/**
 * Validates and sanitizes destination URLs to prevent JavaScript/data URI injection.
 * @param {string} raw
 * @returns {string} Sanitized HTTP(S) URL or '#' fallback
 */
function safeUrl(raw) {
  if (!raw || typeof raw !== 'string') return '#';
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    // Malformed URI
  }
  return '#';
}

/**
 * Validates and sanitizes media image URLs.
 * @param {string} raw
 * @returns {string|null} Sanitized HTTP(S) URL or null
 */
function safeImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    // Malformed URI
  }
  return null;
}

/**
 * Displays rich citation cards for web research sources.
 *
 * @param {object} props
 * @param {Array<{url: string, title: string, snippet: string, domain?: string, favicon?: string, thumbnail?: string}>} props.items
 */
export default function Sources({ items }) {
  if (!items || items.length === 0) return null;

  const strip = (t) =>
    t
      ? String(t)
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
          .replace(/[*_#`~>]/g, '')
          .trim()
      : '';

  return (
    <section className="sources" aria-label="Research Sources">
      <div className="sources-header">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <h4>Sources ({items.length})</h4>
      </div>

      <div className="sources-grid">
        {items.map((s, idx) => (
          <SourceCard key={s.url || idx} source={s} strip={strip} />
        ))}
      </div>
    </section>
  );
}

function SourceCard({ source, strip }) {
  const [thumbError, setThumbError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const domain = String(source.domain || '').replace(/[^a-zA-Z0-9.-]/g, '');
  const domainInitial = domain ? domain.charAt(0).toUpperCase() : '•';
  const validatedUrl = safeUrl(source.url);
  const validatedFavicon =
    safeImageUrl(source.favicon) ||
    (domain
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
      : null);
  const validatedThumbnail = safeImageUrl(source.thumbnail);

  return (
    <a
      href={validatedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="source-card"
      title={`Open ${source.title || domain}`}
    >
      <div className="source-card-top">
        <div className="source-meta">
          {!faviconError && validatedFavicon ? (
            <img
              src={validatedFavicon}
              alt=""
              className="source-favicon"
              loading="lazy"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <span className="source-favicon-fallback" aria-hidden="true">
              {domainInitial}
            </span>
          )}
          <span className="source-domain">{domain}</span>
        </div>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="source-ext-icon"
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>

      {validatedThumbnail && !thumbError && (
        <div className="source-thumb-wrap">
          <img
            src={validatedThumbnail}
            alt=""
            className="source-thumb"
            loading="lazy"
            onError={() => setThumbError(true)}
          />
        </div>
      )}

      <div className="source-content">
        <h5 className="source-title">{source.title}</h5>
        {source.snippet && <p className="source-snippet">{strip(source.snippet)}</p>}
      </div>
    </a>
  );
}
