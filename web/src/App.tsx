import React, { useState, useEffect } from "react";
import { LoyaltyTier } from "./types";
import { AppCustomer, fetchCustomers, generateJourney, JourneyResult } from "./api";
import {
  categoryAffinity,
  engagementScore,
  rewardSensitivity,
  tierProgress,
  businessImpact,
  behavioralSummary,
} from "./studio";
import {
  Sparkles,
  ShieldCheck,
  Lock,
  Mail,
  Share2,
  Crown,
  Gauge,
  Fingerprint,
  ArrowRight,
  Check,
  Minus,
  AlertCircle,
  TrendingUp,
  Users,
  Gem,
  ChevronDown,
} from "lucide-react";

/* ----------------------------- small UI atoms ----------------------------- */

function SectionHeading({ index, title, kicker }: { index: string; title: string; kicker: string }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-5">
      <div className="flex items-baseline gap-3">
        <span className="font-bold text-gold text-sm tracking-[0.2em]">{index}</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-navy-900">{title}</h2>
          <p className="text-xs text-navy-900/45 mt-0.5">{kicker}</p>
        </div>
      </div>
      <div className="h-px flex-1 max-w-[40%] bg-gradient-to-r from-gold/40 to-transparent hidden md:block" />
    </div>
  );
}

const TIER_DOT: Record<LoyaltyTier, string> = {
  [LoyaltyTier.BRONZE]: "bg-amber-600",
  [LoyaltyTier.SILVER]: "bg-slate-400",
  [LoyaltyTier.GOLD]: "bg-gold-400",
  [LoyaltyTier.PLATINUM]: "bg-teal-500",
};

