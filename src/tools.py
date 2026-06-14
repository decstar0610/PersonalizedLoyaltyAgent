"""Agent tools: purchase history, consent check, and rules retrieval.

See docs/PRD.md section 5 (the three tools) and section 8 (Agent Logic Flow).
`retrieve_rules` is the RAG tool defined in src/rag.py and re-exported here so the
agent has a single tool module.
"""

import json

from src import config
from src.rag import retrieve_rules  # re-exported as the third tool


def _load_customers() -> list[dict]:
    with open(config.CUSTOMERS_FILE, encoding="utf-8") as f:
        return json.load(f)


def get_all_customers() -> list[dict]:
    """Return every customer record (drives the UI dropdown and profile panel)."""
    return _load_customers()


def get_customer(customer_id: str) -> dict | None:
    """Return the full customer record, or None if not found (drives the 404)."""
    for customer in _load_customers():
        if customer["customer_id"] == customer_id:
            return customer
    return None


def get_purchase_history(customer_id: str) -> list[dict]:
    """Tool 1 — return a customer's purchase history (items, categories, amounts, dates)."""
    customer = get_customer(customer_id)
    return customer["purchase_history"] if customer else []


def check_consent(customer_id: str) -> dict:
    """Tool 2 — return a customer's consent flags. Empty dict if customer not found."""
    customer = get_customer(customer_id)
    return customer["consent_flags"] if customer else {}


__all__ = [
    "get_customer",
    "get_all_customers",
    "get_purchase_history",
    "check_consent",
    "retrieve_rules",
]
