import re
from dataclasses import dataclass

WEATHER = re.compile(r"\b(weather|temperature|forecast|raining|snowing|humidity|how (hot|cold|warm) is it)\b", re.I)
LOCATION = re.compile(
    r"\b(?:in|at|for|of)\s+([A-Za-z][A-Za-z .,'-]{1,60}?)\s*(?:\?|\.|!|,|\btoday\b|\bright now\b|\bnow\b|\btonight\b|\btomorrow\b|$)",
    re.I,
)
WEB = re.compile(
    r"\b(latest|news|currently|current|recent(ly)?|newest|breaking|this (week|month|year)|"
    r"right now|who (is|won)|price of|stock|released?|look up|search (for|the web)|202[5-9])\b",
    re.I,
)


@dataclass
class Route:
    kind: str  # "chat" | "web" | "weather"
    location: str | None = None


def classify(message: str) -> Route:
    if WEATHER.search(message):
        m = LOCATION.search(message)
        loc = m.group(1).strip(" .,") if m else None
        return Route("weather", loc)
    if WEB.search(message):
        return Route("web")
    return Route("chat")
