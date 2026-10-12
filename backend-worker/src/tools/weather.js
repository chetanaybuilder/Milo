const WMO = {
  0: 'clear skies', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'freezing drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow',
  77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorms', 96: 'thunderstorms with hail',
  99: 'severe thunderstorms with hail',
};

export class ToolError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ToolError';
  }
}

/**
 * Fetch current weather for a location using Open-Meteo.
 * @param {string} location
 * @returns {Promise<object>}
 */
export async function getWeather(location) {
  let places, cur, p;
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({
        name: location,
        count: '1',
        language: 'en',
      })}`,
    );
    if (!geoRes.ok) throw new Error(`geo HTTP ${geoRes.status}`);
    const geoData = await geoRes.json();
    places = geoData.results || [];
    if (!places.length) throw new ToolError('location not found');
    p = places[0];

    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
        latitude: String(p.latitude),
        longitude: String(p.longitude),
        timezone: 'auto',
        current:
          'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
      })}`,
    );
    if (!wRes.ok) throw new Error(`weather HTTP ${wRes.status}`);
    const wData = await wRes.json();
    cur = wData.current;
  } catch (e) {
    if (e instanceof ToolError) throw e;
    console.error('Open-Meteo failure:', e.message);
    throw new ToolError('transport');
  }

  const name = [p.name, p.admin1, p.country].filter(Boolean).join(', ');
  return {
    location: name,
    temperature: Math.round(cur.temperature_2m),
    feels_like: Math.round(cur.apparent_temperature),
    conditions: WMO[cur.weather_code] || 'unknown conditions',
    humidity: cur.relative_humidity_2m ?? null,
    wind: Math.round(cur.wind_speed_10m || 0),
    precipitation: cur.precipitation ?? null,
    timestamp: cur.time ?? null,
  };
}
