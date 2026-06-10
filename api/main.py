"""FastAPI app exposing POST /generate-journey.

See docs/PRD.md section 9 (API Specification) and feature F7. Request/response
shapes and error codes (404 customer not found, 500 LLM/retrieval failure) match
the PRD exactly.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.agent import generate_journey

app = FastAPI(title="PS100 Personalized Loyalty Agent", version="1.0")


class JourneyRequest(BaseModel):
    customer_id: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/generate-journey")
def post_generate_journey(req: JourneyRequest) -> dict:
    """Generate a personalized loyalty journey for a customer.

    Returns the PRD section 7 response shape. Raises 404 if the customer is
    unknown and 500 on LLM / retrieval failure.
    """
    try:
        return generate_journey(req.customer_id)
    except ValueError as exc:
        # Agent raises ValueError("Customer not found: ...") for unknown ids.
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # LLM / retrieval failure
        raise HTTPException(status_code=500, detail=f"Journey generation failed: {exc}") from exc