function TierBadge({ tier }: { tier: LoyaltyTier }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold-200/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-600">
      <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[tier]}`} />
      {tier}
    </span>
  );
}

function ScoreRing({ value, label }: { value: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(12,22,38,0.08)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-navy-900">{value}</span>
        <span className="text-[9px] uppercase tracking-widest text-navy-900/40">{label}</span>
      </div>
    </div>
  );
}

/* --------------------------------- App ----------------------------------- */

const REASONING_STEPS = [
  { key: "consent", label: "Consent verification", desc: "Confirm personalization permission before any profiling." },
  { key: "retrieval", label: "Rule retrieval (RAG)", desc: "Fetch relevant loyalty rules via FAISS + NIM embeddings." },
  { key: "planning", label: "Reward planning", desc: "Reason over history, tier and points with NVIDIA NIM." },
  { key: "compliance", label: "Compliance validation", desc: "Ensure the output respects consent and program rules." },
];

export default function App() {
  const [customers, setCustomers] = useState<AppCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [liveStep, setLiveStep] = useState(0);
  const [result, setResult] = useState<JourneyResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Load real customers from the NVIDIA backend.
  useEffect(() => {
    fetchCustomers()
      .then((list) => {
        setCustomers(list);
        if (list.length) setSelectedId(list[0].id);
      })
      .catch((err) => setLoadError(err.message || "Could not reach the loyalty backend."))
      .finally(() => setLoadingCustomers(false));
  }, []);

  const activeCustomer = customers.find((c) => c.id === selectedId);
  const consentGranted = activeCustomer ? activeCustomer.consent.personalization : true;

  // Reset the studio when the selected customer changes.
  useEffect(() => {
    setResult(null);
    setErrorText(null);
    setLiveStep(0);
  }, [selectedId]);

  // Animate the reasoning steps while the agent runs.
  useEffect(() => {
    if (!isGenerating) return;
    setLiveStep(0);
    const id = setInterval(() => {
      setLiveStep((s) => Math.min(s + 1, REASONING_STEPS.length - 1));
    }, 650);
    return () => clearInterval(id);
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!activeCustomer) return;
    setIsGenerating(true);
    setErrorText(null);
    setResult(null);
    try {
      const res = await generateJourney(activeCustomer);
      setResult(res);
    } catch (err: any) {
      setErrorText(err.message || "The loyalty agent failed to respond.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Step status for the reasoning workspace.
  const stepStatus = (idx: number): "done" | "active" | "pending" | "skipped" => {
    if (result) {
      if (idx === 0) return "done";
      if (result.personalizationApplied) return "done";
      return idx === REASONING_STEPS.length - 1 ? "done" : "skipped";
    }
    if (isGenerating) {
      if (idx < liveStep) return "done";
      if (idx === liveStep) return "active";
      return "pending";
    }
    return "pending";
  };

  /* ------------------------------ gates -------------------------------- */
  if (loadingCustomers) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center text-navy-900/60">
        <Sparkles className="mr-2 h-5 w-5 animate-pulse text-gold" />
        Opening the Journey Studio…
      </div>
    );
  }
  if (loadError || !activeCustomer) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center shadow-xl">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <h2 className="mb-1 font-bold text-navy-900">Can't reach the loyalty backend</h2>
          <p className="mb-3 text-sm text-navy-900/55">{loadError || "No customers loaded."}</p>
          <p className="font-mono text-xs text-navy-900/40">uvicorn api.main:app --port 8000</p>
        </div>
      </div>
    );
  }

  const aff = categoryAffinity(activeCustomer);
  const eng = engagementScore(activeCustomer);
  const sens = rewardSensitivity(activeCustomer);
  const prog = tierProgress(activeCustomer);
  const personalizedNow = result ? result.personalizationApplied : consentGranted;
  const impact = businessImpact(activeCustomer, result ? result.personalizationApplied : consentGranted);
  const journey = result?.journey ?? null;

  return (
    <div className="relative z-10 min-h-screen pb-20">

      {/* ============================ HEADER ============================ */}
      <header className="bg-navy-900 text-ivory">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-navy-800">
              <Gem className="h-5 w-5 text-gold-300" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight">
                Customer Journey Studio
                <span className="ml-2 text-gold-300/80 font-medium">· PS100</span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/40">
                Personalized Loyalty Agent — NVIDIA NIM
              </p>
            </div>
          </div>

          {/* Customer selector */}
          <div className="relative">
            <label className="block text-[9px] uppercase tracking-[0.2em] text-ivory/40 mb-1.5">
              Member in studio
            </label>
            <div className="relative">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-ivory/15 bg-navy-800 py-2.5 pl-4 pr-10 text-sm font-medium text-ivory outline-none transition focus:border-gold/50 sm:w-72"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="text-navy-900">
                    {c.id} · {c.name} ({c.tier})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-6 pt-10">

        {/* ===================== 01 · IDENTITY + 02 · CONSENT ===================== */}
        <section className="animate-fade-up">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Identity Card */}
            <div className="lg:col-span-2">
              <SectionHeading index="01" title="Customer Identity" kicker="Who the agent is designing for" />
              <div className="rounded-2xl border border-navy-900/[0.06] bg-white p-7 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)]">
                <div className="flex flex-wrap items-start gap-5">
                  <div className="relative">
                    <img
                      src={activeCustomer.avatar}
                      alt={activeCustomer.name}
                      className="h-20 w-20 rounded-2xl object-cover ring-2 ring-gold/40 ring-offset-2 ring-offset-white"
                    />
                    <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-navy-900 text-gold-300 shadow-md">
                      <Crown className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-bold tracking-tight text-navy-900">{activeCustomer.name}</h3>
                      <TierBadge tier={activeCustomer.tier} />
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-navy-900/40">Member {activeCustomer.id}</p>
                    <p className="mt-3 text-sm leading-relaxed text-navy-900/70">
                      {behavioralSummary(activeCustomer)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-navy-900/40">Points</p>
                    <p className="font-bold text-navy-900 text-3xl leading-none mt-1">
                      {activeCustomer.points.toLocaleString()}
                    </p>
                    {prog.next && (
                      <p className="mt-1 text-[11px] text-gold-600 font-medium">
                        {prog.pointsToNext} to {prog.next}
                      </p>
                    )}
                  </div>
                </div>

                {/* Preferences chips */}
                <div className="mt-6 border-t border-navy-900/[0.06] pt-5">
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">
                    Preferences
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aff.map((a) => (
                      <span
                        key={a.category}
                        className="inline-flex items-center gap-1.5 rounded-full border border-navy-900/10 bg-ivory-100 px-3 py-1 text-xs font-medium text-navy-800"
                      >
                        {a.category}
                        <span className="text-navy-900/40">{Math.round(a.pct)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Consent Intelligence */}
            <div>
              <SectionHeading index="02" title="Consent" kicker="Privacy permissions" />
              <div className="rounded-2xl border border-navy-900/[0.06] bg-white p-6 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)]">
                {[
                  { icon: Fingerprint, label: "Personalization", on: activeCustomer.consent.personalization },
                  { icon: Mail, label: "Email marketing", on: activeCustomer.consent.email_marketing },
                  { icon: Share2, label: "Data sharing", on: activeCustomer.consent.data_sharing },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-navy-900/[0.05] last:border-0">
                    <div className="flex items-center gap-2.5">
                      <row.icon className="h-4 w-4 text-navy-900/45" />
                      <span className="text-sm font-medium text-navy-800">{row.label}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        row.on
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-navy-900/[0.05] text-navy-900/45"
                      }`}
                    >
                      {row.on ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      {row.on ? "Granted" : "Denied"}
                    </span>
                  </div>
                ))}

                <div
                  className={`mt-4 rounded-xl p-3.5 text-xs leading-relaxed ${
                    consentGranted ? "bg-emerald-50/60 text-emerald-900" : "bg-navy-900/[0.04] text-navy-900/70"
                  }`}
                >
                  {consentGranted ? (
                    <>
                      <strong className="font-semibold">Personalization is ON.</strong> The agent may use purchase
                      history to design a tailored reward journey.
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold">Personalization is OFF.</strong> The agent will not profile
                      this member and serves only a standard offer.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 03 · LOYALTY DNA ===================== */}
        <section className="animate-fade-up">
          <SectionHeading index="03" title="Loyalty DNA" kicker="Purchasing habits & sensitivity — modeled estimate" />
          <div className="grid gap-6 md:grid-cols-3">
            {/* Category affinity */}
            <div className="rounded-2xl border border-navy-900/[0.06] bg-white p-6 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)] md:col-span-1">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">
                Category affinity
              </p>
              <div className="space-y-3.5">
                {aff.map((a) => (
                  <div key={a.category}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-navy-800">{a.category}</span>
                      <span className="text-navy-900/45">{Math.round(a.pct)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-navy-900/[0.06]">
                      <div className="h-full rounded-full bg-gold-400" style={{ width: `${a.pct}%`, transition: "width .8s cubic-bezier(0.22,1,0.36,1)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Engagement score */}
            <div className="rounded-2xl border border-navy-900/[0.06] bg-white p-6 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)] flex items-center gap-5">
              <ScoreRing value={eng} label="Score" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">Engagement</p>
                <p className="mt-1 text-sm leading-relaxed text-navy-900/65">
                  Blends purchase frequency, points and tier into a single 0–100 engagement signal.
                </p>
              </div>
            </div>

            {/* Reward sensitivity */}
            <div className="rounded-2xl border border-navy-900/[0.06] bg-white p-6 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">
                Reward sensitivity
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-navy-900">{sens.label}</span>
                <span className="text-sm text-navy-900/45">{sens.score}/100</span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-navy-900/[0.06]">
                <div className="h-full rounded-full bg-navy-900" style={{ width: `${sens.score}%`, transition: "width .8s cubic-bezier(0.22,1,0.36,1)" }} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-navy-900/55">
                How strongly this member responds to targeted rewards, from how focused their spend is.
              </p>
            </div>
          </div>
        </section>

        {/* ===================== PRIMARY ACTION ===================== */}
        <section className="animate-fade-up">
          <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-gold/30 bg-navy-900 px-7 py-6 text-ivory shadow-[0_24px_60px_-32px_rgba(12,22,38,0.8)] sm:flex-row">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Design this member's loyalty future</h3>
              <p className="mt-1 text-sm text-ivory/55">
                The agent verifies consent, retrieves the program rules, and reasons over {activeCustomer.name}'s
                history to compose a tailored journey.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="group inline-flex shrink-0 items-center gap-2.5 rounded-xl bg-gold px-7 py-3.5 text-sm font-semibold text-navy-950 shadow-lg transition hover:bg-gold-400 disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Designing…
                </>
              ) : (
                <>
                  Design Loyalty Journey
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
          {errorText && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorText}
            </div>
          )}
        </section>

        {/* ===================== 04 · AGENT REASONING WORKSPACE ===================== */}
        <section className="animate-fade-up">
          <SectionHeading index="04" title="Agent Reasoning Workspace" kicker="How the agent thinks, step by step" />
          <div className="rounded-2xl border border-navy-800 bg-navy-900 p-7 text-ivory shadow-[0_24px_60px_-32px_rgba(12,22,38,0.8)]">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REASONING_STEPS.map((step, i) => {
                const status = stepStatus(i);
                return (
                  <div
                    key={step.key}
                    className={`rounded-xl border p-4 transition ${
                      status === "active"
                        ? "border-gold/50 bg-navy-800"
                        : status === "done"
                        ? "border-emerald-500/20 bg-navy-800/60"
                        : "border-ivory/10 bg-navy-800/30"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] tracking-widest text-ivory/40">0{i + 1}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          status === "done"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : status === "active"
                            ? "bg-gold/20 text-gold-300"
                            : status === "skipped"
                            ? "bg-ivory/5 text-ivory/30"
                            : "bg-ivory/5 text-ivory/25"
                        }`}
                      >
                        {status === "done" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : status === "active" ? (
                          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                        ) : status === "skipped" ? (
                          <Minus className="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-ivory">{step.label}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ivory/45">{step.desc}</p>
                    {status === "skipped" && (
                      <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-amber-300/70">
                        Skipped — consent off
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-5 border-t border-ivory/10 pt-4 text-xs text-ivory/40">
              Engine: LangGraph · NVIDIA NIM <span className="text-ivory/60">meta/llama-3.1-70b-instruct</span> ·
              FAISS retrieval with <span className="text-ivory/60">nv-embedqa-e5-v5</span> embeddings.
            </p>
          </div>
        </section>

        {/* ===================== 05 · REWARD JOURNEY TIMELINE ===================== */}
        <section className="animate-fade-up">
          <SectionHeading index="05" title="Reward Journey Timeline" kicker="The future the agent designed" />
          <div className="rounded-2xl border border-navy-900/[0.06] bg-white p-7 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)]">

            {/* Tier progression */}
            <div className="mb-7 rounded-xl bg-ivory-100 p-5">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-[0.14em] text-navy-900/45">Tier progression</span>
                <span className="text-navy-900/55">
                  {prog.next ? `${prog.pointsToNext} points to ${prog.next}` : "Highest tier reached"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <TierBadge tier={prog.current} />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-900/[0.07]">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${prog.progressPct}%`, transition: "width 1s cubic-bezier(0.22,1,0.36,1)" }} />
                </div>
                {prog.next ? <TierBadge tier={prog.next} /> : <Crown className="h-5 w-5 text-gold" />}
              </div>
            </div>

            {!result ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ivory-100 text-gold">
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-navy-800">Awaiting design</p>
                <p className="mt-1 max-w-sm text-xs text-navy-900/45">
                  Run the agent to compose {activeCustomer.name}'s reward roadmap.
                </p>
              </div>
            ) : personalizedNow && journey ? (
              <>
                {/* Message */}
                <div className="mb-6 rounded-xl border-l-2 border-gold bg-ivory-100 px-5 py-4">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-900/40">
                    Message to {activeCustomer.name}
                  </p>
                  <p className="font-serif text-[15px] italic leading-relaxed text-navy-800">
                    &ldquo;{journey.friendlyMessage}&rdquo;
                  </p>
                </div>

                {/* Milestones */}
                <div className="relative space-y-5 pl-7">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-navy-900/10" />
                  {journey.rewards.map((rw, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-7 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-gold bg-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                      </span>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-600">
                        Week {i + 1}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-navy-900">{rw.title}</p>
                      {rw.reason && <p className="mt-0.5 text-xs leading-relaxed text-navy-900/55">{rw.reason}</p>}
                    </div>
                  ))}
                  {/* Next best offer node */}
                  <div className="relative">
                    <span className="absolute -left-7 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-navy-900">
                      <ArrowRight className="h-2.5 w-2.5 text-gold-300" />
                    </span>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">
                      Next best offer
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-navy-900">{journey.nextBestOffer.title}</p>
                  </div>
                </div>

                {/* Recommended action */}
                <div className="mt-6 rounded-xl bg-navy-900 px-5 py-4 text-ivory">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-300/70">
                    Recommended action
                  </p>
                  <p className="mt-1 text-sm font-medium">{journey.nextStepText}</p>
                </div>
              </>
            ) : (
              /* consent-off standard view */
              <div className="rounded-xl border border-dashed border-navy-900/15 bg-ivory-100 p-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
                  <Lock className="h-4 w-4 text-navy-900/50" />
                  Standard offer — personalization off
                </div>
                <p className="font-serif text-sm italic leading-relaxed text-navy-700">
                  &ldquo;{result.standardMessage}&rdquo;
                </p>
                <div className="mt-4 rounded-lg border border-navy-900/10 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-900/40">
                    General offer
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-navy-800">{result.standardOfferTitle}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===================== 06 · BUSINESS IMPACT PREVIEW ===================== */}
        <section className="animate-fade-up">
          <SectionHeading index="06" title="Business Impact Preview" kicker="Projected outcomes — modeled estimate" />
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Users, label: "Predicted retention", value: impact.retention, suffix: "%", caption: "12-month likelihood this member stays active." },
              { icon: TrendingUp, label: "Engagement uplift", value: impact.engagementUplift, suffix: "%", caption: "Expected lift vs. a generic offer." },
              { icon: Gauge, label: "Loyalty growth", value: impact.loyaltyGrowth, suffix: " pts", caption: "Projected points earned next quarter." },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl border border-navy-900/[0.06] bg-white p-6 shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)]">
                <div className="flex items-center justify-between">
                  <m.icon className="h-5 w-5 text-gold" />
                  <span className="rounded-full bg-ivory-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-navy-900/40">
                    estimate
                  </span>
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-navy-900">
                  {m.value}
                  <span className="text-xl text-navy-900/40">{m.suffix}</span>
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-900/45">{m.label}</p>
                <p className="mt-2 text-xs leading-relaxed text-navy-900/55">{m.caption}</p>
              </div>
            ))}
          </div>
        </section>

      </main>

      <footer className="mx-auto mt-16 max-w-6xl px-6">
        <div className="border-t border-navy-900/10 pt-6 text-center font-mono text-[10px] tracking-wider text-navy-900/35">
          PS100 · Customer Journey Studio — NVIDIA NIM + LangGraph + FAISS RAG · consent-aware by design
        </div>
      </footer>
    </div>
  );
}
