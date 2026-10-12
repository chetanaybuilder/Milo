import { groqKey, groqModel } from '../config.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class ProviderError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ProviderError';
  }
}

/**
 * Stream chat completion tokens from Groq.
 * Yields text deltas via the callback.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {Array} messages - Chat messages array
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {ReadableStream} - A ReadableStream of SSE lines
 */
export async function* streamGroq(env, messages, signal) {
  const key = groqKey(env);
  if (!key) {
    throw new ProviderError('GROQ_API_KEY is not set');
  }

  const model = groqModel(env);
  const payload = {
    model,
    messages,
    stream: true,
    temperature: 0.6,
    max_tokens: 350,
  };

  if (model.includes('gpt-oss')) {
    payload.reasoning_effort = 'low';
    payload.include_reasoning = false;
  }

  let response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    throw new ProviderError('transport');
  }

  if (!response.ok) {
    let errMsg = '';
    try {
      const body = await response.json();
      errMsg = body?.error?.message || '';
    } catch {
      // ignore
    }
    console.error(`Groq returned HTTP ${response.status}: ${errMsg || '(no message)'}`);
    throw new ProviderError('http error');
  }

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
          const delta = JSON.parse(data).choices[0].delta;
          const content = delta?.content;
          if (content) yield content;
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
