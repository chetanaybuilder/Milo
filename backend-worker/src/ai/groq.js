import { groqKey, groqModel } from '../config.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
const REQUEST_TIMEOUT_MS = 15000;

export class ProviderError extends Error {
  constructor(msg, status = null) {
    super(msg);
    this.name = 'ProviderError';
    this.status = status;
  }
}

/**
 * Perform a fetch with timeout and retries with backoff.
 */
async function fetchWithRetry(
  url,
  options,
  { retries = 2, backoffMs = 500, timeoutMs = REQUEST_TIMEOUT_MS, signal } = {}
) {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

    // Combine outer signal with timeout signal
    let combinedSignal = controller.signal;
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        throw signal.reason || new Error('aborted');
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }

    try {
      const response = await fetch(url, { ...options, signal: combinedSignal });
      clearTimeout(timeoutId);

      // Retry on transient server errors or rate limiting
      if (
        (response.status === 429 || (response.status >= 500 && response.status <= 504)) &&
        attempt < retries
      ) {
        attempt++;
        const jitter = Math.random() * 150;
        const delay = backoffMs * Math.pow(1.6, attempt - 1) + jitter;
        console.warn(
          `[Groq] HTTP ${response.status}, retrying attempt ${attempt}/${retries} in ${Math.round(delay)}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (signal?.aborted) throw err;
      if (attempt < retries) {
        attempt++;
        const delay = backoffMs * Math.pow(1.6, attempt - 1) + Math.random() * 100;
        console.warn(
          `[Groq] Network failure (${err.message}), retrying ${attempt}/${retries} in ${Math.round(delay)}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Stream chat completion tokens from Groq with retry, timeout, and fallback model.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {Array} messages - Chat messages array
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {AsyncGenerator<string>} - Yields text tokens
 */
export async function* streamGroq(env, messages, signal) {
  const key = groqKey(env);
  if (!key) {
    throw new ProviderError('GROQ_API_KEY is not set');
  }

  const primaryModel = groqModel(env);
  const modelsToTry = [primaryModel];
  if (primaryModel !== FALLBACK_MODEL) {
    modelsToTry.push(FALLBACK_MODEL);
  }

  let lastError = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const currentModel = modelsToTry[mIdx];
    const payload = {
      model: currentModel,
      messages,
      stream: true,
      temperature: 0.6,
      max_tokens: 350,
    };

    if (currentModel.includes('gpt-oss')) {
      payload.reasoning_effort = 'low';
      payload.include_reasoning = false;
    }

    let response;
    try {
      response = await fetchWithRetry(
        GROQ_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        { retries: 1, backoffMs: 600, timeoutMs: REQUEST_TIMEOUT_MS, signal }
      );
    } catch (e) {
      if (signal?.aborted) throw e;
      console.warn(`[Groq] Model ${currentModel} fetch failed:`, e.message);
      lastError = new ProviderError('transport');
      if (mIdx < modelsToTry.length - 1) {
        console.info(`[Groq] Switching to fallback model: ${modelsToTry[mIdx + 1]}`);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      let errMsg = '';
      try {
        const body = await response.json();
        errMsg = body?.error?.message || '';
      } catch {}
      console.warn(
        `[Groq] Model ${currentModel} returned HTTP ${response.status}: ${errMsg || '(no detail)'}`
      );
      lastError = new ProviderError('http error', response.status);

      // If we have a fallback model and got 429/500/503, try fallback model
      if (mIdx < modelsToTry.length - 1) {
        console.info(`[Groq] Switching to fallback model: ${modelsToTry[mIdx + 1]}`);
        continue;
      }
      throw lastError;
    }

    // Stream the SSE body
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let lineEnd;
        while ((lineEnd = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, lineEnd).trim();
          buf = buf.slice(lineEnd + 1);

          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const content = delta?.content;
            if (content) yield content;
          } catch {
            // ignore malformed chunk
          }
        }
      }
      return; // Successfully streamed
    } catch (streamErr) {
      if (signal?.aborted) throw streamErr;
      console.warn('[Groq] Stream read error:', streamErr.message);
      throw new ProviderError('stream_interrupted');
    } finally {
      reader.releaseLock();
    }
  }

  if (lastError) throw lastError;
}
