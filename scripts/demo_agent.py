"""Live demo of the three agentic behaviors (routing, multi-flag consent, self-critique).

Runs the real NVIDIA agent over a representative sample of customers and prints the
fields that reveal each behavior. Respects CUSTOMERS_FILE, e.g.:

    set CUSTOMERS_FILE=data/customers_large.json
    python scripts/demo_agent.py

The first personalized call builds the FAISS rules index once (a few seconds), then
subsequent calls are fast.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import agent, tools  # noqa: E402


def pick(custs, pred):
    for c in custs:
        if pred(c):
            return c["customer_id"]
    return None


def main() -> None:
    custs = tools.get_all_customers()

    chosen = [
        ("consent OFF (gate stops personalization)", pick(custs, lambda c: not c["consent_flags"]["personalization"])),
        ("personalization ON, email OFF", pick(custs, lambda c: c["consent_flags"]["personalization"] and not c["consent_flags"]["email_marketing"])),
        ("fully consented", pick(custs, lambda c: all(c["consent_flags"].values()))),
        ("new customer (routing)", pick(custs, lambda c: c["consent_flags"]["personalization"] and len(c["purchase_history"]) <= 1)),
    ]

    for label, cid in chosen:
        if not cid:
            continue
        c = tools.get_customer(cid)
        r = agent.generate_journey(cid)
        cf = c["consent_flags"]
        print("=" * 78)
        print(f"{label}   [{cid} {c['name']}]")
        print(f"  consent: personalization={cf['personalization']} email={cf['email_marketing']} data={cf['data_sharing']}")
        print(f"  [routing]    segment = {r.get('segment')}   personalization_applied = {r['personalization_applied']}")
        print(f"  [consent]    consent_notes = {r.get('consent_notes')}")
        print(f"  [self-check] validation_passed = {r['validation_passed']}")
        print(f"               reasoning = {r['reasoning']}")
        lj = r["loyalty_journey"]
        print(f"  recommended_action = {lj['recommended_action']}")
        if lj["rewards"]:
            print(f"  first reward       = {lj['rewards'][0]['reward']} - {lj['rewards'][0]['reason']}")
        print(f"  next_best_offer    = {lj['next_best_offer']}")
        print()


if __name__ == "__main__":
    main()
