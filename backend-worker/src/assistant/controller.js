import { streamGroq, ProviderError } from '../ai/groq.js';
import { search } from '../tools/webSearch.js';
import { getWeather, ToolError } from '../tools/weather.js';
import { SYSTEM, formatResults } from './prompts.js';
import { classify } from './router.js';

const MAX_HISTORY = 10;
const MAX_CHARS = 1200;

const BRAIN_ERR = "Milo's brain is temporarily unavailable.";
const SEARCH_ERR = "I couldn't complete the web search right now.";
const WEATHER_ERR = "I couldn't retrieve the latest weather data.";

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
      const emit = (event) => controller.enqueue(encoder.encode(line(event)));

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
                emit({ type: 'token', text: `I couldn't find the weather for "${route.location}". Please check the city name.` });
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
            if (!results.length) {
              emit({ type: 'token', text: 'I searched the web but found nothing useful for that.' });
              emit({ type: 'done' });
              controller.close();
              return;
            }
            emit({ type: 'sources', data: results });
            extra = formatResults(results);
          } catch (e) {
            if (e instanceof ToolError) {
              console.warn('search failed:', e.message);
              emit({ type: 'error', message: SEARCH_ERR });
              emit({ type: 'done' });
              controller.close();
              return;
            }
            throw e;
          }
        }

        // --- LLM Streaming ---
        try {
          for await (const delta of streamGroq(env, buildMessages(history, message, extra))) {
            emit({ type: 'token', text: delta });
          }
        } catch (e) {
          if (e instanceof ProviderError) {
            emit({ type: 'error', message: BRAIN_ERR });
          } else {
            throw e;
          }
        }

        emit({ type: 'done' });
      } catch (e) {
        // Last-resort guard: never leak internals
        console.error('unhandled assistant error:', e);
        emit({ type: 'error', message: BRAIN_ERR });
        emit({ type: 'done' });
      }

      controller.close();
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
