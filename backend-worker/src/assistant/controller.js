import { streamGroq, ProviderError } from '../ai/groq.js';
import { search } from '../tools/webSearch.js';
import { getWeather, ToolError } from '../tools/weather.js';
import { SYSTEM, formatResults } from './prompts.js';
import { classify } from './router.js';

const MAX_HISTORY = 10;
const MAX_CHARS = 1200;

const BRAIN_ERR =
  "I'm having trouble connecting to my reasoning engine right now. Please try again in a moment.";
const SEARCH_ERR = "I couldn't reach the search service, but I'll answer with what I know.";
const WEATHER_ERR = "I couldn't retrieve the latest weather data right now.";

function line(event) {
  return JSON.stringify(event) + '\n';
}

function buildMessages(history, message, extra) {
  const recent = history.slice(-MAX_HISTORY).map((h) => ({
    role: h.role,
    content: (h.content || '').slice(0, MAX_CHARS),
  }));
  const system = SYSTEM + (extra ? '\n\n' + extra : '');
  return [{ role: 'system', content: system }, ...recent, { role: 'user', content: message }];
}

function weatherSentence(w) {
  let s = `${w.location.split(',')[0]} is currently ${w.temperature}°C with ${w.conditions}. `;
  s += `It feels like ${w.feels_like}°C`;
  if (w.humidity != null) {
    s += `, with ${w.humidity}% humidity`;
  }
  s += ` and wind around ${w.wind} kilometres per hour.`;
  return s;
}

/**
 * Build a streaming NDJSON Response for a chat request.
 * @param {object} env - Cloudflare Worker env bindings
 * @param {string} message
 * @param {Array} history
 * @returns {Response}
 */
export function respond(env, message, history) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event) => {
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          // Stream might be closed if client aborted
        }
      };

      try {
        const route = classify(message, history);
        let extra = null;

        // --- Weather ---
        if (route.kind === 'weather') {
          if (!route.location) {
            emit({ type: 'token', text: 'Which city should I check the weather for?' });
            emit({ type: 'done' });
            controller.close();
            return;
          }
          emit({ type: 'tool', tool: 'weather' });
          try {
            const w = await getWeather(route.location);
            emit({ type: 'weather', data: w });
            emit({ type: 'token', text: weatherSentence(w) });
          } catch (e) {
            if (e instanceof ToolError) {
              console.warn('weather failed:', e.message);
              if (e.message && e.message.includes('not found')) {
                emit({
                  type: 'token',
                  text: `I couldn't find the weather for "${route.location}". Please check the city name.`,
                });
              } else {
                emit({ type: 'error', message: WEATHER_ERR });
              }
            } else {
              throw e;
            }
          }
          emit({ type: 'done' });
          controller.close();
          return;
        }

        // --- Web Search ---
        if (route.kind === 'web') {
          emit({ type: 'tool', tool: 'web' });
          try {
            const results = await search(env, message);
            if (results && results.length > 0) {
              emit({ type: 'sources', data: results });
              extra = formatResults(results);
            } else {
              console.info(
                '[Assistant] Search returned 0 results, proceeding to direct LLM response'
              );
            }
          } catch (e) {
            console.warn('[Assistant] Search fallback triggered:', e.message);
            // Non-fatal search failure: continue to LLM with graceful fallback
            extra =
              'Note: Real-time web search was unavailable for this query. Provide your best direct answer based on established knowledge.';
          }
        }

        // --- LLM Streaming with Fallback ---
        let streamedTokens = 0;
        try {
          for await (const delta of streamGroq(env, buildMessages(history, message, extra))) {
            emit({ type: 'token', text: delta });
            streamedTokens++;
          }
        } catch (e) {
          console.warn('[Assistant] LLM stream error:', e.message);
          if (streamedTokens === 0) {
            emit({ type: 'error', message: BRAIN_ERR });
          }
        }

        emit({ type: 'done' });
      } catch (e) {
        // Last-resort guard: never leak internals
        console.error('unhandled assistant error:', e);
        emit({ type: 'error', message: BRAIN_ERR });
        emit({ type: 'done' });
      }

      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
