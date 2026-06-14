"""LangGraph loyalty agent: consent-gated, RAG-grounded reasoning loop.

Implements the Agent Logic Flow in docs/PRD.md section 8 and produces the output
schema in section 7. Consent is checked FIRST: if personalization is off, the agent
returns a generic offer (personalization_applied=false) and stops without any
history-based reasoning. Otherwise it classifies the customer's situation and routes
(LangGraph conditional edges) to a situation-specific context-gathering node before
asking the NIM LLM to produce the structured loyalty journey.
"""

import json
import re
from datetime import date
from functools import lru_cache
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ValidationError

from src import tools
from src.config import LLM_MODEL, get_client

# Generic, non-personalized offer used when consent is off (from data/loyalty_rules.md).
GENERIC_OFFER = "Enjoy 5% off your next purchase and earn points on every order."

# Tier point boundaries (data/loyalty_rules.md): Bronze 0-199, Silver 200-499,
# Gold 500-999, Platinum 1000+.
TIER_BOUNDS = (200, 500, 1000)


def _consent_constraints(consent: dict) -> list[str]:
    """Hard constraints the LLM must honor, derived from the secondary consent flags."""
    constraints: list[str] = []
    if not consent.get("email_marketing"):
        constraints.append(
            "email_marketing is OFF: do NOT propose any email-based offer, coupon, "
            "newsletter, or email channel."
        )
    if not consent.get("data_sharing"):
        constraints.append(
            "data_sharing is OFF: use first-party data only; do NOT propose any reward "
            "that depends on cross-store, partner, or third-party data."
        )
    return constraints


def _consent_notes(consent: dict) -> str:
    """Plain-language summary of how the consent flags shaped the journey."""
    parts = [
        "email-channel offers allowed"
        if consent.get("email_marketing")
        else "email marketing OFF - no email-based offers or channels",
        "cross-store / third-party rewards allowed"
        if consent.get("data_sharing")
        else "data sharing OFF - first-party rewards only",
    ]
    return "; ".join(parts)


class AgentState(TypedDict, total=False):
    customer_id: str
    customer: dict
    consent: dict
    personalization_applied: bool
    segment: str
    purchase_history: list[dict]
    rules: list[str]
    journey: dict
    attempts: int
    validation: dict
    result: dict


# --- Output schema (enforced with Pydantic) -----------------------------


class RewardModel(BaseModel):
    reward: str
    reason: str


class JourneyModel(BaseModel):
    """The PRD section 7 loyalty_journey schema."""

    current_tier: str
    recommended_action: str
    rewards: list[RewardModel]
    next_best_offer: str
    message: str


class JourneyResultModel(BaseModel):
    """The full agent response, validated before it leaves the agent."""

    customer_id: str
    personalization_applied: bool
    segment: str
    consent_flags: dict
    consent_notes: str
    validation_passed: bool
    reasoning: str
    loyalty_journey: JourneyModel


MAX_ATTEMPTS = 3  # 1 draft + up to 2 self-corrections


# --- Consent gate (always first) ----------------------------------------


def consent_gate(state: AgentState) -> dict[str, Any]:
    """Step 2: load the customer and check consent FIRST."""
    customer = tools.get_customer(state["customer_id"])
    if customer is None:
        # Surfaces as a 404 at the API layer (PRD section 9).
        raise ValueError(f"Customer not found: {state['customer_id']}")
    consent = tools.check_consent(state["customer_id"])
    return {
        "customer": customer,
        "consent": consent,
        "personalization_applied": bool(consent.get("personalization")),
    }


def route_on_consent(state: AgentState) -> str:
    """Conditional edge: personalize only if consent allows it (non-negotiable)."""
    return "classify" if state["personalization_applied"] else "generic_offer"


