// Derived "studio" metrics.
//
// IMPORTANT: the NVIDIA backend returns the journey (message, rewards, offer) and
// the raw customer record. The richer studio metrics below (Loyalty DNA scores,
// business-impact projections) are NOT produced by the agent — they are derived
// here, deterministically, from each customer's real data so they are stable and
// defensible. They are clearly labelled "modeled estimate" in the UI.

import { LoyaltyTier } from "./types";
import { AppCustomer } from "./api";

export const TIER_ORDER: LoyaltyTier[] = [
  LoyaltyTier.BRONZE,
  LoyaltyTier.SILVER,
  LoyaltyTier.GOLD,
  LoyaltyTier.PLATINUM,
];

export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  [LoyaltyTier.BRONZE]: 0,
  [LoyaltyTier.SILVER]: 250,
  [LoyaltyTier.GOLD]: 500,
  [LoyaltyTier.PLATINUM]: 1000,
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface CategoryAffinity {
  category: string;
  amount: number;
  pct: number; // share of total spend, 0..100
}

export function categoryAffinity(customer: AppCustomer): CategoryAffinity[] {
  const totals = new Map<string, number>();
  for (const p of customer.recentPurchases) {
    totals.set(p.category, (totals.get(p.category) || 0) + p.amount);
  }
  const grand = Array.from(totals.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount, pct: (amount / grand) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

export function tierRank(tier: LoyaltyTier): number {
  return Math.max(0, TIER_ORDER.indexOf(tier));
}

export function engagementScore(customer: AppCustomer): number {
  const n = customer.recentPurchases.length;
  const score = 30 + n * 8 + customer.points / 30 + tierRank(customer.tier) * 5;
  return Math.round(clamp(score, 0, 99));
}

export interface Sensitivity {
  score: number; // 0..100
  label: "High" | "Medium" | "Low";
}

export function rewardSensitivity(customer: AppCustomer): Sensitivity {
  const aff = categoryAffinity(customer);
  const topShare = aff.length ? aff[0].pct : 0;
  const confidence = Math.min(1, customer.recentPurchases.length / 3);
  const score = Math.round(clamp(35 + topShare * 0.55 * confidence, 0, 98));
  const label = score >= 70 ? "High" : score >= 50 ? "Medium" : "Low";
  return { score, label };
}

export interface TierProgress {
  current: LoyaltyTier;
  next: LoyaltyTier | null;
  pointsToNext: number;
  progressPct: number; // 0..100 within the current band
}

export function tierProgress(customer: AppCustomer): TierProgress {
  const rank = tierRank(customer.tier);
  const current = TIER_ORDER[rank];
  const next = rank < TIER_ORDER.length - 1 ? TIER_ORDER[rank + 1] : null;
  if (!next) {
    return { current, next: null, pointsToNext: 0, progressPct: 100 };
  }
  const lo = TIER_THRESHOLDS[current];
  const hi = TIER_THRESHOLDS[next];
  const pct = clamp(((customer.points - lo) / (hi - lo)) * 100, 0, 100);
  return {
    current,
    next,
    pointsToNext: Math.max(0, hi - customer.points),
    progressPct: Math.round(pct),
  };
}

export interface BusinessImpact {
  retention: number; // %
  engagementUplift: number; // %
  loyaltyGrowth: number; // points / quarter
}

const BASE_RETENTION: Record<LoyaltyTier, number> = {
  [LoyaltyTier.BRONZE]: 52,
  [LoyaltyTier.SILVER]: 66,
  [LoyaltyTier.GOLD]: 78,
  [LoyaltyTier.PLATINUM]: 88,
};

export function businessImpact(
  customer: AppCustomer,
  personalizationApplied: boolean
): BusinessImpact {
  const base = BASE_RETENTION[customer.tier];
  const eng = engagementScore(customer);
  const sens = rewardSensitivity(customer).score;
  const n = customer.recentPurchases.length;

  const retention = personalizationApplied
    ? Math.round(clamp(base + 4 + eng * 0.06, 0, 96))
    : base;
  const engagementUplift = personalizationApplied ? Math.round(8 + sens * 0.18) : 0;
  const loyaltyGrowth = personalizationApplied
    ? Math.round(customer.points * 0.18 + n * 15)
    : Math.round(customer.points * 0.05);

  return { retention, engagementUplift, loyaltyGrowth };
}

// A short, human "behavioral summary" line derived from the affinity mix.
export function behavioralSummary(customer: AppCustomer): string {
  const aff = categoryAffinity(customer);
  if (!aff.length) return "New member — limited purchase signal so far.";
  const top = aff[0];
  const breadth = aff.length;
  const focus =
    top.pct >= 60
      ? `strongly focused on ${top.category}`
      : breadth >= 4
      ? `a broad, exploratory shopper across ${breadth} categories`
      : `leaning toward ${top.category}`;
  return `${customer.name} is ${focus}, with ${customer.recentPurchases.length} recent purchases and ${customer.points.toLocaleString()} points.`;
}
