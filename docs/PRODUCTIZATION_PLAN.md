# LoyaltyForge — Productization Plan

> From a localhost NVIDIA-submission demo to a **public, multi-user SaaS** anyone can sign up for.
>
> **Status:** Phase 0 ✅ SHIPPED & LIVE · **Hosting target:** free tier · **Owner:** Priyanka M · **Created:** 2026-07-21

**Live now:**
- App (Studio): https://personalized-loyalty-agent.vercel.app
- API: https://loyaltyforge-api.onrender.com
- Restore point for the pre-redesign version: git tag `v1.0-live` / branch `stable/v1.0-live`.

---

## 1. Goal

Turn LoyaltyForge from a locally-run demo into a real product where **any user can sign up, upload
their own customers, run the consent-aware loyalty agent, and see their saved results** — reachable
at a public URL, on free-tier infrastructure.

## 2. Guiding principles & hard constraints

These shape every phase. Read them before the phases.

1. **The NVIDIA API key never leaves the server.** It lives only in the backend host's environment
   variables — never in the repo, never shipped to the browser. The frontend always calls *our*
   backend, which calls NVIDIA.
2. **LLM cost is the real ceiling, not hosting.** Every generated journey is a paid NVIDIA call.
   A public signup product must bound this (per-user quotas + caching, and/or bring-your-own-key,
   and/or invite-only). This is the single most important design decision — locked in Phase 3.
3. **Free tiers cold-start.** Free backend sleeps after ~15 min idle (30–50s first request); free
   Postgres/Supabase pauses after ~1 week idle. Acceptable for launch; upgrading is a few $/mo later.
4. **Consent is the product thesis — so data handling must be exemplary.** Real user PII (uploaded
   customers) means encryption at rest, hard delete, data export, and a privacy policy. Doing this
   well is on-brand; doing it sloppily undercuts the whole pitch.
5. **Ship phase by phase.** Each phase is independently deployable and leaves a working product. We
   never have a half-broken `main`.

## 3. Target architecture

**Today (localhost):**
```
Browser ── React (vite) ──▶ FastAPI (localhost:8000) ──▶ NVIDIA NIM
                                     │
                              customers.json (flat file)
```

**Target (cloud, multi-user):**
```
Browser ── React (Vercel/CDN)
   │  (auth token)
   ▼
FastAPI (Render/Fly) ── verifies token ── NVIDIA NIM (key server-side)
   │                                   ── rate limit + cache
   ▼
Supabase ── Postgres (users · customers · journeys, row-level security)
         ── Auth (email/password + OAuth)
         ── Storage (uploaded CSV/JSON files)
```

## 4. Stack decisions (all free-tier)

| Concern | Choice | Rationale | Free-tier caveat |
|---|---|---|---|
| Auth + DB + file storage | **Supabase** | One service = Postgres + Auth + Storage + row-level security. Biggest single lever. | Project pauses after ~1 wk idle; 500 MB DB. |
| Frontend hosting | **Vercel** (or Netlify) | Static React build, HTTPS + domain, instant deploys. | None meaningful for our size. |
| Backend hosting | **Render (free)** → Fly.io/Railway later | Runs FastAPI; keeps NVIDIA key server-side; simple. | Sleeps ~15 min idle → cold start. |
| LLM + embeddings | **NVIDIA NIM** (unchanged) | Core of the product. | Paid per call — see Principle 2. |
| Agent / RAG | LangGraph + FAISS (unchanged) | Already built; FAISS index rebuilt at startup. | — |

---

## 5. Phases

Each phase lists: **Goal**, **Work**, **Code changes**, **Done when**, **Effort**, **Risks**.

