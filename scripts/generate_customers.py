"""Generate N realistic synthetic customers for scalability testing.

Writes to a SEPARATE file (default data/customers_large.json) so the 5 curated
demo customers in data/customers.json are never overwritten. Records match the
PRD section 7 data model exactly. Standard library only.

Usage:
    python scripts/generate_customers.py --count 200
    python scripts/generate_customers.py --count 1000 --output data/customers_large.json --seed 42
"""

import argparse
import json
import os
import random
from datetime import date, timedelta

# Category -> realistic item pool (mirrors the demo data's style).
CATALOG = {
    "sportswear": ["running shoes", "yoga mat", "running shorts", "sports jacket", "gym gloves"],
    "nutrition": ["protein powder", "multivitamins", "energy bars", "electrolyte mix"],
    "electronics": ["wireless headphones", "mechanical keyboard", "4k monitor", "usb-c hub", "smartwatch", "bluetooth speaker"],
    "apparel": ["cotton kurta", "denim jeans", "linen shirt", "wool sweater", "summer dress"],
    "home": ["espresso machine", "cookware set", "air fryer", "scented candle set", "bedsheet set"],
    "books": ["bestseller novel", "cookbook", "sci-fi anthology", "biography"],
    "beauty": ["skincare serum", "lipstick", "face wash", "perfume"],
    "toys": ["board game", "building blocks", "jigsaw puzzle", "action figure"],
    "groceries": ["olive oil", "coffee beans", "assorted snacks", "tea sampler"],
}

NAMES = [
    "Aarav", "Asha", "Rahul", "Meera", "Vikram", "Sofia", "Diya", "Karan", "Priya", "Arjun",
    "Neha", "Rohan", "Ananya", "Ishaan", "Kavya", "Aditya", "Tara", "Dev", "Riya", "Sanjay",
    "Maya", "Nikhil", "Pooja", "Varun", "Leela", "Omar", "Zara", "Liam", "Emma", "Noah",
]

# Tier thresholds — kept consistent with data/loyalty_rules.md.
TIER_THRESHOLDS = [(1000, "platinum"), (500, "gold"), (200, "silver"), (0, "bronze")]


def tier_for_points(points: int) -> str:
    for threshold, name in TIER_THRESHOLDS:
        if points >= threshold:
            return name
    return "bronze"


def random_date(rng: random.Random) -> str:
    """A random date within 2025 (ISO format)."""
    start = date(2025, 1, 1)
    return (start + timedelta(days=rng.randint(0, 364))).isoformat()


def make_customer(index: int, rng: random.Random, consent_off_rate: float) -> dict:
    points = rng.randint(0, 1500)
    num_purchases = rng.randint(1, 8)
    purchase_history = []
    for _ in range(num_purchases):
        category = rng.choice(list(CATALOG))
        purchase_history.append(
            {
                "item": rng.choice(CATALOG[category]),
                "category": category,
                "amount": rng.randint(300, 25000),
                "date": random_date(rng),
            }
        )
    purchase_history.sort(key=lambda p: p["date"])

    personalization = rng.random() >= consent_off_rate
    return {
        "customer_id": f"L{index:05d}",
        "name": rng.choice(NAMES),
        "purchase_history": purchase_history,
        "consent_flags": {
            "personalization": personalization,
            "email_marketing": rng.random() < 0.7,
            "data_sharing": rng.random() < 0.4,
        },
        "loyalty_tier": tier_for_points(points),
        "points": points,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic loyalty customers.")
    parser.add_argument("--count", type=int, default=200, help="Number of customers to generate.")
    parser.add_argument("--output", default="data/customers_large.json", help="Output JSON path.")
    parser.add_argument("--seed", type=int, default=None, help="Optional RNG seed for reproducibility.")
    parser.add_argument("--consent-off-rate", type=float, default=0.2, help="Fraction with personalization=false.")
    args = parser.parse_args()

    # Guard: never clobber the curated demo file.
    if os.path.abspath(args.output) == os.path.abspath(os.path.join("data", "customers.json")):
        parser.error("Refusing to overwrite the curated demo file data/customers.json. Choose another --output.")

    rng = random.Random(args.seed)
    customers = [make_customer(i + 1, rng, args.consent_off_rate) for i in range(args.count)]

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(customers, f, indent=2)

    consent_off = sum(1 for c in customers if not c["consent_flags"]["personalization"])
    print(f"Wrote {len(customers)} customers to {args.output} ({consent_off} consent-off).")


if __name__ == "__main__":
    main()
