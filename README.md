# LoyaltyForge — Personalized Reward Journeys

> _NVIDIA final-project submission · PS100_

An **agentic AI system** for retail & e-commerce that autonomously generates an
individualized loyalty reward journey for each customer based on their purchase history,
loyalty tier/points, and explicit **consent flags** — running end-to-end on the
**NVIDIA NIM** stack.

Unlike a rule-based loyalty program where everyone in a tier gets the same offers, this
agent *reasons* about each customer: it checks consent, retrieves the applicable loyalty
rules via RAG, and produces a tailored journey — while strictly respecting privacy choices.

> Full spec: [`docs/PRD.md`](docs/PRD.md)

---

## Key Features

- **Consent-aware gating** *(differentiator)* — if `consent_flags.personalization == false`,
  the agent returns only a **generic** offer and stops. No personalization without consent.
- **Multi-flag consent reasoning** — with `email_marketing` off it proposes no email channel;
  with `data_sharing` off it stays first-party only. The output records how consent shaped it.
- **Dynamic tool routing** — LangGraph conditional edges classify each customer (new, lapsing,
  near-threshold, established) and route to a situation-specific rule path. Not a fixed pipeline.
- **Loyalty rules retrieval (RAG)** — FAISS vector store over the rules document, using
  NVIDIA NIM embeddings.
- **Self-critique loop** — a validation node checks reward grounding, consent compliance, and
  schema; the agent revises and re-validates (≤2 retries). Output is Pydantic-enforced.
- **Structured journey output** — tier, recommended action, rewards with reasons,
  next-best-offer, personalized message, plus segment, consent notes, and validation result.
- **Demo + API** — a premium React "Customer Journey Studio" (primary) and a Streamlit backup,
  over a FastAPI service (`POST /generate-journey`, `GET /customers`, `GET /health`).

---

## Architecture

```
   USER · React Studio / API  (customer_id)
                 ↓
   CONSENT GATE ─────────────► personalization off → generic offer, STOP
                 ↓ (consent on)
   CLASSIFY + ROUTE            new · lapsing · near-threshold · established
                 ↓             segment-specific rules (FAISS RAG, NIM embeddings)
   DRAFT (NVIDIA NIM LLM)      honors consent constraints
                 ↓
   VALIDATE ⇄ REVISE           grounding · consent · schema (≤ 2 retries)
                 ↓
   FINALIZE (Pydantic) ──────► Journey JSON → React Studio / Streamlit

   DATA: customers.json (or CUSTOMERS_FILE) · loyalty_rules.md · FAISS index
```

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | NVIDIA NIM — `meta/llama-3.1-70b-instruct` |
| Embeddings | NVIDIA NIM — `nvidia/nv-embedqa-e5-v5` |
| Agent framework | LangGraph / LangChain |
| Output schema | Pydantic |
| Vector store | FAISS (`faiss-cpu`) |
| Backend API | FastAPI + Uvicorn |
| Studio UI | React + Vite + Tailwind |
| Backup UI | Streamlit |
| Data | JSON + Markdown (swappable via `CUSTOMERS_FILE`) |
| Language | Python 3.10+ / TypeScript |

---

## Project Structure

```
.
├── api/main.py                  # FastAPI: GET /customers, POST /generate-journey
├── app/streamlit_app.py         # Streamlit demo UI (simple, backup)
├── web/                         # Customer Journey Studio — premium React UI (Vite + TS)
│   └── src/                     #   App.tsx, api.ts (backend client), studio.ts (metrics)
├── data/customers.json          # 5 curated demo customers (incl. one consent-off)
├── data/loyalty_rules.md        # loyalty rules document (RAG source)
├── docs/PRD.md                  # Product Requirements Document
├── scripts/generate_customers.py        # synthetic data generator (scalability)
├── scripts/ingest_customer_personality.py # Kaggle dataset -> agent schema
├── scripts/demo_agent.py                # live demo of the three agentic behaviors
├── src/config.py                # NIM client + configurable data source
├── src/agent.py                 # LangGraph agent: routing, multi-flag consent, self-critique
├── src/rag.py                   # FAISS RAG pipeline (NIM embeddings)
├── src/tools.py                 # agent tools
├── tests/                       # pytest: consent, routing, multi-flag consent, self-critique
├── start-demo.ps1               # one-command demo launcher (backend + studio)
├── .env.example                 # NVIDIA_API_KEY template
└── requirements.txt
```