### ✅ Phase 0 — Publicly deploy the current demo (no auth) — DONE (2026-07-21)
**Shipped and live.** The app is publicly reachable, the NVIDIA key is server-side, CORS is locked to the
Vercel origin, and `/generate-journey` is per-IP rate-limited. Backend on Render (Docker, free tier) via
`render.yaml`; frontend on Vercel (root `web`, `VITE_API_BASE` → the Render URL). Both auto-deploy on push
to `main`. A cinematic frontend redesign also shipped on top (see the repo's `frontend-redesign` history).

- **Goal:** the existing app (demo/200-customer data, no login) reachable at a public HTTPS URL.
- **Work:**
  - Backend: add a `Dockerfile` (or Render start command), read all config from env vars, lock CORS
    to the frontend domain, add a basic IP rate limit, confirm `/health`.
  - Frontend: make the API base URL an env var (`VITE_API_BASE`) instead of hardcoded `localhost`.
  - Deploy backend to Render (set `NVIDIA_API_KEY` in its dashboard), frontend to Vercel.
- **Code changes:** `api/main.py` (CORS, rate limit), new `Dockerfile`/`render.yaml`, `web/src/api.ts`
  (env-var base URL), `.env.example` updates. **No agent logic touched.**
- **Done when:** a stranger opens the Vercel URL, generates a journey, and it works; the NVIDIA key is
  only in Render's env; CORS rejects other origins.
- **Effort:** ~1 day. **Cost:** $0.
- **Risks:** cold start on first request (acceptable); the public endpoint spends NVIDIA credits —
  mitigate now with a rate limit, fully solve in Phase 3.

### Phase 1 — Auth + database foundation
- **Goal:** users can create accounts and log in; customer data lives in Postgres, not a flat file.
- **Work:**
  - Stand up Supabase; create `users` (managed by Supabase Auth), `customers`, `journeys` tables with
    **row-level security** so users only see their own rows.
  - Backend verifies the Supabase JWT on every request; seed the curated 5 / 200 demo customers as a
    shared "sample" dataset available to everyone.
  - Frontend: sign-up / log-in / log-out screens; authed API calls.
- **Code changes:** new `src/db.py` (Supabase/Postgres access) replacing the JSON loader in
  `src/config.py`; auth middleware in `api/main.py`; new auth UI + session handling in `web/`.
- **Done when:** two different accounts see isolated data; unauthenticated requests are rejected.
- **Effort:** ~3–5 days. **Cost:** $0.
- **Risks:** RLS misconfig = data leak → add automated isolation tests.

### Phase 2 — Bring-your-own-customers (upload)
- **Goal:** a user uploads their own customer CSV/JSON and runs the agent on it.
- **Work:**
  - Upload endpoint: accept CSV/JSON, **validate against the customer schema**, store per-user
    (reuse the mapping logic in `scripts/ingest_customer_personality.py`).
  - Synthesize the two fields no dataset has (`consent_flags.personalization`, anonymized `name`) with
    a clear, documented rule; show the user what was inferred.
  - Frontend: upload flow, "My customers" list, per-file validation errors.
- **Code changes:** new `api/` upload route + a reusable `src/ingest.py`; `web/` upload UI.
- **Done when:** a user uploads a file, sees their members, and generates journeys for them.
- **Effort:** ~4–6 days. **Cost:** $0.
- **Risks:** malformed uploads, huge files, PII in logs → strict validation, size caps, never log rows.

### Phase 3 — Persist results + cost controls *(the pivotal phase)*
- **Goal:** journeys are saved per user, and NVIDIA spend is bounded so opening signups is safe.
- **Work:**
  - Persist each generated journey to `journeys`; show history.
  - **Cache** identical (customer + rules-version) requests so re-runs don't re-bill.
  - **Per-user quota / rate limit** (e.g. N journeys/day on the shared key).
  - **Decide the API-key strategy** (see §6) and implement it.
- **Code changes:** journey persistence, a caching layer, quota middleware, optional per-user key
  storage (encrypted).
- **Done when:** a heavy user cannot exceed their quota; cached results cost $0; you can predict the
  worst-case monthly NVIDIA bill.
- **Effort:** ~3–5 days. **Cost:** bounded NVIDIA usage.
- **Risks:** the whole "free + open to anybody" promise lives or dies here — do not open public signup
  before this ships.

### Phase 4 — Production hardening
- **Goal:** trustworthy enough to hand to strangers.
- **Work:** privacy policy + Terms; account/data **deletion & export**; error handling + monitoring
  (Sentry free tier); custom domain; auth/isolation/upload test coverage; basic analytics.
- **Code changes:** legal pages, delete/export endpoints, logging/monitoring, tests, CI.
- **Done when:** a user can delete everything; errors are observed; the isolation tests are green in CI.
- **Effort:** ~3–5 days. **Cost:** $0 (paid domain optional).
- **Risks:** compliance gaps — keep scope to what a small SaaS genuinely needs.

---

## 6. Key open decision — the NVIDIA API-key strategy (resolve by Phase 3)

| Option | How it works | Pro | Con |
|---|---|---|---|
| **A. Shared key + quotas** *(default)* | Everyone uses your key; strict per-user daily limits + caching. | Zero friction to try. | You pay; abuse risk if limits are loose. |
| **B. Bring-your-own-key** | Each user pastes their own NVIDIA key (encrypted at rest). | Your cost ≈ $0; scales freely. | Higher signup friction; you store secrets. |
| **C. Invite-only / waitlist** | Public URL, but generation gated to approved users. | Tight cost control. | Not truly "anybody can access." |

**Recommendation:** ship **A** with conservative quotas for launch; add **B** as an option for power
users. Revisit if usage grows.

## 7. Rough cost model (free-tier launch)

- Hosting: **$0** (Vercel + Render free + Supabase free).
- NVIDIA: pay-per-journey — the only variable. With Option A quotas + caching, worst case ≈
  *(active users × daily quota × price-per-call)*; caching drives the real number well below that.
- Optional later: custom domain (~$12/yr), always-warm backend (~$5–7/mo).

## 8. Sequencing & dependencies

```
Phase 0 (deploy)  ─▶  Phase 1 (auth+db)  ─▶  Phase 2 (upload)  ─▶  Phase 3 (persist+cost)  ─▶  Phase 4 (harden)
   independent          gates 2,3,4            needs 1               needs 1,2 · GATES public signup
```
- **Do not open public signup until Phase 3 ships** (cost controls).
- Phase 0 is safe to ship immediately and standalone.

## 9. Out of scope (for now)

Billing/payments, team/multi-tenant orgs, real reward *fulfilment* (coupon/email issuance),
multi-region, SSO/enterprise auth, mobile apps. Revisit after Phase 4.

## 10. Immediate next step

Begin **Phase 0**: prep the backend for hosting (Dockerfile, env-var config, locked CORS, rate limit,
health check) and repoint the frontend API base off `localhost` — all local, nothing published until
you deploy in your own Vercel/Render/Supabase dashboards (I'll provide click-by-click steps for those).
