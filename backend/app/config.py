import os
from dotenv import load_dotenv

load_dotenv()


def groq_key() -> str:
    return os.getenv("GROQ_API_KEY", "")


def groq_model() -> str:
    return os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def tavily_key() -> str:
    return os.getenv("TAVILY_API_KEY", "")


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]
