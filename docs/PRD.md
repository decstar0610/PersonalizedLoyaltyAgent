# Product Requirements Document (PRD)

## Project: LoyaltyForge — Personalized Reward Journeys (PS100)
**Domain:** Retail & E-commerce
**Category:** Agentic AI
**Submission:** NVIDIA Final Project
**Version:** 1.1
**Author:** Priyanka M
**Date:** 2026-06-14

---

## 1. Overview

LoyaltyForge (PS100) is an **agentic AI system** for the retail and e-commerce domain. It builds an
autonomous **loyalty agent** that creates individualized reward journeys for customers
based on their purchase history and explicit consent preferences.

Unlike a traditional rule-based loyalty program where every customer in a tier gets the
same offers, this agent **reasons** about each customer individually — selecting tools,
retrieving the relevant loyalty rules, and generating a tailored reward journey while
strictly respecting the customer's consent flags.

### Problem Statement
Retailers run generic, one-size-fits-all loyalty programs that fail to engage customers
and often ignore privacy/consent boundaries. Customers receive irrelevant offers, leading
to low redemption rates and churn.

### Solution
An agentic AI that:
1. Reads a customer's purchase history.
2. Checks consent flags **before** any personalization.
3. Retrieves applicable loyalty rules via RAG.
4. Reasons over all of it to produce a structured, personalized loyalty journey.

---

## 2. Goals & Non-Goals

### Goals
- Build a working agent that autonomously generates a personalized loyalty journey per customer.
- Use **NVIDIA NIM** for both LLM inference and embeddings (end-to-end NVIDIA stack).
- Enforce **consent-aware personalization** (no personalization without consent; honor secondary flags).
- Provide a clickable demo (React Customer Journey Studio + Streamlit) and a callable API (FastAPI).
- Ship a clean, documented GitHub repository.

### Non-Goals (out of scope for this version)
- Real production database (mock JSON data is sufficient for the MVP).
- Real payment / rewards fulfillment integration.
- User authentication / multi-tenant security.
- A/B testing or analytics pipelines.

---

## 3. Target Users

| User | Need |
|---|---|
| **Retail marketing team** | Automatically generate personalized offers at scale |
| **Customer** | Relevant rewards that respect their privacy choices |
| **Project evaluators (NVIDIA)** | A demonstrable, truly agentic AI using the NVIDIA stack |

---

## 4. Key Features

### F1 — Purchase History Analysis
The agent reads a customer's transaction history (items, categories, amounts, dates) to
understand buying patterns and frequency.

### F2 — Consent-Aware Gating & Multi-Flag Reasoning *(critical / differentiator)*
Before any personalization, the agent checks `consent_flags.personalization`. If `false`,
it returns only a **generic** offer and stops. When personalization is allowed, the agent
also reasons over the secondary flags: with `email_marketing` off it proposes no email-based
offers or channels, and with `data_sharing` off it uses first-party data only. The output
records how the consent flags shaped the journey. This is a responsible-AI feature.

### F3 — Loyalty Rules Retrieval (RAG)
Loyalty rules are stored as a document and retrieved via a FAISS vector store using NVIDIA
NIM embeddings, so the agent grounds its decisions in the actual program rules.

### F4 — Agentic Reasoning with Dynamic Routing
Using LangGraph conditional edges, the agent classifies each customer's situation
(new, lapsing, near a tier threshold, or established) and routes to a situation-specific
rule-retrieval path — it is not a single fixed pipeline or a prompt-response chatbot.
Consent is always the first, non-negotiable gate.

### F5 — Structured, Schema-Validated Output
The agent outputs structured JSON (current tier, recommended action, rewards with reasons,
next-best-offer, personalized message) plus the routing `segment`, the `consent_flags` and
`consent_notes`, and a `validation_passed` / `reasoning` pair. The full response is enforced
by Pydantic models before it leaves the agent.

### F6 — Demo Interfaces
A premium React dashboard (the "Customer Journey Studio") is the primary demo; a simpler
Streamlit app is kept as a backup. Both let a user select a customer and view the generated
journey, with consent state shown explicitly.

### F7 — API Endpoints
A FastAPI service exposes `POST /generate-journey` (the journey JSON), `GET /customers`
(the customer list for the UI), and `GET /health`.

