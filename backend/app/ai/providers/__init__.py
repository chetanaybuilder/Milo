from .base import AIProvider, ProviderError
from .groq import GroqProvider

_provider: AIProvider | None = None


def get_provider() -> AIProvider:
    global _provider
    if _provider is None:
        _provider = GroqProvider()
    return _provider


__all__ = ["AIProvider", "GroqProvider", "ProviderError", "get_provider"]
