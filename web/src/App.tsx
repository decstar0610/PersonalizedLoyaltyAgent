import React, { useState, useEffect, useRef } from "react";
import { motion, useInView, useScroll, useSpring } from "motion/react";
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
import { Reveal, StaggerGroup, StaggerItem, CountUp } from "./motion";
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
  GitBranch,
  ShieldAlert,
  RotateCw,
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

// Humanize the backend's snake_case segment into a display label.
function segmentLabel(seg: string): string {
  return seg
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ----------------------------- small UI atoms ----------------------------- */

const CARD =
  "rounded-2xl border border-navy-900/[0.06] bg-white shadow-[0_18px_50px_-30px_rgba(12,22,38,0.5)]";

// A white surface that lifts gently on hover.
function Card({
  children,
  className = "",
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      whileHover={
        hover
          ? { y: -4, boxShadow: "0 30px 60px -30px rgba(12,22,38,0.55)" }
          : undefined
      }
      transition={{ duration: 0.3, ease: EASE }}
      className={`${CARD} ${className}`}
    >
      {children}
    </motion.div>
  );
}

// Slim gold reading-progress bar pinned to the very top of the viewport.
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed left-0 top-0 z-50 h-[3px] w-full origin-left bg-gradient-to-r from-gold-300 via-gold-400 to-gold"
    />
  );
}

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
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  return (
    <div ref={ref} className="relative h-24 w-24 shrink-0">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(12,22,38,0.08)" strokeWidth="6" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: inView ? off : c }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-navy-900">
          <CountUp value={value} />
        </span>
        <span className="text-[9px] uppercase tracking-widest text-navy-900/40">{label}</span>
      </div>
    </div>
  );
}

