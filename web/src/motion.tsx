// Reusable motion primitives for the studio (Framer Motion).
// Kept small and dependency-light; everything honors prefers-reduced-motion.
import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type Variants,
} from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* Reveal — fades + lifts a block into view once, as it scrolls in. */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "header";
}) {
  const reduce = useReducedMotion();
  const MotionTag =
    as === "section" ? motion.section : as === "header" ? motion.header : motion.div;
  return (
    <MotionTag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}

/* Stagger container + item — for lists/grids that reveal in sequence. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export function StaggerGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  key?: React.Key;
}) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/* CountUp — springs a number from 0 to `value` when it scrolls into view
   (or whenever `value` changes). Formats with an optional locale + decimals. */
export function CountUp({
  value,
  decimals = 0,
  locale = true,
  className,
}: {
  value: number;
  decimals?: number;
  locale?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: 1.1, bounce: 0 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    if (inView) mv.set(value);
  }, [inView, value, reduce, mv]);

  useEffect(() => {
    if (reduce) return;
    return spring.on("change", (v) => setDisplay(v));
  }, [spring, reduce]);

  const shown = reduce ? value : display;
  const text =
    decimals > 0
      ? shown.toFixed(decimals)
      : locale
      ? Math.round(shown).toLocaleString()
      : String(Math.round(shown));

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}

export { motion, useReducedMotion };
