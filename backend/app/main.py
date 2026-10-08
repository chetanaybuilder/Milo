import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import config
from .assistant.controller import respond
from .models import ChatRequest
from .security import setup_security

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

app = FastAPI(title="MILO")

setup_security(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "groq_configured": bool(config.groq_key()),
        "search_configured": bool(config.tavily_key()),
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        respond(req.message, req.history),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
