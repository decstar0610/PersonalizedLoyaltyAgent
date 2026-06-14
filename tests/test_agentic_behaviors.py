"""Offline tests for the agent's safety-critical behaviors.

These mock the NVIDIA LLM and RAG retrieval, so they are deterministic and need no
API key or network. They verify the deterministic guardrails (routing, consent
constraints, validation) and the output schema — not the LLM's reasoning quality.
"""

import json
from types import SimpleNamespace

from src import agent

REQUIRED_JOURNEY_KEYS = {
    "current_tier",
    "recommended_action",
    "rewards",
    "next_best_offer",
    "message",
}


def _customer(dates, points, tier):
    return {
        "customer_id": "T",
        "name": "T",
        "loyalty_tier": tier,
        "points": points,
        "purchase_history": [
            {"item": "x", "category": "sportswear", "amount": 1, "date": d} for d in dates
        ],
    }


# --- Behavior 1: segment routing ----------------------------------------


def test_classify_new(monkeypatch):
    monkeypatch.setattr(agent, "_dataset_as_of", lambda: "2025-12-31")
    assert agent._classify_segment(_customer(["2025-12-01"], 50, "bronze")) == "new"


def test_classify_lapsing(monkeypatch):
    monkeypatch.setattr(agent, "_dataset_as_of", lambda: "2025-12-31")
    cust = _customer(["2025-05-01", "2025-06-01"], 400, "silver")  # latest 213 days ago
    assert agent._classify_segment(cust) == "lapsing"


def test_classify_near_threshold(monkeypatch):
    monkeypatch.setattr(agent, "_dataset_as_of", lambda: "2025-12-31")
    cust = _customer(["2025-12-20", "2025-12-25"], 400, "silver")  # 100 pts from Gold (500)
    assert agent._classify_segment(cust) == "near_threshold"


def test_classify_established(monkeypatch):
    monkeypatch.setattr(agent, "_dataset_as_of", lambda: "2025-12-31")
    cust = _customer(["2025-12-20", "2025-12-25"], 250, "silver")  # 250 pts from Gold (> 200)
    assert agent._classify_segment(cust) == "established"


# --- Behavior 2: multi-flag consent constraints -------------------------


def test_constraints_email_off():
    c = agent._consent_constraints({"email_marketing": False, "data_sharing": True})
    assert len(c) == 1 and "email_marketing is OFF" in c[0]


def test_constraints_data_off():
    c = agent._consent_constraints({"email_marketing": True, "data_sharing": False})
    assert len(c) == 1 and "data_sharing is OFF" in c[0]


def test_constraints_all_on():
    assert agent._consent_constraints({"email_marketing": True, "data_sharing": True}) == []


def test_consent_notes_text():
    assert "email marketing OFF" in agent._consent_notes({"email_marketing": False, "data_sharing": True})
    assert "first-party" in agent._consent_notes({"email_marketing": True, "data_sharing": False})


# --- Behavior 3: self-critique validation -------------------------------


def _state(consent, rules):
    return {
        "customer": {"loyalty_tier": "silver"},
        "rules": list(rules),
        "purchase_history": [{"category": "sportswear", "amount": 1, "item": "x", "date": "2025-01-01"}],
        "consent": consent,
    }


def _journey(reward, reason, message="Hi", offer="5% off"):
    return {
        "current_tier": "silver",
        "recommended_action": "earn points",
        "rewards": [{"reward": reward, "reason": reason}],
        "next_best_offer": offer,
        "message": message,
    }


GROUND_RULES = ["Category affinity reward: offer a bundle or discount tailored to that category."]


def test_validate_passes_for_grounded_compliant():
    state = _state({"email_marketing": True, "data_sharing": True}, GROUND_RULES)
    journey = _journey("sportswear bundle discount", "category affinity reward for sportswear")
    passed, issues = agent._validate(journey, state)
    assert passed and issues == []


def test_validate_flags_ungrounded_reward():
    state = _state({"email_marketing": True, "data_sharing": True}, ["loyalty benefits"])
    passed, issues = agent._validate(_journey("Free yacht", "luxury gift"), state)
    assert not passed and any("not grounded" in i for i in issues)


def test_validate_flags_email_violation():
    state = _state({"email_marketing": False, "data_sharing": True}, GROUND_RULES)
    journey = _journey("sportswear discount", "category affinity reward", message="check your email")
    passed, issues = agent._validate(journey, state)
    assert not passed and any("email" in i for i in issues)


def test_validate_flags_third_party_violation():
    state = _state({"email_marketing": True, "data_sharing": False}, GROUND_RULES)
    journey = _journey("sportswear discount", "category affinity reward", offer="third-party partner deal")
    passed, issues = agent._validate(journey, state)
    assert not passed and any("third-party" in i for i in issues)


def test_validate_flags_bad_schema():
    state = _state({"email_marketing": True, "data_sharing": True}, GROUND_RULES)
    bad = {"current_tier": "silver", "rewards": []}  # missing required keys
    passed, issues = agent._validate(bad, state)
    assert not passed and any("schema" in i for i in issues)


# --- Behavior 3: full self-correction loop (mocked LLM) -----------------


class _FakeClient:
    """Returns successive drafts; one stateful instance per run."""

    def __init__(self, drafts):
        self._drafts = [json.dumps(d) for d in drafts]
        self._i = 0
        outer = self

        class _Completions:
            def create(self, **_kw):
                content = outer._drafts[min(outer._i, len(outer._drafts) - 1)]
                outer._i += 1
                return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

        self.chat = SimpleNamespace(completions=_Completions())


_BAD = _journey("Cross-store partner bonus", "uses third-party data from partner stores")
_GOOD = _journey("10% off sportswear bundle", "category affinity reward for your sportswear purchases")
_RULES = ["Category affinity reward: offer a bundle or discount tailored to that category."]


def test_loop_self_corrects(monkeypatch):
    # C001 has data_sharing off, so the third-party draft is a real violation.
    fake = _FakeClient([_BAD, _GOOD])
    monkeypatch.setattr(agent, "get_client", lambda: fake)
    monkeypatch.setattr(agent.tools, "retrieve_rules", lambda query, k=3: _RULES)

    r = agent.generate_journey("C001")
    assert r["validation_passed"] is True
    assert "attempt 2" in r["reasoning"]
    assert "third-party" not in json.dumps(r["loyalty_journey"]).lower()
    assert set(r["loyalty_journey"]) == REQUIRED_JOURNEY_KEYS


def test_loop_gives_up_after_max_retries(monkeypatch):
    fake = _FakeClient([_BAD])  # always bad
    monkeypatch.setattr(agent, "get_client", lambda: fake)
    monkeypatch.setattr(agent.tools, "retrieve_rules", lambda query, k=3: _RULES)

    r = agent.generate_journey("C001")
    assert r["validation_passed"] is False
    assert "after 3 attempt" in r["reasoning"]
    # Output is still schema-valid even when validation fails.
    assert set(r["loyalty_journey"]) == REQUIRED_JOURNEY_KEYS
