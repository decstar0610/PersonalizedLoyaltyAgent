# PS100 Loyalty Program Rules

These are the official loyalty program rules. The agent retrieves the relevant
sections via RAG (FAISS + NVIDIA NIM embeddings) and grounds its recommendations in them.

## Loyalty Tiers

Tiers are determined by the customer's lifetime points balance.

| Tier | Points range |
|---|---|
| Bronze | 0 – 199 |
| Silver | 200 – 499 |
| Gold | 500 – 999 |
| Platinum | 1000+ |

A customer is promoted to the next tier as soon as their points reach the lower
bound of that tier. Promotions are evaluated continuously.

## Earning Points

- Earn 1 point for every 100 spent.
- Sportswear and nutrition categories earn a 2x points multiplier during the quarter.
- A customer's first purchase earns a 50-point welcome bonus.

## Tier Benefits

- **Bronze:** Welcome offers and birthday reward.
- **Silver:** 5% off select categories, early access to seasonal sales.
- **Gold:** 10% off select categories, free shipping, priority support.
- **Platinum:** 15% off, free shipping, dedicated concierge, exclusive product drops.

## Rewards & Offers

- **Category affinity reward:** If 50% or more of a customer's purchases fall in a single
  category, offer a bundle or discount tailored to that category.
- **Next-best-offer:** Recommend a discount on the customer's most-purchased category.
- **Re-engagement bonus:** If a customer has made 2 or more purchases in the last 60 days,
  grant a 50-point re-engagement bonus.
- **Promotion nudge:** If a customer is within 200 points of the next tier, surface a
  message encouraging them to reach it, including the exact points remaining.

## Consent & Personalization (Responsible AI)

- Personalization is gated on `consent_flags.personalization`.
- If `personalization` is `false`, the customer must receive **only a generic, non-personalized
  offer** — no purchase-history-based reasoning, no targeted rewards.
- `email_marketing` and `data_sharing` flags govern channel and data use but do not, on their
  own, unlock personalization.

## Generic Offer (consent-off fallback)

When personalization is not permitted, present the standard program-wide offer:
"Enjoy 5% off your next purchase and earn points on every order."
