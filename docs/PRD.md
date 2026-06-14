# Product Requirements Document (PRD)

## Project: LoyaltyForge — Personalized Reward Journeys (PS100)
**Domain:** Retail & E-commerce
**Category:** Agentic AI
**Submission:** NVIDIA Final Project
**Version:** 1.0
**Author:** _[Your Name]_
**Date:** _[Fill in]_

---

## 1. Overview

PS100 is an **agentic AI system** for the retail and e-commerce domain. It builds an
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
- Enforce **consent-aware personalization** (no personalization without consent).
- Provide a clickable demo (Streamlit) and a callable API (FastAPI).
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

### F2 — Consent-Aware Gating *(critical / differentiator)*
Before any personalization, the agent checks `consent_flags.personalization`.
If `false`, it returns only a **generic** offer and stops. This is a responsible-AI feature.

### F3 — Loyalty Rules Retrieval (RAG)
Loyalty rules are stored as a document and retrieved via a FAISS vector store using NVIDIA
NIM embeddings, so the agent grounds its decisions in the actual program rules.

### F4 — Agentic Reasoning Loop
Using LangGraph, the agent observes the customer state, chooses which tools to call, and
reasons over the results — it is not a single prompt-response chatbot.

### F5 — Structured Loyalty Journey Output
The agent outputs structured JSON: current tier, recommended action, rewards with reasons,
next-best-offer, and a personalized customer message.

### F6 — Demo Interface
A Streamlit app lets a user select a customer and view the generated journey instantly.

### F7 — API Endpoint
A FastAPI `POST /generate-journey` endpoint returns the journey JSON for programmatic use.

---

## 5. System Architecture

```
            ┌──────────────────────────────┐
            │   USER / API  (customer_id)   │
            └───────────────┬──────────────┘
                            ↓
            ┌──────────────────────────────┐
            │       LOYALTY AGENT           │
            │  NVIDIA NIM LLM + LangGraph   │
            │  Observe → Reason → Act       │
            └───┬──────────┬──────────┬─────┘
                ↓          ↓          ↓
          ┌─────────┐ ┌─────────┐ ┌──────────┐
          │ Tool 1  │ │ Tool 2  │ │ Tool 3   │
          │ Purchase│ │ Consent │ │ Rules    │
          │ history │ │ check   │ │ (RAG)    │
          └─────────┘ └─────────┘ └──────────┘
                ↓          ↓          ↓
          ┌──────────────────────────────────┐
          │ DATA: customers.json, rules.md    │
          │ FAISS index (NIM embeddings)      │
          └──────────────────────────────────┘
                            ↓
          ┌──────────────────────────────────┐
          │ OUTPUT: Personalized Journey JSON │
          │ → Streamlit dashboard             │
          └──────────────────────────────────┘
```

---

## 6. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| LLM | NVIDIA NIM — `meta/llama-3.1-70b-instruct` | Core NVIDIA requirement; reasoning engine |
| Embeddings | NVIDIA NIM — `nvidia/nv-embedqa-e5-v5` | Keeps stack fully NVIDIA |
| Agent framework | LangGraph / LangChain | Builds the reason→act loop |
| Vector store | FAISS (faiss-cpu) | Lightweight RAG, no server needed |
| Backend API | FastAPI + Uvicorn | Clean, fast API |
| Demo UI | Streamlit | Quick, interactive demo |
| Data | JSON + Markdown | No DB setup for MVP |
| Language | Python 3.10+ | Standard |

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

### Loyalty Journey Output
```json
{
  "customer_id": "C001",
  "personalization_applied": true,
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
2. **Consent check (gate):** load consent flags.
   - If `personalization == false` → return generic offer, set `personalization_applied: false`, **stop**.
3. **Gather context:** fetch purchase history + retrieve relevant loyalty rules (RAG).
4. **Reason:** LLM analyzes patterns, tier status, point thresholds, and rules.
5. **Generate:** produce structured loyalty journey JSON.
6. **Output:** return JSON to API / display in Streamlit.

---

## 9. API Specification

### `POST /generate-journey`
**Request**
```json
{ "customer_id": "C001" }
```
**Response (200)**
```json
{ "customer_id": "C001", "personalization_applied": true, "loyalty_journey": { ... } }
```
**Errors**
- `404` — customer not found
- `500` — LLM / retrieval failure

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| Agent generates valid journey for all 5 mock customers | 100% |
| Consent-off customer never receives personalized offers | 100% (hard requirement) |
| Output is valid, parseable JSON | 100% |
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
- [ ] GitHub repository (public)
- [ ] Working agent (`src/agent.py`)
- [ ] RAG pipeline (`src/rag.py`)
- [ ] FastAPI endpoint (`api/main.py`)
- [ ] Streamlit demo (`app/streamlit_app.py`)
- [ ] 5 mock customers incl. one consent-off
- [ ] Tests (`tests/`)
- [ ] README with architecture + setup
- [ ] This PRD (`docs/PRD.md`)
- [ ] Demo video / screenshots
