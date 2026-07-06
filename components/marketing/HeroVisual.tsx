"use client";

import { Check, Key, LinkBreak, Pause } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

type EventKind = "ok" | "fail" | "hold" | "auth";

const EVENTS: { t: string; label: string; status: string; kind: EventKind; pause: number }[] = [
  { t: "09:14:02", label: "fetch_invoices", status: "committed", kind: "ok", pause: 750 },
  { t: "09:14:05", label: "draft_summary", status: "committed", kind: "ok", pause: 750 },
  { t: "09:14:07", label: "send_email · gmail", status: "grant rejected", kind: "fail", pause: 1500 },
  { t: "09:14:07", label: "run parked at checkpoint 05", status: "nothing lost", kind: "hold", pause: 1500 },
  { t: "09:16:31", label: "owner reconnected", status: "same subject · same tenant", kind: "auth", pause: 1100 },
  { t: "09:16:32", label: "send_email · gmail", status: "resumed · not replayed", kind: "ok", pause: 750 },
];

const ICONS: Record<EventKind, { icon: typeof Check; color: string }> = {
  ok: { icon: Check, color: "#2946cf" },
  fail: { icon: LinkBreak, color: "#c2413a" },
  hold: { icon: Pause, color: "#66707e" },
  auth: { icon: Key, color: "#151922" },
};

function phaseFor(count: number) {
  if (count <= 2) return { label: "RUNNING", className: "bg-[#dfe4ff] text-[#2e49c8]" };
  if (count <= 4) return { label: "PARKED", className: "bg-[#fcedeb] text-[#c2413a]" };
  if (count === 5) return { label: "RECOVERING", className: "bg-[#f6e3b4] text-[#151922]" };
  return { label: "RESUMED", className: "bg-[#151922] text-white" };
}

export function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setCount(EVENTS.length);
      return;
    }
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      step += 1;
      setCount(step);
      if (step < EVENTS.length) {
        timer = setTimeout(tick, EVENTS[step - 1].pause);
      } else {
        timer = setTimeout(() => {
          step = 0;
          setCount(0);
          timer = setTimeout(tick, 700);
        }, 4600);
      }
    };
    timer = setTimeout(tick, 800);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  const phase = phaseFor(Math.max(count, 1));
  const resumed = count >= EVENTS.length;

  return (
    <div className="hero-intro-visual relative min-w-0">
      <figure
        className="relative flex h-full min-h-[560px] items-center justify-center overflow-hidden border-t border-[#151922] bg-[#2946cf] px-5 py-16 sm:px-10 lg:border-l lg:border-t-0"
        aria-label="A Revive recovery case: a run fails on a rejected grant, parks at its checkpoint, and resumes after the account owner reconnects"
      >
        <div
          aria-hidden="true"
          className="absolute aspect-square w-[130%] rounded-full border border-dashed border-[#f4f5f1]/20"
        />
        <div
          aria-hidden="true"
          className="absolute aspect-square w-[94%] rounded-full border border-[#151922]/20"
        />

        <div className="relative w-full max-w-[500px] border border-[#151922] bg-[#fbfcf8] shadow-[10px_12px_0_rgba(21,25,34,.28)]">
          <div className="flex items-center justify-between border-b border-[#e0e3dd] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${resumed ? "bg-[#2946cf]" : "bg-[#c2413a]"}`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${resumed ? "bg-[#2946cf]" : "bg-[#c2413a]"}`} />
              </span>
              <span className="font-mono text-[10px] font-medium tracking-[.08em] text-[#151922]">RECOVERY CASE · run_7f2</span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={phase.label}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? {} : { opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className={`px-2 py-1 font-mono text-[9px] font-semibold tracking-[.08em] ${phase.className}`}
              >
                {phase.label}
              </motion.span>
            </AnimatePresence>
          </div>

          <div className="min-h-[318px] px-5 py-4">
            {EVENTS.slice(0, count).map((event, index) => {
              const { icon: Icon, color } = ICONS[event.kind];
              return (
                <motion.div
                  key={`${event.label}-${index}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 7 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className={`grid grid-cols-[64px_20px_1fr_auto] items-center gap-3 border-b border-[#eef0eb] py-3 last:border-0 ${event.kind === "hold" ? "opacity-80" : ""}`}
                >
                  <span className="font-mono text-[10px] text-[#9aa1aa]">{event.t}</span>
                  <span className="flex h-5 w-5 items-center justify-center border border-[#e0e3dd] bg-white">
                    <Icon size={11} weight="bold" color={color} />
                  </span>
                  <span className="truncate font-mono text-[12px] text-[#151922]">{event.label}</span>
                  <span className={`font-mono text-[9px] tracking-[.04em] ${event.kind === "fail" ? "text-[#c2413a]" : "text-[#7b8491]"}`}>
                    {event.status.toUpperCase()}
                  </span>
                </motion.div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[#e0e3dd] bg-[#f4f5f1] px-5 py-3 font-mono text-[9px] tracking-[.06em] text-[#7b8491]">
            <span>CHECKPOINT 05 PRESERVED</span>
            <span>{resumed ? "GEN 01 → 02" : "GEN 01"} · 0 REPLAYED</span>
          </div>
        </div>

        <figcaption className="sr-only">
          One run fails on a rejected credential, parks at its checkpoint, and the same run resumes after the account owner reconnects — with no committed action replayed.
        </figcaption>
      </figure>
    </div>
  );
}
