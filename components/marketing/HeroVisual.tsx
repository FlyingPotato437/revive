"use client";

import {
  ArrowRight,
  Check,
  Key,
  LinkBreak,
  UserCircle,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

const phases = [
  {
    key: "running",
    label: "Run in progress",
    detail: "credential generation 01",
  },
  {
    key: "blocked",
    label: "Access rejected",
    detail: "run held at checkpoint 05",
  },
  {
    key: "reconnect",
    label: "Owner reconnecting",
    detail: "subject and tenant verified",
  },
  {
    key: "resumed",
    label: "Same run resumed",
    detail: "credential generation 02",
  },
] as const;

export function HeroVisual() {
  const scene = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(reduceMotion ? 3 : 0);
  const { scrollYProgress } = useScroll({
    target: scene,
    offset: ["start start", "end start"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 30,
    mass: 0.2,
  });
  const tokenRotation = useTransform(progress, [0, 0.26, 0.48, 0.74, 1], [-52, 14, 14, 112, 146]);
  const tokenCounterRotation = useTransform(tokenRotation, (value) => -value);
  const ringRotation = useTransform(progress, [0, 1], [-10, 32]);
  const outerRingRotation = useTransform(progress, [0, 1], [16, -24]);
  const discY = useTransform(progress, [0, 1], [0, 76]);
  const discScale = useTransform(progress, [0, 0.42, 1], [0.98, 1, 1.06]);
  const gateX = useTransform(progress, [0, 0.3, 0.55, 1], [0, 0, -18, -4]);
  const ambientOpacity = useTransform(progress, [0, 0.45, 1], [0.32, 0.68, 0.18]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(3);
    }
  }, [reduceMotion]);

  useMotionValueEvent(progress, "change", (value) => {
    if (reduceMotion) return;
    const next = value < 0.23 ? 0 : value < 0.46 ? 1 : value < 0.7 ? 2 : 3;
    setPhase((currentPhase) => currentPhase === next ? currentPhase : next);
  });

  const current = phases[phase];
  const blocked = phase === 1;
  const reconnecting = phase === 2;
  const resumed = phase === 3;

  return (
    <div
      ref={scene}
      className="relative min-w-0 lg:min-h-[124dvh]"
    >
      <figure
        className="continuity-relay relative flex min-h-[520px] items-center justify-center overflow-hidden border-t border-[#151922] bg-[#2946cf] px-5 py-12 sm:min-h-[610px] sm:px-10 lg:sticky lg:top-[63px] lg:min-h-[calc(100dvh-63px)] lg:border-l lg:border-t-0"
        aria-label="A Revive recovery relay keeps one workflow run intact while its credential is replaced"
      >
        <motion.div
          aria-hidden="true"
          className="absolute aspect-square w-[112%] rounded-full border border-[#f4f5f1]/25"
          style={reduceMotion ? { rotate: 0, opacity: 0.25 } : { rotate: outerRingRotation, opacity: ambientOpacity }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute aspect-square w-[86%] rounded-full border border-[#151922]/30"
          style={reduceMotion ? { rotate: 0 } : { rotate: ringRotation }}
        >
          <span className="absolute left-1/2 top-[-5px] h-[10px] w-14 -translate-x-1/2 border border-[#151922] bg-[#f1c55b]" />
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relay-disc relative aspect-square w-full max-w-[560px]"
          style={reduceMotion ? undefined : { y: discY, scale: discScale }}
        >
        <svg
          aria-hidden="true"
          className="absolute inset-[7%] h-[86%] w-[86%] -rotate-[38deg]"
          viewBox="0 0 500 500"
        >
          <circle
            cx="250"
            cy="250"
            r="203"
            fill="none"
            stroke="rgba(21,25,34,.18)"
            strokeWidth="2"
            strokeDasharray="8 9"
          />
          <motion.circle
            cx="250"
            cy="250"
            r="203"
            fill="none"
            stroke="#151922"
            strokeLinecap="square"
            strokeWidth="5"
            pathLength="1"
            strokeDasharray=".82 .18"
            initial={{ pathLength: 0.82, opacity: 1 }}
            animate={{
              pathLength: blocked || reconnecting ? 0.72 : resumed ? 1 : 0.82,
              opacity: blocked ? 0.58 : 1,
            }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>

        <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full border border-[#151922] bg-[#f4f5f1] text-center shadow-[8px_10px_0_rgba(21,25,34,.18)]">
          <span className="font-mono text-[8px] tracking-[.14em] text-[#6a7380]">
            SAME LOGICAL RUN
          </span>
          <span className="mt-2 text-[clamp(34px,4.2vw,58px)] font-semibold tracking-[-.07em] text-[#151922]">
            run_7f2
          </span>
          <div className="mt-5 h-[48px] overflow-hidden px-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? {} : { opacity: 0, y: -10 }}
                transition={{ duration: 0.28 }}
              >
                <div className="text-[13px] font-semibold text-[#151922]">
                  {current.label}
                </div>
                <div className="mt-1 font-mono text-[7px] tracking-[.06em] text-[#727b88]">
                  {current.detail.toUpperCase()}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[7%]"
          style={reduceMotion ? { rotate: 112 } : { rotate: tokenRotation }}
        >
          <motion.div
            className="relay-token absolute right-[-22px] top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#151922] bg-[#f4f5f1] shadow-[4px_4px_0_rgba(21,25,34,.22)]"
            style={reduceMotion ? { rotate: -112 } : { rotate: tokenCounterRotation }}
            animate={{ scale: blocked ? 0.9 : 1 }}
          >
            {blocked ? (
              <LinkBreak size={20} weight="bold" color="#b7473f" />
            ) : resumed ? (
              <Check size={20} weight="bold" color="#2946cf" />
            ) : (
              <ArrowRight size={20} weight="bold" color="#2946cf" />
            )}
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute right-[-2%] top-[31%] flex items-center gap-2 border border-[#151922] bg-[#f1c55b] px-3 py-2 shadow-[4px_4px_0_rgba(21,25,34,.2)]"
          style={reduceMotion ? undefined : { x: gateX }}
          animate={{ opacity: blocked || reconnecting ? 1 : 0.34, rotate: reconnecting ? -3 : 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {reconnecting ? <Key size={17} weight="fill" /> : <LinkBreak size={17} weight="bold" />}
          <span className="font-mono text-[8px] font-semibold tracking-[.08em]">
            {reconnecting ? "NEW GRANT" : "ACCESS GATE"}
          </span>
        </motion.div>

        <div className="absolute bottom-[3%] left-[2%] border border-[#151922] bg-[#f4f5f1] px-4 py-3 shadow-[4px_4px_0_rgba(21,25,34,.18)]">
          <div className="flex items-center gap-2">
            <UserCircle size={17} weight="bold" color="#2946cf" />
            <span className="font-mono text-[7px] tracking-[.1em] text-[#66707e]">
              ACCOUNT OWNER
            </span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-[#151922]">
            Same subject. Same tenant.
          </div>
        </div>

        <div className="absolute left-[2%] top-[9%] bg-[#151922] px-3 py-2 text-[#f4f5f1]">
          <div className="font-mono text-[7px] tracking-[.1em] text-[#aeb8d8]">
            SIDE EFFECT LEDGER
          </div>
          <div className="mt-1 font-mono text-[9px] font-semibold">
            1 COMMITTED / 0 REPLAYED
          </div>
        </div>
        </motion.div>

        <figcaption className="sr-only">
          Scroll to follow one run from credential rejection through verified reconnection and resume.
        </figcaption>
      </figure>
    </div>
  );
}
