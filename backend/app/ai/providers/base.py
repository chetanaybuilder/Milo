from abc import ABC, abstractmethod
from typing import AsyncIterator


class ProviderError(Exception):
    """Raised when the LLM provider fails. Never carries secrets."""


class AIProvider(ABC):
    @abstractmethod
    def stream(self, messages: list[dict]) -> AsyncIterator[str]:
        """Yield text deltas for a chat completion."""
