import logging
import re
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Redact API keys from logs
class RedactFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.msg, str):
            record.msg = re.sub(r"(gsk_[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{20,})", "[REDACTED]", record.msg)
        return True

# Rate limiting
RATE_LIMIT_TOKENS = 60
RATE_LIMIT_REFILL = 1.0 # tokens per second
_buckets = {}

def check_rate_limit(ip: str) -> bool:
    now = time.time()
    if ip not in _buckets:
        _buckets[ip] = {"tokens": RATE_LIMIT_TOKENS, "last": now}
        return True
    
    bucket = _buckets[ip]
    elapsed = now - bucket["last"]
    bucket["tokens"] = min(RATE_LIMIT_TOKENS, bucket["tokens"] + elapsed * RATE_LIMIT_REFILL)
    bucket["last"] = now
    
    if bucket["tokens"] >= 1:
        bucket["tokens"] -= 1
        return True
    return False

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ["/api/chat", "/api/tts"]:
            client_ip = request.client.host if request.client else "unknown"
            if not check_rate_limit(client_ip):
                return JSONResponse(status_code=429, content={"detail": "Too many requests"})
        return await call_next(request)

class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size: int = 1048576):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        if "content-length" in request.headers:
            try:
                length = int(request.headers["content-length"])
                if length > self.max_size:
                    return JSONResponse(status_code=413, content={"detail": "Payload too large"})
            except ValueError:
                pass
        return await call_next(request)

def setup_security(app):
    for handler in logging.root.handlers:
        handler.addFilter(RedactFilter())
    
    # Add middlewares (order matters, the last added wraps the inner app first)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(MaxBodySizeMiddleware, max_size=1048576) # 1MB limit
