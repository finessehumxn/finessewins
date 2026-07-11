"""
FinesseWins — lightweight per-IP rate limiting

Protects the expensive endpoints (multi-source search, USAspending-backed Bid IQ,
LLM proposal generation) from abuse and from hammering upstream free APIs.

In-process sliding window — fine for a single backend instance. For multiple
instances, back it with Redis behind the same interface. Disable in dev with
RATE_LIMIT_DISABLED=1.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

DISABLED = os.environ.get("RATE_LIMIT_DISABLED", "0") == "1"
_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # Respect a proxy hop (Render/Fly/Vercel set X-Forwarded-For).
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limiter(max: int, window: int, name: str):
    """Build a FastAPI dependency that enforces `max` requests per `window` seconds
    per client IP. Function-closure form so FastAPI injects Request cleanly."""

    async def _dep(request: Request):
        if DISABLED:
            return
        key = f"{name}:{_client_ip(request)}"
        now = time.monotonic()
        q = _hits[key]
        cutoff = now - window
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= max:
            retry = int(window - (now - q[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests — please wait {retry}s and try again.",
                headers={"Retry-After": str(retry)},
            )
        q.append(now)

    return _dep


# Sensible defaults per endpoint class.
search_limit = rate_limiter(40, 60, "search")
intel_limit = rate_limiter(30, 60, "intel")
generate_limit = rate_limiter(8, 60, "generate")