---

## Setup

Requires **Python 3.10+** and an **NVIDIA NIM API key** (get one at
[build.nvidia.com](https://build.nvidia.com/)).

```bash
# 1. Clone
git clone <repo-url>
cd PersonalizedLoyaltyAgent-nvidia

# 2. Create & activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure your API key
cp .env.example .env        # Windows: copy .env.example .env
# then edit .env and set NVIDIA_API_KEY=...
```

---

## Usage

> Personalized journeys require a valid `NVIDIA_API_KEY`. Consent-off customers
> return a deterministic generic offer and run without any API call.

**Run the API:**
```bash
uvicorn api.main:app --reload
```
```bash
curl -X POST http://localhost:8000/generate-journey \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "C001"}'
```
Errors: `404` if the customer is unknown, `500` on LLM / retrieval failure.
Also available: `GET /customers` (list for the UI) and `GET /health`.

**Run the Customer Journey Studio (premium React UI):**

The flagship demo. A six-section studio — Customer Identity, Consent Intelligence,
Loyalty DNA, Agent Reasoning Workspace, Reward Journey Timeline, and Business Impact
Preview — all driven by the live NVIDIA agent, with consent enforced server-side.

```bash
# one command (Windows): starts the backend + studio and opens the browser
./start-demo.ps1
```
Or manually (needs Node 18+):
```bash
uvicorn api.main:app --port 8000      # terminal 1 — backend
cd web && npm install && npm run dev   # terminal 2 — studio (http://localhost:5173)
```
Studio metrics (Loyalty DNA, Business Impact) are derived deterministically from each
customer's real data and labelled "estimate"; the journey itself comes from the agent.

**Run the simple Streamlit UI (backup):**
```bash
streamlit run app/streamlit_app.py
```
Pick a customer, click **Generate loyalty journey**, and the app shows whether
personalization was applied along with the full journey.

**Run tests:**
```bash
pytest
```

---

## Testing & Reliability

The agent's safety-critical logic is covered by an automated `pytest` suite. The tests
run offline — the NVIDIA LLM and RAG retrieval are mocked — so they are fast,
deterministic, and need no API key or network. Their job is to catch regressions: if the
agent logic changes and breaks one of these guardrails, a test fails immediately.

The suite covers:
- **Consent gating** — a consent-off customer receives only the generic offer, with no personalization applied.
- **Segment routing** — customers are classified (new, lapsing, near-threshold, established) and sent down the matching rule path.
- **Multi-flag consent constraints** — the email and data-sharing flags produce the correct restrictions (no email channel when email is off; first-party only when data-sharing is off).
- **Self-critique loop** — the validator flags ungrounded rewards, consent violations, and schema errors, and the agent revises before finalizing.

These tests verify the deterministic guardrails and the output schema. They do not judge
the quality of the LLM's reasoning or wording — only that the rules around it hold. Run
them with:

```bash
pytest
```

---

## Example Output

**Personalized customer (consent granted):**
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

**Consent-off customer (personalization disabled):**
```json
{
  "customer_id": "C004",
  "personalization_applied": false,
  "segment": "consent_off",
  "validation_passed": true,
  "loyalty_journey": {
    "current_tier": "silver",
    "recommended_action": "Show the standard program offer (personalization is turned off).",
    "rewards": [],
    "next_best_offer": "Enjoy 5% off your next purchase and earn points on every order.",
    "message": "Thanks for being a loyalty member! Enjoy 5% off your next purchase and earn points on every order."
  }
}
```

---

## Scalability (optional)

Generate a large synthetic customer set without touching the curated demo data:
```bash
python scripts/generate_customers.py --count 200
```
Point the agent, API, and UI at it with no code changes via an env var:
```bash
# .env
CUSTOMERS_FILE=data/customers_large.json
```

To run on a **real** dataset, ingest the Kaggle *Customer Personality Analysis* set
(place `marketing_campaign.csv` in `data/`) — it aggregates per-customer category spend
into the agent's schema and synthesizes the missing consent flags:
```bash
python scripts/ingest_customer_personality.py   # -> data/customers_personality.json
```

See the three agentic behaviors on the current dataset with:
```bash
python scripts/demo_agent.py
```

---

## License

For NVIDIA final-project submission purposes.
