const WEATHER = /\b(weather|temperature|forecast|raining|snowing|humidity|how (hot|cold|warm) is it)\b/i;
const LOCATION =
  /\b(?:in|at|for|of)\s+([A-Za-z][A-Za-z .,'-]{1,60}?)\s*(?:[?.!,]|\btoday\b|\bright now\b|\bnow\b|\btonight\b|\btomorrow\b|$)/i;
const WEB =
  /\b(latest|news|currently|current|recent(ly)?|newest|breaking|this (week|month|year)|right now|who (is|won)|price of|stock|released?|look up|search (for|the web)|202[5-9])\b/i;

/**
 * Classify a user message into a route.
 * @param {string} message
 * @returns {{ kind: 'chat'|'web'|'weather', location?: string }}
 */
export function classify(message) {
  if (WEATHER.test(message)) {
    const m = LOCATION.exec(message);
    const location = m ? m[1].replace(/[., ]+$/, '').trim() : null;
    return { kind: 'weather', location };
  }
  if (WEB.test(message)) {
    return { kind: 'web' };
  }
  return { kind: 'chat' };
}
