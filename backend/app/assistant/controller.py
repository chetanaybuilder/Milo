import json
import logging
from typing import AsyncIterator

from app.ai.providers import ProviderError, get_provider
from app.tools.errors import ToolError
from app.tools.web_search.service import search
from app.tools.weather.service import get_weather
from .prompts import SYSTEM, format_results
from .router import classify

log = logging.getLogger("milo.assistant")
MAX_HISTORY = 10
MAX_CHARS = 1200

BRAIN_ERR = "Milo's brain is temporarily unavailable."
SEARCH_ERR = "I couldn't complete the web search right now."
WEATHER_ERR = "I couldn't retrieve the latest weather data."


def _line(event: dict) -> str:
    return json.dumps(event) + "\n"


def build_messages(history: list, message: str, extra: str | None) -> list[dict]:
    recent = [{"role": h.role, "content": h.content[:MAX_CHARS]} for h in history[-MAX_HISTORY:]]
    system = SYSTEM + ("\n\n" + extra if extra else "")
    return [{"role": "system", "content": system}, *recent, {"role": "user", "content": message}]


def weather_sentence(w: dict) -> str:
    s = (f"{w['location'].split(',')[0]} is currently {w['temperature']}°C with {w['conditions']}. "
         f"It feels like {w['feels_like']}°C")
    if w.get("humidity") is not None:
        s += f", with {w['humidity']}% humidity"
    return s + f" and wind around {w['wind']} kilometres per hour."


async def respond(message: str, history: list) -> AsyncIterator[str]:
    """Yields NDJSON event lines: tool, sources, weather, token, error, done."""
    try:
        route = classify(message)
        extra = None

        if route.kind == "weather":
            if not route.location:
                yield _line({"type": "token", "text": "Which city should I check the weather for?"})
                yield _line({"type": "done"})
                return
            yield _line({"type": "tool", "tool": "weather"})
            try:
                w = await get_weather(route.location)
            except ToolError as e:
                log.warning("weather failed: %s", e)
                yield _line({"type": "error", "message": WEATHER_ERR})
                yield _line({"type": "done"})
                return
            yield _line({"type": "weather", "data": w})
            yield _line({"type": "token", "text": weather_sentence(w)})
            yield _line({"type": "done"})
            return

        if route.kind == "web":
            yield _line({"type": "tool", "tool": "web"})
            try:
                results = await search(message)
            except ToolError as e:
                log.warning("search failed: %s", e)
                yield _line({"type": "error", "message": SEARCH_ERR})
                yield _line({"type": "done"})
                return
            if not results:
                yield _line({"type": "token", "text": "I searched the web but found nothing useful for that."})
                yield _line({"type": "done"})
                return
            yield _line({"type": "sources", "data": results})
            extra = format_results(results)

        try:
            async for delta in get_provider().stream(build_messages(history, message, extra)):
                yield _line({"type": "token", "text": delta})
        except ProviderError:
            yield _line({"type": "error", "message": BRAIN_ERR})
        yield _line({"type": "done"})
    except Exception:  # last-resort guard: never leak internals
        log.exception("unhandled assistant error")
        yield _line({"type": "error", "message": BRAIN_ERR})
        yield _line({"type": "done"})