### F8 — Self-Critique & Validation Loop
After drafting a journey, a validation node checks that every reward is grounded in the
retrieved rules, that no recommendation violates a consent flag, and that the output matches
the schema. On failure the agent revises and re-validates (up to two retries) before finalizing.

---

## 5. System Architecture

```
        ┌──────────────────────────────────┐
        │  USER · React Studio / API        │  (customer_id)
        └──────────────────┬───────────────┘
                           ↓
        ┌──────────────────────────────────┐
        │  CONSENT GATE                     │  personalization off → generic offer, STOP
        └──────────────────┬───────────────┘
                           ↓ (consent on)
        ┌──────────────────────────────────┐
        │  CLASSIFY + ROUTE                 │  new · lapsing · near-threshold · established
        └──────────────────┬───────────────┘
                           ↓  segment-specific rules (FAISS RAG, NIM embeddings)
        ┌──────────────────────────────────┐
        │  DRAFT  (NVIDIA NIM LLM)          │  honors consent constraints
        └──────────────────┬───────────────┘
                           ↓
        ┌──────────────────────────────────┐
        │  VALIDATE  ⇄  REVISE              │  grounding · consent · schema (≤ 2 retries)
        └──────────────────┬───────────────┘
                           ↓
        ┌──────────────────────────────────┐
        │  FINALIZE (Pydantic-enforced)     │  → Journey JSON → React Studio / Streamlit
        └──────────────────────────────────┘

   DATA: customers.json (or CUSTOMERS_FILE) · loyalty_rules.md · FAISS index
```

---

## 6. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| LLM | NVIDIA NIM — `meta/llama-3.1-70b-instruct` | Core NVIDIA requirement; reasoning engine |
| Embeddings | NVIDIA NIM — `nvidia/nv-embedqa-e5-v5` | Keeps stack fully NVIDIA |
| Agent framework | LangGraph / LangChain | Routing, validation, reason→act loop |
| Output schema | Pydantic | Enforces the response schema |
| Vector store | FAISS (faiss-cpu) | Lightweight RAG, no server needed |
| Backend API | FastAPI + Uvicorn | Clean, fast API |
| Studio UI | React + Vite + Tailwind | Primary demo dashboard |
| Backup UI | Streamlit | Simple fallback demo |
| Data | JSON + Markdown (swappable via `CUSTOMERS_FILE`) | No DB setup for MVP; dataset configurable |
| Language | Python 3.10+ / TypeScript | Backend / frontend |

---

## 7. Data Model

### Customer (`data/customers.json`)
```json
{
  "customer_id": "C001",
  "name": "Asha",
  "purchase_history": [
    {"item": "running shoes", "category": "sportswear", "amount": 4200, "date": "2025-03-10"}
  ],
  "consent_flags": {
    "personalization": true,
    "email_marketing": true,
    "data_sharing": false
  },
  "loyalty_tier": "silver",
  "points": 320
}
```

Optional `persona` and `avatar` fields may be added per customer to enrich the UI; the
agent ignores them.

### Loyalty Journey Output
The `loyalty_journey` object keeps the five core keys; the surrounding fields are added by
routing (`segment`), consent reasoning (`consent_flags`, `consent_notes`), and the
validation loop (`validation_passed`, `reasoning`). The whole response is Pydantic-validated.
```json
{
  "customer_id": "C001",
  "personalization_applied": true,
  "segment": "near_threshold",
  "consent_flags": { "personalization": true, "email_marketing": true, "data_sharing": false },
  "consent_notes": "email-channel offers allowed; data sharing OFF - first-party rewards only",
  "validation_passed": true,
  "reasoning": "Rewards grounded in retrieved rules and compliant with consent flags; validation passed on attempt 1.",
  "loyalty_journey": {
    "current_tier": "silver",
    "recommended_action": "Promote toward Gold (180 points away)",
    "rewards": [
      {"reward": "Fitness Bundle", "reason": "Frequent sportswear & nutrition buyer"},
      {"reward": "Re-engagement bonus (50 pts)", "reason": "2 purchases in 60 days"}
    ],
    "next_best_offer": "10% off next sportswear purchase",
    "message": "Hi Asha! You're 180 points from Gold..."
  }
}
```

