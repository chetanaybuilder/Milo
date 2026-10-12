const WEATHER =
  /\b(weather|wheather|wether|temperature|temp|forecast|raining|rain|snowing|snow|humidity|climate|how (hot|cold|warm) is it|how'?s the weather|is it (raining|snowing|sunny|cold|hot))\b/i;

const LOCATION_PREP =
  /\b(?:in|at|for|of|around|near|like in)\s+([A-Za-z][A-Za-z0-9 .,'-]{1,60}?)(?:\s+(?:today|tomorrow|tonight|right now|now|currently|outside|this week)|[?.!,]|$)/i;

const LOCATION_BEFORE_WEATHER =
  /^([A-Za-z][A-Za-z .,'-]{1,50}?)\s+(?:weather|wheather|wether|forecast|temperature|temp|climate)(?:\s+(?:today|tomorrow|tonight|right now|now|currently)|[?.!,]|$)/i;

const WEATHER_THEN_LOCATION =
  /^(?:weather|wheather|wether|forecast|temperature|temp)\s+(?:like\s+)?([A-Za-z][A-Za-z .,'-]{1,50}?)(?:\s+(?:today|tomorrow|tonight|right now|now|currently)|[?.!,]|$)/i;

const WEB =
  /\b(latest|news|currently|current|recent(ly)?|newest|breaking|this (week|month|year)|right now|who (is|won)|price of|stock|released?|look up|search (for|the web)|202[5-9])\b/i;

const QUESTION_WORDS =
  /^(what('?s)?|how('?s)?|tell|check|get|give|show|can|could|is|are|the|me|my|about)\b/i;

function cleanLocation(loc) {
  if (!loc) return null;
  const cleaned = loc
    .replace(
      /\b(today|tomorrow|tonight|right now|currently|now|please|outside|this week|the|like)\b/gi,
      ''
    )
    .replace(/[?.!,;:]+$/, '')
    .trim();
  if (QUESTION_WORDS.test(cleaned) && cleaned.split(/\s+/).length <= 2) {
    return null;
  }
  return cleaned.length > 1 ? cleaned : null;
}

/**
 * Classify a user message into a route.
 * @param {string} message
 * @param {Array} [history=[]]
 * @returns {{ kind: 'chat'|'web'|'weather', location?: string }}
 */
export function classify(message, history = []) {
  const trimmed = (message || '').trim();

  // Check if answering a follow-up asking for the city
  if (history && history.length > 0) {
    const last = history[history.length - 1];
    if (
      last &&
      last.role === 'assistant' &&
      /which city should i check the weather for/i.test(last.content || '')
    ) {
      const loc = cleanLocation(trimmed.replace(/^in\s+/i, ''));
      if (loc && loc.split(/\s+/).length <= 4) {
        return { kind: 'weather', location: loc };
      }
    }
  }

  if (WEATHER.test(trimmed)) {
    let loc = null;
    const mPrep = LOCATION_PREP.exec(trimmed);
    if (mPrep) loc = cleanLocation(mPrep[1]);

    if (!loc) {
      const mBefore = LOCATION_BEFORE_WEATHER.exec(trimmed);
      if (mBefore) loc = cleanLocation(mBefore[1]);
    }

    if (!loc) {
      const mAfter = WEATHER_THEN_LOCATION.exec(trimmed);
      if (mAfter) loc = cleanLocation(mAfter[1]);
    }

    return { kind: 'weather', location: loc };
  }

  if (WEB.test(trimmed)) {
    return { kind: 'web' };
  }

  return { kind: 'chat' };
}
