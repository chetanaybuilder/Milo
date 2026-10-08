import logging
from urllib.parse import urlparse

import httpx

from app import config
from app.tools.errors import ToolError

log = logging.getLogger("milo.search")


async def search(query: str, max_results: int = 5) -> list[dict]:
    key = config.tavily_key()
    if not key:
        log.error("TAVILY_API_KEY is not set")
        raise ToolError("missing key")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=6)) as client:
            r = await client.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {key}"},
                json={"query": query[:300], "max_results": max_results, "search_depth": "basic"},
            )
        if r.status_code >= 400:
            log.error("Tavily returned HTTP %s", r.status_code)
            raise ToolError("http error")
        raw = r.json().get("results", [])
    except (httpx.HTTPError, ValueError) as e:
        log.error("Tavily failure: %s", type(e).__name__)
        raise ToolError("transport") from e

    out = []
    for item in raw:
        url = item.get("url")
        if not url or not item.get("title"):
            continue
        if not url.startswith(("http://", "https://")):
            continue
        domain = (urlparse(url).netloc or "").removeprefix("www.")
        out.append({
            "title": item["title"].strip(),
            "url": url,
            "domain": domain,
            "snippet": (item.get("content") or "").strip()[:220],
        })
    return out