def generic_offer(state: AgentState) -> dict[str, Any]:
    """Consent-off path: deterministic generic offer, no personalization, stop."""
    customer = state["customer"]
    result = {
        "customer_id": customer["customer_id"],
        "personalization_applied": False,
        "segment": "consent_off",
        "consent_flags": state.get("consent", {}),
        "consent_notes": "personalization OFF - generic offer only; secondary flags not applied",
        "validation_passed": True,
        "reasoning": "Consent off: served the standard generic offer; no personalization or profiling performed.",
        "loyalty_journey": {
            "current_tier": customer["loyalty_tier"],
            "recommended_action": "Show the standard program offer (personalization is turned off).",
            "rewards": [],
            "next_best_offer": GENERIC_OFFER,
            "message": f"Thanks for being a loyalty member! {GENERIC_OFFER}",
        },
    }
    return {"result": JourneyResultModel(**result).model_dump()}


# --- Situational routing (the agent decides, not a fixed pipeline) -------


def _points_to_next(points: int) -> int:
    for bound in TIER_BOUNDS:
        if points < bound:
            return bound - points
    return 0  # already platinum


def _latest_purchase(history: list[dict]) -> str | None:
    dates = [p["date"] for p in history if p.get("date")]
    return max(dates) if dates else None


@lru_cache(maxsize=1)
def _dataset_as_of() -> str | None:
    """Treat the most recent purchase date in the dataset as 'now'.

    The demo/scaled data is historical, so recency must be measured relative to the
    dataset's own latest date rather than the wall clock. Cached (restart to refresh).
    """
    dates = [
        p["date"]
        for c in tools.get_all_customers()
        for p in c["purchase_history"]
        if p.get("date")
    ]
    return max(dates) if dates else None


def _classify_segment(customer: dict) -> str:
    """Observe the customer's situation and pick a journey strategy.

    Priority: brand-new -> lapsing -> near a tier threshold -> established.
    """
    history = customer.get("purchase_history", [])
    if len(history) <= 1:
        return "new"

    as_of, latest = _dataset_as_of(), _latest_purchase(history)
    if as_of and latest:
        days_since = (date.fromisoformat(as_of) - date.fromisoformat(latest)).days
        if days_since > 90:
            return "lapsing"

    if customer["loyalty_tier"] != "platinum" and 0 < _points_to_next(customer["points"]) <= 200:
        return "near_threshold"

    return "established"


def classify(state: AgentState) -> dict[str, Any]:
    """Step 3a: decide which journey strategy fits this customer."""
    return {"segment": _classify_segment(state["customer"])}


def route_by_segment(state: AgentState) -> str:
    """Conditional edge: choose the gather node for the customer's situation."""
    return {
        "new": "gather_welcome",
        "lapsing": "gather_reengage",
        "near_threshold": "gather_upgrade",
        "established": "gather_general",
    }[state["segment"]]


# Each segment retrieves DIFFERENT rules (different tool path).
SEGMENT_QUERIES = {
    "new": "welcome offers, first purchase 50-point welcome bonus, new member and bronze tier benefits",
    "lapsing": "re-engagement bonus, winning back a lapsed customer, points for returning, recent-purchase rules",
    "near_threshold": "loyalty tier thresholds, promotion nudge within 200 points of the next tier, tier benefits",
    "established": "category affinity reward and next-best-offer for a {tier} customer who buys {cats}; tier benefits",
}


def _gather(state: AgentState, segment: str) -> dict[str, Any]:
    """Step 3b: fetch purchase history and retrieve segment-specific rules (RAG)."""
    customer = state["customer"]
    history = customer["purchase_history"]
    categories = sorted({p["category"] for p in history})
    query = SEGMENT_QUERIES[segment].format(
        tier=customer["loyalty_tier"], cats=", ".join(categories) or "various items"
    )
    rules = tools.retrieve_rules(query, k=3)
    return {"purchase_history": history, "rules": rules, "segment": segment}


def gather_welcome(state: AgentState) -> dict[str, Any]:
    return _gather(state, "new")


def gather_reengage(state: AgentState) -> dict[str, Any]:
    return _gather(state, "lapsing")


def gather_upgrade(state: AgentState) -> dict[str, Any]:
    return _gather(state, "near_threshold")


def gather_general(state: AgentState) -> dict[str, Any]:
    return _gather(state, "established")


# --- Reasoning / generation ---------------------------------------------


