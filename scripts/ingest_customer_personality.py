"""Ingest the Kaggle "Customer Personality Analysis" dataset into the agent's schema.

Dataset: https://www.kaggle.com/datasets/imakash3011/customer-personality-analysis
File:    marketing_campaign.csv  (tab-separated, ~2,240 rows, one row per customer)

This rolls each customer's category spend + demographics into the PS100 customer
record (data/customers.json shape) so the existing agent runs on it unchanged — just
point CUSTOMERS_FILE at the output.

Two fields are SYNTHESIZED because the dataset has neither:
  * name                         -> anonymized "Member <ID>"
  * consent_flags.personalization-> deterministic from the ID (so it is reproducible
                                    and some members are consent-off for the demo)

Usage:
  python scripts/ingest_customer_personality.py \
      --input data/marketing_campaign.csv \
      --output data/customers_personality.json
  # then:  set CUSTOMERS_FILE=data/customers_personality.json   (or in .env)

No third-party dependencies — standard library only.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime

# Mnt* spend columns -> (item label, category token used by the agent/UI).
SPEND_COLUMNS = {
    "MntWines": ("Wine", "wine"),
    "MntFruits": ("Fruits", "fruits"),
    "MntMeatProducts": ("Meat products", "meat"),
    "MntFishProducts": ("Fish products", "fish"),
    "MntSweetProducts": ("Sweets", "sweets"),
    "MntGoldProds": ("Gold & premium", "gold"),
}

# Tier thresholds — kept in sync with web/src/studio.ts.
def tier_for(points: float) -> str:
    if points >= 1000:
        return "platinum"
    if points >= 500:
        return "gold"
    if points >= 250:
        return "silver"
    return "bronze"


def _num(row: dict, key: str) -> float:
    raw = (row.get(key) or "").strip()
    if not raw:
        return 0.0
    try:
        return float(raw)
    except ValueError:
        return 0.0


def _parse_date(raw: str) -> str:
    raw = (raw or "").strip()
    for fmt in ("%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _synthesize_consent(cid: int) -> dict:
    # Deterministic so runs are reproducible. ~80% personalization-on, with a clear
    # subset off so the consent gate is demonstrable.
    return {
        "personalization": (cid % 5) != 0,
        "email_marketing": (cid % 3) != 0,
        "data_sharing": (cid % 2) == 0,
    }


def _persona(row: dict, top_category: str) -> str:
    year_birth = int(_num(row, "Year_Birth")) or 0
    age = datetime.now().year - year_birth if year_birth else 0
    age_part = f"{age}-year-old " if 0 < age < 110 else ""
    education = (row.get("Education") or "").strip().lower() or "unspecified-education"
    marital = (row.get("Marital_Status") or "").strip().lower() or "unknown"
    income = _num(row, "Income")
    income_part = f", income ~{int(income):,}" if income else ""
    kids = int(_num(row, "Kidhome")) + int(_num(row, "Teenhome"))
    kids_part = f", {kids} child(ren) at home" if kids else ""
    cat_part = f"; strongest spend in {top_category}" if top_category else ""
    return f"{age_part}{education} shopper ({marital}{income_part}{kids_part}){cat_part}."


def convert_row(row: dict) -> dict | None:
    raw_id = (row.get("ID") or "").strip()
    if not raw_id:
        return None
    try:
        cid = int(float(raw_id))
    except ValueError:
        return None

    enrolled = _parse_date(row.get("Dt_Customer", ""))

    purchases = []
    for col, (item, category) in SPEND_COLUMNS.items():
        amount = _num(row, col)
        if amount > 0:
            purchases.append(
                {"item": item, "category": category, "amount": round(amount, 2), "date": enrolled}
            )

    if not purchases:
        return None  # no spend signal -> skip

    total = sum(p["amount"] for p in purchases)
    top_category = max(purchases, key=lambda p: p["amount"])["category"]
    points = int(round(total))
    name = f"Member {cid}"

    return {
        "customer_id": f"P{cid}",
        "name": name,
        "avatar": f"https://ui-avatars.com/api/?name={name.replace(' ', '+')}&background=0c1626&color=ddc488&size=150",
        "persona": _persona(row, top_category),
        "purchase_history": purchases,
        "consent_flags": _synthesize_consent(cid),
        "loyalty_tier": tier_for(points),
        "points": points,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=os.path.join("data", "marketing_campaign.csv"))
    parser.add_argument("--output", default=os.path.join("data", "customers_personality.json"))
    parser.add_argument("--limit", type=int, default=0, help="cap number of customers (0 = all)")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        raise SystemExit(
            f"Input not found: {args.input}\n"
            "Download marketing_campaign.csv from Kaggle and place it there."
        )

    with open(args.input, encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        delimiter = "\t" if sample.count("\t") >= sample.count(",") else ","
        reader = csv.DictReader(f, delimiter=delimiter)
        # Normalize header whitespace (the dataset has stray spaces, e.g. " Income ").
        reader.fieldnames = [(name or "").strip() for name in (reader.fieldnames or [])]

        customers = []
        for row in reader:
            row = {(k or "").strip(): v for k, v in row.items()}
            rec = convert_row(row)
            if rec:
                customers.append(rec)
            if args.limit and len(customers) >= args.limit:
                break

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(customers, f, indent=2)

    tiers: dict[str, int] = {}
    consent_off = 0
    for c in customers:
        tiers[c["loyalty_tier"]] = tiers.get(c["loyalty_tier"], 0) + 1
        if not c["consent_flags"]["personalization"]:
            consent_off += 1

    print(f"Wrote {len(customers)} customers -> {args.output}")
    print(f"  Tier distribution: {dict(sorted(tiers.items()))}")
    print(f"  Personalization OFF (consent gate demoable): {consent_off}")
    print(f"\nUse it:  set CUSTOMERS_FILE={args.output}   (or add to .env), then restart the app.")


if __name__ == "__main__":
    main()
