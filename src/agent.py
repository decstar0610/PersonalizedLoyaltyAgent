"""LangGraph loyalty agent: consent-gated, RAG-grounded reasoning loop.

Implements the Agent Logic Flow in docs/PRD.md section 8 and produces the output
schema in section 7. Consent is checked FIRST: if personalization is off, the agent
returns a generic offer (personalization_applied=false) and stops without any
history-based reasoning. Otherwise it gathers context (purchase history + retrieved
rules) and asks the NIM LLM to produce the structured loyalty journey.
"""

import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from src import tools
from src.config import LLM_MODEL, get_client

# Generic, non-personalized offer used when consent is off (from data/loyalty_rules.md).
GENERIC_OFFER = "Enjoy 5% off your next purchase and earn points on every order."


class AgentState(TypedDict, total=False):
    customer_id: str
    customer: dict
    personalization_applied: bool
    purchase_history: list[dict]
    rules: list[str]
    result: dict


# --- Nodes ---------------------------------------------------------------


def consent_gate(state: AgentState) -> dict[str, Any]:
    """Step 2: load the customer and check consent FIRST."""
    customer = tools.get_customer(state["customer_id"])
    if customer is None:
        # Surfaces as a 404 at the API layer (PRD section 9).
        raise ValueError(f"Customer not found: {state['customer_id']}")
    consent = tools.check_consent(state["customer_id"])
    return {
        "customer": customer,
        "personalization_applied": bool(consent.get("personalization")),
    }


def route_on_consent(state: AgentState) -> str:
    """Conditional edge: personalize only if consent allows it."""
    return "gather_context" if state["personalization_applied"] else "generic_offer"


def generic_offer(state: AgentState) -> dict[str, Any]:
    """Consent-off path: deterministic generic offer, no personalization, stop."""
    customer = state["customer"]
    result = {
        "customer_id": customer["customer_id"],
        "personalization_applied": False,
        "loyalty_journey": {
            "current_tier": customer["loyalty_tier"],
            "recommended_action": "Show the standard program offer (personalization is turned off).",
            "rewards": [],
            "next_best_offer": GENERIC_OFFER,
            "message": f"Thanks for being a loyalty member! {GENERIC_OFFER}",
        },
    }
    return {"result": result}


def gather_context(state: AgentState) -> dict[str, Any]:
    """Step 3: fetch purchase history and retrieve relevant loyalty rules (RAG)."""
    customer_id = state["customer_id"]
    history = tools.get_purchase_history(customer_id)
    categories = sorted({p["category"] for p in history})
    query = (
        f"loyalty tier benefits, point thresholds, category rewards, and re-engagement "
        f"rules for a {state['customer']['loyalty_tier']} customer who buys "
        f"{', '.join(categories) or 'various items'}"
    )
    rules = tools.retrieve_rules(query, k=3)
    return {"purchase_history": history, "rules": rules}


SYSTEM_PROMPT = """You are a retail loyalty agent. Using the customer's data and the \
retrieved loyalty program rules, produce a personalized loyalty journey.

Return ONLY a valid JSON object (no markdown, no prose) with EXACTLY these keys:
{
  "current_tier": string,
  "recommended_action": string,
  "rewards": [{"reward": string, "reason": string}],
  "next_best_offer": string,
  "message": string
}
Ground every recommendation in the provided rules and the customer's actual purchase \
history, tier, and points. The message should be friendly and address the customer by name."""


def _parse_journey(content: str) -> dict:
    """Parse the LLM output as JSON, falling back to brace extraction."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start != -1 and end != -1:
            return json.loads(content[start : end + 1])
        raise


def reason_and_generate(state: AgentState) -> dict[str, Any]:
    """Steps 4-5: LLM reasons over context and emits the structured journey."""
    customer = state["customer"]
    user_payload = {
        "customer": {
            "customer_id": customer["customer_id"],
            "name": customer["name"],
            "loyalty_tier": customer["loyalty_tier"],
            "points": customer["points"],
            "purchase_history": state["purchase_history"],
        },
        "retrieved_rules": state["rules"],
    }

    client = get_client()
    # One retry to satisfy the PRD's "JSON parsing with fallback/retry" mitigation.
    last_error: Exception | None = None
    for attempt in range(2):
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content
        try:
            journey = _parse_journey(content)
            break
        except json.JSONDecodeError as exc:
            last_error = exc
    else:
        raise ValueError(f"LLM did not return valid JSON: {last_error}")

    result = {
        "customer_id": customer["customer_id"],
        "personalization_applied": True,
        "loyalty_journey": journey,
    }
    return {"result": result}


# --- Graph ---------------------------------------------------------------


def _build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("consent_gate", consent_gate)
    graph.add_node("generic_offer", generic_offer)
    graph.add_node("gather_context", gather_context)
    graph.add_node("reason_and_generate", reason_and_generate)

    graph.set_entry_point("consent_gate")
    graph.add_conditional_edges(
        "consent_gate",
        route_on_consent,
        {"gather_context": "gather_context", "generic_offer": "generic_offer"},
    )
    graph.add_edge("gather_context", "reason_and_generate")
    graph.add_edge("reason_and_generate", END)
    graph.add_edge("generic_offer", END)
    return graph.compile()


_AGENT = _build_graph()


def generate_journey(customer_id: str) -> dict:
    """Run the agent for one customer and return the loyalty journey JSON."""
    final_state = _AGENT.invoke({"customer_id": customer_id})
    return final_state["result"]