SYSTEM_PROMPT = """You are a retail loyalty agent. Using the customer's data and the \
retrieved loyalty program rules, produce a personalized loyalty journey.

A journey_strategy has been selected for this customer based on their situation
(new, lapsing, near_threshold, or established) — tailor the journey to that strategy.

Respect the provided consent_constraints strictly — they are non-negotiable:
- If email_marketing is off, do NOT propose any email-based offer, coupon, or channel.
- If data_sharing is off, use first-party data only — no rewards that rely on cross-store,
  partner, or third-party data.

Return ONLY a valid JSON object (no markdown, no prose) with EXACTLY these keys:
{
  "current_tier": string,
  "recommended_action": string,
  "rewards": [{"reward": string, "reason": string}],
  "next_best_offer": string,
  "message": string
}
Ground every recommendation in the provided rules and the customer's actual purchase \
history, tier, and points. The message should be friendly and address the customer by name.

If revision_feedback is present, fix exactly those issues and return the corrected JSON."""


def _parse_journey(content: str) -> dict:
    """Parse the LLM output as JSON, falling back to brace extraction."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start != -1 and end != -1:
            return json.loads(content[start : end + 1])
        raise


def _build_payload(state: AgentState, feedback: list[str] | None = None) -> dict:
    customer = state["customer"]
    payload = {
        "customer": {
            "customer_id": customer["customer_id"],
            "name": customer["name"],
            "loyalty_tier": customer["loyalty_tier"],
            "points": customer["points"],
            "purchase_history": state["purchase_history"],
        },
        "journey_strategy": state.get("segment", "established"),
        "consent_constraints": _consent_constraints(state.get("consent", {})),
        "retrieved_rules": state["rules"],
    }
    if feedback:
        payload["revision_feedback"] = feedback
    return payload


def _call_llm(payload: dict) -> dict:
    """Call the NIM LLM and parse a JSON journey (with one JSON-parse retry)."""
    client = get_client()
    last_error: Exception | None = None
    for _ in range(2):
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload)},
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content
        try:
            return _parse_journey(content)
        except json.JSONDecodeError as exc:
            last_error = exc
    raise ValueError(f"LLM did not return valid JSON: {last_error}")


def reason_and_generate(state: AgentState) -> dict[str, Any]:
    """Step 4: draft the structured journey (first attempt)."""
    return {"journey": _call_llm(_build_payload(state)), "attempts": 1}


_WORD = re.compile(r"[a-z]{4,}")


def _validate(journey: dict, state: AgentState) -> tuple[bool, list[str]]:
    """Self-critique: (c) schema, (a) rule-grounding, (b) consent compliance."""
    issues: list[str] = []

    # (c) valid JSON matching the PRD schema.
    try:
        JourneyModel(**journey)
    except ValidationError as exc:
        return False, [f"schema invalid: {exc.errors()[0]['msg']}"]

    # (a) every reward must be grounded in the retrieved rules (or the customer's
    #     own categories/tier that those rules reference) — no invented rewards.
    ground = set(_WORD.findall(" ".join(state.get("rules", [])).lower()))
    ground |= {p["category"].lower() for p in state.get("purchase_history", [])}
    ground |= {state["customer"]["loyalty_tier"].lower(), "points", "tier"}
    for rw in journey["rewards"]:
        text = f"{rw['reward']} {rw['reason']}".lower()
        if not (set(_WORD.findall(text)) & ground):
            issues.append(f"reward '{rw['reward']}' is not grounded in any retrieved rule")

    # (b) no recommendation may violate a consent flag.
    blob = json.dumps(journey).lower()
    consent = state.get("consent", {})
    if not consent.get("email_marketing") and "email" in blob:
        issues.append("email content present but email_marketing consent is off")
    if not consent.get("data_sharing") and any(
        kw in blob for kw in ("third-party", "third party", "cross-store", "cross store", "partner data")
    ):
        issues.append("third-party/cross-store reward present but data_sharing consent is off")

    return (not issues), issues


def validate(state: AgentState) -> dict[str, Any]:
    """Step 5: critique the draft against rules, consent, and schema."""
    passed, issues = _validate(state["journey"], state)
    return {"validation": {"passed": passed, "issues": issues}}


def route_after_validation(state: AgentState) -> str:
    """Loop back to revise on failure, up to MAX_ATTEMPTS; otherwise finalize."""
    v = state["validation"]
    if v["passed"] or state.get("attempts", 1) >= MAX_ATTEMPTS:
        return "finalize"
    return "revise"


def revise(state: AgentState) -> dict[str, Any]:
    """Self-correct: regenerate, feeding the validation issues back to the LLM."""
    return {
        "journey": _call_llm(_build_payload(state, feedback=state["validation"]["issues"])),
        "attempts": state.get("attempts", 1) + 1,
    }


def _safe_journey(customer: dict) -> dict:
    return {
        "current_tier": customer["loyalty_tier"],
        "recommended_action": "Keep earning points on every purchase.",
        "rewards": [],
        "next_best_offer": GENERIC_OFFER,
        "message": f"Hi {customer['name']}, thanks for being a loyalty member!",
    }


def finalize(state: AgentState) -> dict[str, Any]:
    """Assemble the final, Pydantic-enforced result."""
    customer = state["customer"]
    v = state["validation"]
    attempts = state.get("attempts", 1)
    try:
        journey = JourneyModel(**state["journey"]).model_dump()
        passed, issues = v["passed"], v["issues"]
    except ValidationError:
        journey = _safe_journey(customer)
        passed = False
        issues = v["issues"] + ["schema invalid after retries; used safe fallback"]

    if passed:
        reasoning = (
            f"Rewards grounded in retrieved rules and compliant with consent flags; "
            f"validation passed on attempt {attempts}."
        )
    else:
        reasoning = f"Validation did not fully pass after {attempts} attempt(s): " + "; ".join(issues[:3])

    result = {
        "customer_id": customer["customer_id"],
        "personalization_applied": True,
        "segment": state.get("segment", "established"),
        "consent_flags": state.get("consent", {}),
        "consent_notes": _consent_notes(state.get("consent", {})),
        "validation_passed": passed,
        "reasoning": reasoning,
        "loyalty_journey": journey,
    }
    return {"result": JourneyResultModel(**result).model_dump()}


# --- Graph ---------------------------------------------------------------


def _build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("consent_gate", consent_gate)
    graph.add_node("generic_offer", generic_offer)
    graph.add_node("classify", classify)
    graph.add_node("gather_welcome", gather_welcome)
    graph.add_node("gather_reengage", gather_reengage)
    graph.add_node("gather_upgrade", gather_upgrade)
    graph.add_node("gather_general", gather_general)
    graph.add_node("reason_and_generate", reason_and_generate)
    graph.add_node("validate", validate)
    graph.add_node("revise", revise)
    graph.add_node("finalize", finalize)

    graph.set_entry_point("consent_gate")
    # Gate 1: consent (non-negotiable, always first).
    graph.add_conditional_edges(
        "consent_gate",
        route_on_consent,
        {"classify": "classify", "generic_offer": "generic_offer"},
    )
    # Gate 2: situational routing — the agent picks the tool path.
    graph.add_conditional_edges(
        "classify",
        route_by_segment,
        {
            "gather_welcome": "gather_welcome",
            "gather_reengage": "gather_reengage",
            "gather_upgrade": "gather_upgrade",
            "gather_general": "gather_general",
        },
    )
    for node in ("gather_welcome", "gather_reengage", "gather_upgrade", "gather_general"):
        graph.add_edge(node, "reason_and_generate")
    # Self-critique loop: draft -> validate -> (revise -> validate)* -> finalize.
    graph.add_edge("reason_and_generate", "validate")
    graph.add_conditional_edges(
        "validate",
        route_after_validation,
        {"revise": "revise", "finalize": "finalize"},
    )
    graph.add_edge("revise", "validate")
    graph.add_edge("finalize", END)
    graph.add_edge("generic_offer", END)
    return graph.compile()


_AGENT = _build_graph()


def generate_journey(customer_id: str) -> dict:
    """Run the agent for one customer and return the loyalty journey JSON."""
    final_state = _AGENT.invoke({"customer_id": customer_id})
    return final_state["result"]
