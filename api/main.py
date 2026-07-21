"""FastAPI app exposing POST /generate-journey.

See docs/PRD.md section 9 (API Specification) and feature F7. Request/response
shapes and error codes (404 customer not found, 500 LLM/retrieval failure) match
the PRD exactly.
"""

import os
import threading
import time
from collections import defaultdict

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src import tools
from src.agent import generate_journey

app = FastAPI(title="PS100 Personalized Loyalty Agent", version="1.0")

# CORS: allow the React studio to call this API from the browser. Locked to the
# origins in ALLOWED_ORIGINS (comma-separated) so a public deployment only serves
# our own frontend; defaults to the local dev ports. Set ALLOWED_ORIGINS="*" to
# reopen fully (e.g. for a quick test) — see docs/PRODUCTIZATION_PLAN.md, Phase 0.
_origins_env = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:4173,http://localhost:5173"
).strip()
ALLOWED_ORIGINS = ["*"] if _origins_env == "*" else [
    o.strip() for o in _origins_env.split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# --- Rate limiting -------------------------------------------------------
# Each journey is a paid NVIDIA call, so a public endpoint must be bounded or a
# stranger/bot can drain the account's credits. This is a lightweight per-IP
# fixed-window limiter — fine for a single free-tier instance (Phase 0). Phase 3
# replaces it with per-user quotas + caching. Tunable via env.
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_WINDOW", "20"))
RATE_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "600"))  # seconds
_hits: dict[str, list[float]] = defaultdict(list)
_hits_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    """Best-effort client IP, honoring the proxy header hosts set (e.g. Render)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request) -> None:
    """Reject an IP that exceeds RATE_LIMIT requests within RATE_WINDOW seconds."""
    now = time.time()
    ip = _client_ip(request)
    cutoff = now - RATE_WINDOW
    with _hits_lock:
        recent = [t for t in _hits[ip] if t > cutoff]
        if len(recent) >= RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please wait a moment and try again.",
            )
        recent.append(now)
        _hits[ip] = recent


class JourneyRequest(BaseModel):
    customer_id: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/customers")
def list_customers() -> list[dict]:
    """Return all customers so the frontend can populate its picker and profile panel."""
    return tools.get_all_customers()


@app.post("/generate-journey", dependencies=[Depends(rate_limit)])
def post_generate_journey(req: JourneyRequest) -> dict:
    """Generate a personalized loyalty journey for a customer.

    Rate-limited per IP (see rate_limit) because each call may hit the paid
    NVIDIA LLM. Returns the PRD section 7 response shape. Raises 404 if the
    customer is unknown, 429 if rate-limited, and 500 on LLM / retrieval failure.
    """
    try:
        return generate_journey(req.customer_id)
    except ValueError as exc:
        # Agent raises ValueError("Customer not found: ...") for unknown ids.
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # LLM / retrieval failure
        raise HTTPException(status_code=500, detail=f"Journey generation failed: {exc}") from exc
