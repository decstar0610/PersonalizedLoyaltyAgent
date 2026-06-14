# PS100 — Personalized Loyalty Agent

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

- **Purchase history analysis** — understands buying patterns and frequency.
- **Consent-aware gating** *(differentiator)* — if `consent_flags.personalization == false`,
  the agent returns only a **generic** offer and stops. No personalization without consent.
- **Loyalty rules retrieval (RAG)** — FAISS vector store over the rules document, using
  NVIDIA NIM embeddings.
- **Agentic reasoning loop** — LangGraph observe → reason → act, not a single prompt.
- **Structured journey output** — tier, recommended action, rewards with reasons,
  next-best-offer, and a personalized message.
- **Demo + API** — Streamlit app and a FastAPI `POST /generate-journey` endpoint.

---

## Architecture

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

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | NVIDIA NIM — `meta/llama-3.1-70b-instruct` |
| Embeddings | NVIDIA NIM — `nvidia/nv-embedqa-e5-v5` |
| Agent framework | LangGraph / LangChain |
| Vector store | FAISS (`faiss-cpu`) |
| Backend API | FastAPI + Uvicorn |
| Demo UI | Streamlit |
| Data | JSON + Markdown |
| Language | Python 3.10+ |

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
├── scripts/generate_customers.py# synthetic data generator (scalability)
├── src/config.py                # NIM client + configurable data source
├── src/agent.py                 # LangGraph loyalty agent
├── src/rag.py                   # FAISS RAG pipeline (NIM embeddings)
├── src/tools.py                 # agent tools
├── tests/test_agent.py          # pytest: consent-off + personalized
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

## Example Output

**Personalized customer (consent granted):**
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

**Consent-off customer (personalization disabled):**
```json
{
  "customer_id": "C004",
  "personalization_applied": false,
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

---

## License

For NVIDIA final-project submission purposes.
