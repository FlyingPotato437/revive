"use client";

import {
  ArrowRight,
  Check,
  Key,
  LinkBreak,
  UserCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

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

const tokenPositions = [
  { x: 71, y: 27 },
  { x: 82, y: 47 },
  { x: 82, y: 47 },
  { x: 51, y: 84 },
];

export function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(reduceMotion ? 3 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(3);
      return;
    }

    const timer = window.setInterval(
      () => setPhase((value) => (value + 1) % phases.length),
      1850,
    );
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const current = phases[phase];
  const blocked = phase === 1;
  const reconnecting = phase === 2;
  const resumed = phase === 3;

  return (
    <figure
      className="continuity-relay relative flex min-h-[520px] min-w-0 items-center justify-center overflow-hidden border-t border-[#151922] bg-[#2946cf] px-5 py-12 sm:min-h-[610px] sm:px-10 lg:min-h-[calc(100dvh-63px)] lg:border-l lg:border-t-0"
      aria-label="A Revive recovery relay keeps one workflow run intact while its credential is replaced"
    >
      <div className="relay-registration" aria-hidden="true">
        <span>RV / CONTINUITY RELAY</span>
        <span>01</span>
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, rotate: 2 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relay-disc relative aspect-square w-full max-w-[560px]"
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
          className="relay-token absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#151922] bg-[#f4f5f1] shadow-[4px_4px_0_rgba(21,25,34,.22)]"
          animate={{
            left: `${tokenPositions[phase].x}%`,
            top: `${tokenPositions[phase].y}%`,
            scale: blocked ? 0.9 : 1,
          }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
          {blocked ? (
            <LinkBreak size={20} weight="bold" color="#b7473f" />
          ) : resumed ? (
            <Check size={20} weight="bold" color="#2946cf" />
          ) : (
            <ArrowRight size={20} weight="bold" color="#2946cf" />
          )}
        </motion.div>

        <motion.div
          className="absolute right-[-2%] top-[31%] flex items-center gap-2 border border-[#151922] bg-[#f1c55b] px-3 py-2 shadow-[4px_4px_0_rgba(21,25,34,.2)]"
          animate={{
            opacity: blocked || reconnecting ? 1 : 0.34,
            x: reconnecting ? -18 : 0,
            rotate: reconnecting ? -3 : 0,
          }}
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

      <figcaption className="relay-caption">
        <span>{blocked ? "PAUSED" : reconnecting ? "VERIFYING" : resumed ? "RESUMED" : "RUNNING"}</span>
        <span>CHECKPOINT 05 HELD</span>
      </figcaption>
    </figure>
  );
}
