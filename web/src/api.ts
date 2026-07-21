// API client for the PS100 NVIDIA loyalty backend (FastAPI).
//
// This replaces the old Gemini `server.ts`. All data now comes from the real
// NVIDIA NIM + LangGraph agent exposed by api/main.py:
//   GET  /customers          -> the real customers (data/customers.json)
//   POST /generate-journey   -> the consent-gated, RAG-grounded journey
//
// The functions here translate the backend's JSON (PRD section 7 shape) into the
// types this React UI expects.

import { Customer, LoyaltyTier, CustomerLoyaltyJourney } from "./types";

// FastAPI runs on :8000 locally; in prod VITE_API_BASE points at the deployed
// backend. Strip any trailing slash so `${API_BASE}/customers` can't become a
// broken `//customers` (which 404s) if the env value was entered with a slash.
export const API_BASE = (
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000"
).replace(/\/+$/, "");

// --- Raw backend shapes -------------------------------------------------

interface ApiCustomer {
  customer_id: string;
  name: string;
  avatar?: string;
  persona?: string;
  loyalty_tier: string;
  points: number;
  purchase_history: { item: string; category: string; amount: number; date: string }[];
  consent_flags: { personalization: boolean; [k: string]: boolean };
}

interface ApiJourney {
  customer_id: string;
  personalization_applied: boolean;
  // Agentic reasoning fields the backend computes (dynamic routing, consent
  // reasoning, self-critique loop). Optional so older responses still parse.
  segment?: string;
  consent_notes?: string;
  validation_passed?: boolean;
  reasoning?: string;
  loyalty_journey: {
    current_tier: string;
    recommended_action: string;
    rewards: { reward: string; reason: string }[];
    next_best_offer: string;
    message: string;
  };
}

// The UI Customer plus the fields we need from the backend (consent + raw amounts).
export interface AppCustomer extends Customer {
  personalizationConsent: boolean;
  consent: {
    personalization: boolean;
    email_marketing: boolean;
    data_sharing: boolean;
  };
}

// --- Helpers ------------------------------------------------------------

function toTier(raw: string): LoyaltyTier {
  switch ((raw || "").toLowerCase()) {
    case "bronze":
      return LoyaltyTier.BRONZE;
    case "gold":
      return LoyaltyTier.GOLD;
    case "platinum":
      return LoyaltyTier.PLATINUM;
    default:
      return LoyaltyTier.SILVER;
  }
}

function mapCustomer(c: ApiCustomer): AppCustomer {
  return {
    id: c.customer_id,
    name: c.name,
    avatar:
      c.avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=4f46e5&color=fff&size=150`,
    tier: toTier(c.loyalty_tier),
    points: c.points,
    persona: c.persona || "Loyalty program member.",
    personalizationConsent: !!c.consent_flags?.personalization,
    consent: {
      personalization: !!c.consent_flags?.personalization,
      email_marketing: !!c.consent_flags?.email_marketing,
      data_sharing: !!c.consent_flags?.data_sharing,
    },
    recentPurchases: c.purchase_history.map((p, i) => ({
      id: `${c.customer_id}-P${i + 1}`,
      item: p.item,
      category: p.category,
      amount: p.amount,
      date: p.date,
    })),
  };
}

// --- Public API ---------------------------------------------------------

export async function fetchCustomers(): Promise<AppCustomer[]> {
  const res = await fetch(`${API_BASE}/customers`);
  if (!res.ok) throw new Error(`Failed to load customers (${res.status})`);
  const data: ApiCustomer[] = await res.json();
  return data.map(mapCustomer);
}

export interface JourneyResult {
  personalizationApplied: boolean;
  // Present when personalization was applied:
  journey: CustomerLoyaltyJourney | null;
  // The backend's message + generic offer (used for the consent-off / standard view):
  standardMessage: string;
  standardOfferTitle: string;
  recommendedAction: string;
  // Agentic reasoning surfaced from the backend:
  segment: string | null; // dynamic LangGraph route, e.g. "near_threshold"
  consentNotes: string | null; // multi-flag consent reasoning
  validationPassed: boolean | null; // self-critique validate→revise outcome
  reasoning: string | null; // one-line rationale incl. attempt count
}

export async function generateJourney(
  customer: AppCustomer
): Promise<JourneyResult> {
  const res = await fetch(`${API_BASE}/generate-journey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: customer.id }),
  });
  if (!res.ok) {
    let detail = `Backend error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const data: ApiJourney = await res.json();
  const lj = data.loyalty_journey;
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const journey: CustomerLoyaltyJourney | null = data.personalization_applied
    ? {
        customerName: customer.name,
        tier: customer.tier,
        points: customer.points,
        nextStepText: lj.recommended_action,
        friendlyMessage: lj.message,
        nextBestOffer: { title: lj.next_best_offer, description: "", reason: "" },
        rewards: lj.rewards.map((r) => ({
          title: r.reward,
          description: "",
          reason: r.reason,
        })),
        generatedAt: now,
      }
    : null;

  return {
    personalizationApplied: data.personalization_applied,
    journey,
    standardMessage: lj.message,
    standardOfferTitle: lj.next_best_offer,
    recommendedAction: lj.recommended_action,
    segment: data.segment ?? null,
    consentNotes: data.consent_notes ?? null,
    validationPassed: data.validation_passed ?? null,
    reasoning: data.reasoning ?? null,
  };
}
