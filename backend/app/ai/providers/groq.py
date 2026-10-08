import json
import logging
from typing import AsyncIterator

import httpx

from app import config
from .base import AIProvider, ProviderError

log = logging.getLogger("milo.groq")
URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqProvider(AIProvider):
    async def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        key = config.groq_key()
        if not key:
            log.error("GROQ_API_KEY is not set")
            raise ProviderError("missing key")
        model = config.groq_model()
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.6,
            "max_tokens": 350,
        }
        # gpt-oss models support reasoning; keep it off to save latency
        if "gpt-oss" in model:
            payload["reasoning_effort"] = "low"
            payload["include_reasoning"] = False
        headers = {"Authorization": f"Bearer {key}"}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=8)) as client:
                async with client.stream("POST", URL, json=payload, headers=headers) as r:
                    if r.status_code >= 400:
                        body_text = ""
                        try:
                            body_bytes = await r.aread()
                            body_text = body_bytes.decode("utf-8", errors="replace")
                            err_msg = json.loads(body_text).get("error", {}).get("message", "")
                        except Exception:
                            err_msg = ""
                        log.error("Groq returned HTTP %s: %s", r.status_code, err_msg or "(no message)")
                        raise ProviderError("http error")
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            delta = json.loads(data)["choices"][0]["delta"]
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                        # Only emit content text; ignore reasoning_content and other fields
                        content = delta.get("content")
                        if content:
                            yield content
        except httpx.HTTPError as e:
            log.error("Groq transport error: %s", type(e).__name__)
            raise ProviderError("transport") from e
