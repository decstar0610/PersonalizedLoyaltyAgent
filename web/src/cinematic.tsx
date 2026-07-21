// Cinematic layer for the studio: a full-screen animated hero + page-wide
// ambient motion. Keeps the navy/ivory/gold identity; adds the "moment".
import React, { useMemo, useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { ChevronDown, Sparkles, ShieldCheck, GitBranch, Cpu } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* Page-wide drifting orbs — soft ambient depth behind everything. */
export function AmbientOrbs() {
  const reduce = useReducedMotion();
  const orbs = [
    { c: "rgba(184,138,50,0.20)", size: 520, x: "6%", y: "4%", dur: 23 },
    { c: "rgba(37,57,90,0.18)", size: 640, x: "70%", y: "14%", dur: 29 },
    { c: "rgba(184,138,50,0.12)", size: 460, x: "48%", y: "62%", dur: 26 },
    { c: "rgba(18,32,54,0.16)", size: 560, x: "16%", y: "80%", dur: 31 },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: o.size,
            height: o.size,
            left: o.x,
            top: o.y,
            background: `radial-gradient(circle, ${o.c}, transparent 70%)`,
            filter: "blur(44px)",
          }}
          animate={reduce ? undefined : { x: [0, 46, -22, 0], y: [0, -34, 22, 0] }}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* Twinkling gold sparks used inside the dark hero. */
function Sparks() {
  const reduce = useReducedMotion();
  const sparks = useMemo(
    () =>
      Array.from({ length: 26 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 4,
        dur: 2.5 + Math.random() * 4,
        size: 1.5 + Math.random() * 2.5,
      })),
    []
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-gold-200"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.6, 1, 0.6] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

const HEADLINE = ["Every", "member.", "A", "journey", "of", "one."];

/* Full-screen cinematic hero. Parallaxes + fades as you scroll into the studio. */
export function Hero({
  memberCount,
  onEnter,
}: {
  memberCount: number;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 180]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);

  const chips = [
    { icon: Cpu, label: "NVIDIA NIM" },
    { icon: ShieldCheck, label: "Consent-gated" },
    { icon: GitBranch, label: "Self-critiquing agent" },
  ];

  return (
    <section
      ref={ref}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 text-center text-ivory"
    >
      <div className="aurora opacity-80" />
      <Sparks />
      {/* soft vignette to the ivory content below */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ivory/10" />

      <motion.div style={{ y, opacity, scale }} className="relative z-10 max-w-3xl">
        {/* eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-navy-900/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300 backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5" />
          LoyaltyForge · Reward Journeys
        </motion.div>

        {/* headline — words rise in sequence */}
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
          {HEADLINE.map((w, i) => {
            const accent = i >= 2; // "A journey of one." in gold serif
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.15 + i * 0.09 }}
                className={
                  accent
                    ? "mr-[0.25em] inline-block font-serif italic text-gold-300"
                    : "mr-[0.25em] inline-block"
                }
              >
                {w}
              </motion.span>
            );
          })}
        </h1>

        {/* sub-copy */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.8 }}
          className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ivory/60 sm:text-lg"
        >
          An autonomous agent designs a personalized, consent-aware reward journey for
          every member — grounded in their history, validated against the rules.
        </motion.p>

        {/* chips */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 1 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
        >
          {chips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-ivory/12 bg-navy-800/50 px-3.5 py-1.5 text-xs font-medium text-ivory/70 backdrop-blur"
            >
              <c.icon className="h-3.5 w-3.5 text-gold-300" />
              {c.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-3.5 py-1.5 text-xs font-semibold text-gold-200">
            {memberCount.toLocaleString()} members loaded
          </span>
        </motion.div>

        {/* enter button */}
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 1.15 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={onEnter}
          className="sheen mt-10 inline-flex items-center gap-2.5 rounded-xl bg-gold px-8 py-4 text-sm font-semibold text-navy-950 shadow-[0_20px_50px_-15px_rgba(184,138,50,0.6)]"
        >
          Enter the studio
          <ChevronDown className="h-4 w-4" />
        </motion.button>
      </motion.div>

      {/* animated scroll cue */}
      <motion.div
        style={{ opacity }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-10 w-6 items-start justify-center rounded-full border border-ivory/25 p-1.5"
        >
          <span className="h-2 w-1 rounded-full bg-gold-300" />
        </motion.div>
      </motion.div>
    </section>
  );
}