---

## 8. Agent Logic Flow

1. **Input:** `customer_id`.
2. **Consent gate (always first):** load consent flags.
   - If `personalization == false` → return a generic offer, `personalization_applied: false`, **stop**.
3. **Classify & route:** observe the customer and pick a strategy — new, lapsing, near a tier
   threshold, or established — then route (LangGraph conditional edges) to the matching
   rule-retrieval path (RAG over the rules document).
4. **Draft:** the NIM LLM reasons over purchase history, tier, points, retrieved rules, and the
   consent constraints (no email channel if `email_marketing` off; first-party only if
   `data_sharing` off) and produces a structured journey.
5. **Validate & revise:** check that every reward is grounded in the rules, that no
   recommendation violates a consent flag, and that the output matches the schema. On failure,
   revise and re-validate (up to two retries).
6. **Finalize:** enforce the schema with Pydantic and return the journey JSON (with `segment`,
   `consent_notes`, `validation_passed`, `reasoning`) to the API / UI.

---

## 9. API Specification

### `POST /generate-journey`
**Request**
```json
{ "customer_id": "C001" }
```
**Response (200)** — see section 7 for the full shape.
```json
{ "customer_id": "C001", "personalization_applied": true, "validation_passed": true, "loyalty_journey": { ... } }
```
**Errors**
- `404` — customer not found
- `500` — LLM / retrieval failure

### `GET /customers`
Returns the full customer list (used by the dashboard dropdown and profile panel).

### `GET /health`
Returns `{ "status": "ok" }`.

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| Agent generates a valid journey for every customer in the dataset | 100% |
| Consent-off customer never receives personalized offers | 100% (hard requirement) |
| Output is valid JSON matching the Pydantic schema | 100% |
| Automated test suite passes (consent, routing, multi-flag consent, self-critique) | Yes |
| End-to-end demo runs without crashing | Yes |
| Repo has README + setup that a stranger can follow | Yes |

---

## 11. Milestones & Timeline

### With Claude Code (recommended) — ~1.5 days

| Block | Duration | Deliverable |
|---|---|---|
| Setup (NVIDIA key, Claude Code, repo) | 45 min | Environment ready |
| Scaffold + mock data | 1 hr | Structure + data committed |
| NIM client + RAG | 1.5 hr | LLM call + retrieval working |
| Tools + agent loop | 2 hr | Agent produces a journey |
| Consent gating + output | 1 hr | Both paths verified |
| API + Streamlit UI | 1.5 hr | Clickable demo |
| Debug | 1–2 hr | Stable |
| README + push + demo video | 1.5 hr | Submitted |

### Manual build (reference) — ~2 weeks
See project plan; critical path is data → NIM client → tools → agent → UI.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| NVIDIA API key / credits slow to activate | Set up the key on **day one** before coding |
| LLM returns non-JSON output | Strong system prompt + JSON parsing with fallback/retry |
| RAG adds complexity / time | MVP fallback: inject rules directly into the prompt, skip FAISS |
| Embeddings model unavailable | Swap to a different NIM embedding model or local embeddings |
| Running out of time | Ship MVP path: Streamlit only (skip FastAPI), hardcoded rules |

---

## 13. Future Enhancements
- Real database (Postgres) and live transaction feeds.
- Multi-agent setup (separate analysis, rules, and messaging agents).
- Reward fulfillment integration (email / push / coupon issuance).
- Feedback loop: learn from redemption rates to improve recommendations.
- Multilingual personalized messages.

---

## 14. Deliverables Checklist
- [x] GitHub repository (private)
- [x] Working agent (`src/agent.py`) — consent gate, dynamic routing, multi-flag consent, self-critique loop
- [x] RAG pipeline (`src/rag.py`)
- [x] FastAPI endpoints (`api/main.py`) — generate-journey, customers, health
- [x] React Customer Journey Studio (`web/`) + Streamlit backup (`app/streamlit_app.py`)
- [x] Demo customers incl. one consent-off (`data/customers.json`); scalable via `CUSTOMERS_FILE`
- [x] Tests (`tests/`) — 17 offline tests
- [x] README with architecture, setup, and Testing & Reliability
- [x] This PRD (`docs/PRD.md`)
- [ ] Demo video / screenshots
