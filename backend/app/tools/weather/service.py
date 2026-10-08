import logging

import httpx

from app.tools.errors import ToolError

log = logging.getLogger("milo.weather")

WMO = {
    0: "clear skies", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains", 80: "light showers", 81: "showers", 82: "heavy showers",
    85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail",
    99: "severe thunderstorms with hail",
}


async def get_weather(location: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
            g = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": location, "count": 1, "language": "en"},
            )
            g.raise_for_status()
            places = g.json().get("results") or []
            if not places:
                raise ToolError("location not found")
            p = places[0]
            w = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": p["latitude"], "longitude": p["longitude"], "timezone": "auto",
                    "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                               "precipitation,weather_code,wind_speed_10m",
                },
            )
            w.raise_for_status()
            cur = w.json()["current"]
    except ToolError:
        raise
    except (httpx.HTTPError, ValueError, KeyError) as e:
        log.error("Open-Meteo failure: %s", type(e).__name__)
        raise ToolError("transport") from e

    name = ", ".join(x for x in (p.get("name"), p.get("admin1"), p.get("country")) if x)
    return {
        "location": name,
        "temperature": round(cur["temperature_2m"]),
        "feels_like": round(cur["apparent_temperature"]),
        "conditions": WMO.get(cur.get("weather_code"), "unknown conditions"),
        "humidity": cur.get("relative_humidity_2m"),
        "wind": round(cur.get("wind_speed_10m", 0)),
        "precipitation": cur.get("precipitation"),
        "timestamp": cur.get("time"),
    }
