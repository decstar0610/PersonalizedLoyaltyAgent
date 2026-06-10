"""Tests for the loyalty agent (docs/PRD.md Success Metrics, section 10).

The consent-off path is deterministic and runs for real. The personalized path
hits the NIM LLM, so the LLM client and RAG retrieval are mocked here to keep the
test offline and deterministic (no API key required).
"""

import json

from src import agent

# loyalty_journey keys required by the PRD section 7 output schema.
REQUIRED_JOURNEY_KEYS = {
    "current_tier",
    "recommended_action",
    "rewards",
    "next_best_offer",
    "message",
}


def test_consent_off_returns_generic_with_no_personalization():
    """C004 has personalization=false -> generic offer, no personalization (hard rule)."""
    result = agent.generate_journey("C004")

    assert result["customer_id"] == "C004"
    assert result["personalization_applied"] is False
    # No targeted rewards -> nothing derived from purchase history.
    assert result["loyalty_journey"]["rewards"] == []
    assert set(result["loyalty_journey"]) == REQUIRED_JOURNEY_KEYS


def _fake_client(journey: dict):
    """Build a minimal stand-in for the OpenAI-compatible NIM client."""

    class _Msg:
        content = json.dumps(journey)

    class _Choice:
        message = _Msg()

    class _Resp:
        choices = [_Choice()]

    class _Completions:
        def create(self, **_kwargs):
            return _Resp()

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    return _Client()


def test_personalized_journey_has_required_keys(monkeypatch):
    """C001 has consent -> a personalized journey with exactly the required keys."""
    journey = {
        "current_tier": "silver",
        "recommended_action": "Promote toward Gold (180 points away)",
        "rewards": [{"reward": "Fitness Bundle", "reason": "Frequent sportswear buyer"}],
        "next_best_offer": "10% off next sportswear purchase",
        "message": "Hi Asha! You're 180 points from Gold.",
    }
    # Mock the LLM and RAG so the test is offline and deterministic.
    monkeypatch.setattr(agent, "get_client", lambda: _fake_client(journey))
    monkeypatch.setattr(agent.tools, "retrieve_rules", lambda query, k=3: ["loyalty rules"])

    result = agent.generate_journey("C001")

    assert result["customer_id"] == "C001"
    assert result["personalization_applied"] is True
    assert set(result["loyalty_journey"]) == REQUIRED_JOURNEY_KEYS
    assert result["loyalty_journey"]["rewards"][0]["reward"] == "Fitness Bundle"