// Animated horizontal meter that fills when scrolled into view.
function Meter({ pct, className = "bg-gold-400" }: { pct: number; className?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-navy-900/[0.06]">
      <motion.div
        className={`h-full rounded-full ${className}`}
        initial={{ width: 0 }}
        whileInView={{ width: `${pct}%` }}
        viewport={{ once: true, margin: "-20px" }}
        transition={{ duration: 0.9, ease: EASE }}
      />
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
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-6 px-6">
        <div className="flex items-center gap-2 text-navy-900/60">
          <Sparkles className="h-5 w-5 animate-pulse text-gold" />
          <span className="text-sm font-medium">Opening LoyaltyForge…</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className={`${CARD} h-48 lg:col-span-2 shimmer`} />
          <div className={`${CARD} h-48 shimmer`} />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${CARD} h-32 shimmer`} />
          ))}
        </div>
      </div>
    );
  }
  if (loadError || !activeCustomer) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl"
        >
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <h2 className="mb-1 font-bold text-navy-900">Can't reach the loyalty studio</h2>
          <p className="mb-5 text-sm text-navy-900/55">
            {loadError || "No members loaded."} The service may be waking from sleep — this can take a moment.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-ivory transition hover:bg-navy-800"
          >
            <RotateCw className="h-4 w-4" /> Try again
          </button>
        </motion.div>
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
      <ScrollProgress />

      {/* ============================ HEADER ============================ */}
      <header className="sticky top-0 z-30 overflow-hidden border-b border-ivory/10 bg-navy-900/95 text-ivory backdrop-blur-md">
        <div className="aurora opacity-60" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <motion.div
              initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              whileHover={{ rotate: 6, scale: 1.05 }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-navy-800"
            >
              <Gem className="h-5 w-5 text-gold-300" />
            </motion.div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight">
                LoyaltyForge
                <span className="ml-2 text-gold-300/80 font-medium">· Reward Journeys</span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/40">
                Personalized Reward Journeys — NVIDIA NIM
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
                className="w-full appearance-none rounded-lg border border-ivory/15 bg-navy-800 py-2.5 pl-4 pr-10 text-sm font-medium text-ivory outline-none transition focus:border-gold/50 hover:border-ivory/30 sm:w-72"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="text-ivory">
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
        <Reveal as="section">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Identity Card */}
            <div className="lg:col-span-2">
              <SectionHeading index="01" title="Customer Identity" kicker="Who the agent is designing for" />
              <Card className="p-7">
                <div className="flex flex-wrap items-start gap-5">
                  <motion.div
                    className="relative"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE }}
                  >
                    <img
                      src={activeCustomer.avatar}
                      alt={activeCustomer.name}
                      className="h-20 w-20 rounded-2xl object-cover ring-2 ring-gold/40 ring-offset-2 ring-offset-white"
                    />
                    <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-navy-900 text-gold-300 shadow-md">
                      <Crown className="h-3.5 w-3.5" />
                    </span>
                  </motion.div>

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
                    <p className="mt-1 font-serif text-4xl font-semibold leading-none text-navy-900">
                      <CountUp value={activeCustomer.points} />
                    </p>
                    {prog.next && (
                      <p className="mt-1.5 text-[11px] text-gold-600 font-medium">
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
                    {aff.map((a, i) => (
                      <motion.span
                        key={a.category}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: EASE, delay: 0.1 + i * 0.05 }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-navy-900/10 bg-ivory-100 px-3 py-1 text-xs font-medium text-navy-800"
                      >
                        {a.category}
                        <span className="text-navy-900/40">{Math.round(a.pct)}%</span>
                      </motion.span>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Consent Intelligence */}
            <div>
              <SectionHeading index="02" title="Consent" kicker="Privacy permissions" />
              <Card className="p-6">
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
              </Card>
            </div>
          </div>
        </Reveal>

        {/* ===================== 03 · LOYALTY DNA ===================== */}
        <Reveal as="section">
          <SectionHeading index="03" title="Loyalty DNA" kicker="Purchasing habits & sensitivity — modeled estimate" />
          <StaggerGroup className="grid gap-6 md:grid-cols-3">
            {/* Category affinity */}
            <StaggerItem className="md:col-span-1">
              <Card className="h-full p-6">
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
                      <Meter pct={a.pct} />
                    </div>
                  ))}
                </div>
              </Card>
            </StaggerItem>

            {/* Engagement score */}
            <StaggerItem>
              <Card className="flex h-full items-center gap-5 p-6">
                <ScoreRing value={eng} label="Score" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">Engagement</p>
                  <p className="mt-1 text-sm leading-relaxed text-navy-900/65">
                    Blends purchase frequency, points and tier into a single 0–100 engagement signal.
                  </p>
                </div>
              </Card>
            </StaggerItem>

            {/* Reward sensitivity */}
            <StaggerItem>
              <Card className="h-full p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">
                  Reward sensitivity
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-navy-900">{sens.label}</span>
                  <span className="text-sm text-navy-900/45">
                    <CountUp value={sens.score} />/100
                  </span>
                </div>
                <div className="mt-4">
                  <Meter pct={sens.score} className="bg-navy-900" />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-navy-900/55">
                  How strongly this member responds to targeted rewards, from how focused their spend is.
                </p>
              </Card>
            </StaggerItem>
          </StaggerGroup>
        </Reveal>

        {/* ===================== PRIMARY ACTION ===================== */}
        <Reveal as="section">
          <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-navy-900 px-7 py-6 text-ivory shadow-[0_24px_60px_-32px_rgba(12,22,38,0.8)]">
            <div className="aurora opacity-40" />
            <div className="relative flex flex-col items-center justify-between gap-5 sm:flex-row">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Design this member's loyalty future</h3>
                <p className="mt-1 text-sm text-ivory/55">
                  The agent verifies consent, retrieves the program rules, and reasons over {activeCustomer.name}'s
                  history to compose a tailored journey.
                </p>
              </div>
              <motion.button
                onClick={handleGenerate}
                disabled={isGenerating}
                whileHover={{ scale: isGenerating ? 1 : 1.03 }}
                whileTap={{ scale: isGenerating ? 1 : 0.97 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="sheen group inline-flex shrink-0 items-center gap-2.5 rounded-xl bg-gold px-7 py-3.5 text-sm font-semibold text-navy-950 shadow-lg transition hover:bg-gold-400 disabled:opacity-60"
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
              </motion.button>
            </div>
          </div>
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorText}
            </motion.div>
          )}
        </Reveal>

        {/* ===================== 04 · AGENT REASONING WORKSPACE ===================== */}
        <Reveal as="section">
          <SectionHeading index="04" title="Agent Reasoning Workspace" kicker="How the agent thinks, step by step" />
          <div className="relative overflow-hidden rounded-2xl border border-navy-800 bg-navy-900 p-7 text-ivory shadow-[0_24px_60px_-32px_rgba(12,22,38,0.8)]">
            <div className="aurora opacity-30" />
            <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REASONING_STEPS.map((step, i) => {
                const status = stepStatus(i);
                return (
                  <motion.div
                    key={step.key}
                    animate={
                      status === "active"
                        ? { scale: [1, 1.02, 1], transition: { duration: 1.3, repeat: Infinity } }
                        : { scale: 1 }
                    }
                    className={`rounded-xl border p-4 transition-colors duration-500 ${
                      status === "active"
                        ? "border-gold/50 bg-navy-800 shadow-[0_0_0_1px_rgba(184,138,50,0.2)]"
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
                  </motion.div>
                );
              })}
            </div>

            {/* Real agent decision — surfaced from the backend once it has run. */}
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="relative mt-5 grid gap-3 border-t border-ivory/10 pt-5 sm:grid-cols-3"
              >
                {/* Dynamic routing */}
                <div className="rounded-xl border border-ivory/10 bg-navy-800/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-ivory/45">
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Dynamic route</span>
                  </div>
                  {result.segment ? (
                    <span className="inline-flex items-center rounded-md bg-gold/15 px-2.5 py-1 text-sm font-semibold text-gold-300">
                      {segmentLabel(result.segment)}
                    </span>
                  ) : (
                    <span className="text-sm text-ivory/40">—</span>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ivory/45">
                    LangGraph picked this branch from the member's segment.
                  </p>
                </div>

                {/* Self-critique / validation */}
                <div className="rounded-xl border border-ivory/10 bg-navy-800/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-ivory/45">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Self-critique</span>
                  </div>
                  {result.validationPassed === null ? (
                    <span className="text-sm text-ivory/40">—</span>
                  ) : result.validationPassed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-1 text-sm font-semibold text-emerald-300">
                      <Check className="h-3.5 w-3.5" /> Validated
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-1 text-sm font-semibold text-amber-300">
                      <ShieldAlert className="h-3.5 w-3.5" /> Needs review
                    </span>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ivory/45">
                    Output passed the validate → revise compliance loop.
                  </p>
                </div>

                {/* Consent reasoning */}
                <div className="rounded-xl border border-ivory/10 bg-navy-800/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-ivory/45">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Consent decision</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-ivory/80">
                    {result.consentNotes || "Personalization consent applied as recorded."}
                  </p>
                </div>
              </motion.div>
            )}

            {result?.reasoning && (
              <p className="relative mt-3 rounded-xl bg-navy-800/40 px-4 py-3 text-xs italic leading-relaxed text-ivory/55">
                <span className="font-semibold not-italic text-ivory/70">Agent rationale: </span>
                {result.reasoning}
              </p>
            )}

            <p className="relative mt-5 border-t border-ivory/10 pt-4 text-xs text-ivory/40">
              Engine: LangGraph · NVIDIA NIM <span className="text-ivory/60">meta/llama-3.1-70b-instruct</span> ·
              FAISS retrieval with <span className="text-ivory/60">nv-embedqa-e5-v5</span> embeddings.
            </p>
          </div>
        </Reveal>

        {/* ===================== 05 · REWARD JOURNEY TIMELINE ===================== */}
        <Reveal as="section">
          <SectionHeading index="05" title="Reward Journey Timeline" kicker="The future the agent designed" />
          <Card hover={false} className="p-7">

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
                  <motion.div
                    className="h-full rounded-full bg-gold"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${prog.progressPct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: EASE }}
                  />
                </div>
                {prog.next ? <TierBadge tier={prog.next} /> : <Crown className="h-5 w-5 text-gold" />}
              </div>
            </div>

            {!result ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ivory-100 text-gold"
                >
                  <Sparkles className="h-6 w-6" />
                </motion.div>
                <p className="mt-3 text-sm font-semibold text-navy-800">Awaiting design</p>
                <p className="mt-1 max-w-sm text-xs text-navy-900/45">
                  Run the agent to compose {activeCustomer.name}'s reward roadmap.
                </p>
              </div>
            ) : personalizedNow && journey ? (
              <>
                {/* Message */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="mb-6 rounded-xl border-l-2 border-gold bg-ivory-100 px-5 py-4"
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-900/40">
                    Message to {activeCustomer.name}
                  </p>
                  <p className="font-serif text-[16px] italic leading-relaxed text-navy-800">
                    &ldquo;{journey.friendlyMessage}&rdquo;
                  </p>
                </motion.div>

                {/* Milestones */}
                <div className="relative pl-7">
                  <motion.div
                    className="absolute left-[9px] top-1 w-px bg-navy-900/10"
                    initial={{ height: 0 }}
                    animate={{ height: "calc(100% - 8px)" }}
                    transition={{ duration: 0.8, ease: EASE }}
                  />
                  <StaggerGroup className="space-y-5">
                    {journey.rewards.map((rw, i) => (
                      <StaggerItem key={i} className="relative">
                        <span className="absolute -left-7 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-gold bg-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                        </span>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-600">
                          Week {i + 1}
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-navy-900">{rw.title}</p>
                        {rw.reason && <p className="mt-0.5 text-xs leading-relaxed text-navy-900/55">{rw.reason}</p>}
                      </StaggerItem>
                    ))}
                    {/* Next best offer node */}
                    <StaggerItem className="relative">
                      <span className="absolute -left-7 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-navy-900">
                        <ArrowRight className="h-2.5 w-2.5 text-gold-300" />
                      </span>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-900/45">
                        Next best offer
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-navy-900">{journey.nextBestOffer.title}</p>
                    </StaggerItem>
                  </StaggerGroup>
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
          </Card>
        </Reveal>

        {/* ===================== 06 · BUSINESS IMPACT PREVIEW ===================== */}
        <Reveal as="section">
          <SectionHeading index="06" title="Business Impact Preview" kicker="Projected outcomes — modeled estimate" />
          <StaggerGroup className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Users, label: "Predicted retention", value: impact.retention, suffix: "%", caption: "12-month likelihood this member stays active." },
              { icon: TrendingUp, label: "Engagement uplift", value: impact.engagementUplift, suffix: "%", caption: "Expected lift vs. a generic offer." },
              { icon: Gauge, label: "Loyalty growth", value: impact.loyaltyGrowth, suffix: " pts", caption: "Projected points earned next quarter." },
            ].map((m) => (
              <StaggerItem key={m.label}>
                <Card className="h-full p-6">
                  <div className="flex items-center justify-between">
                    <m.icon className="h-5 w-5 text-gold" />
                    <span className="rounded-full bg-ivory-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-navy-900/40">
                      estimate
                    </span>
                  </div>
                  <p className="mt-4 font-serif text-5xl font-semibold tracking-tight text-navy-900">
                    <CountUp value={m.value} />
                    <span className="text-xl text-navy-900/40">{m.suffix}</span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-900/45">{m.label}</p>
                  <p className="mt-2 text-xs leading-relaxed text-navy-900/55">{m.caption}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </Reveal>

      </main>

      <footer className="mx-auto mt-16 max-w-6xl px-6">
        <div className="border-t border-navy-900/10 pt-6 text-center font-mono text-[10px] tracking-wider text-navy-900/35">
          LoyaltyForge · Personalized Reward Journeys — NVIDIA NIM + LangGraph + FAISS RAG · consent-aware by design
        </div>
      </footer>
    </div>
  );
}
