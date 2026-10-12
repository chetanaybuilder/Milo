import { API_CONFIG, CHAT_CONFIG } from '../config/constants.js';

/**
 * Streams NDJSON events from the backend with timeout, retries, and clean abort handling.
 *
 * @param {string} message - User query text
 * @param {Array<{role: string, content: string}>} history - Filtered conversation history
 * @param {AbortSignal} [signal] - Optional parent abort signal
 * @param {Function} onEvent - Callback invoked for each parsed NDJSON event
 * @returns {Promise<void>}
 */
export async function streamChat(message, history, signal, onEvent) {
  const baseUrl = API_CONFIG.BASE_URL;
  const maxRetries = API_CONFIG.MAX_RETRIES;
  const timeoutMs = API_CONFIG.TIMEOUT_MS;
  const retryDelayMs = API_CONFIG.RETRY_DELAY_MS;

  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new Error('aborted');

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new Error('timeout')), timeoutMs);

    const onAbort = () => timeoutController.abort(signal.reason);
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: history.slice(-CHAT_CONFIG.MAX_HISTORY_MESSAGES),
        }),
        signal: timeoutController.signal,
      });

      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);

      if (!res.ok || !res.body) {
        if (res.status >= 500 && res.status <= 504 && attempt < maxRetries && !signal?.aborted) {
          attempt++;
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        throw new Error(`request failed with HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            try {
              onEvent(JSON.parse(line));
            } catch {
              // Ignore malformed NDJSON line
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return; // Stream finished successfully
    } catch (err) {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);

      if (signal?.aborted) {
        throw new Error('aborted');
      }

      if (attempt < maxRetries && !signal?.aborted) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }

      throw err;
    }
  }
}
