"use client";

import { Check, EnvelopeSimple, HandPointing, Pause, Play } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

type EventKind = "blocked" | "request" | "person" | "verified" | "resumed";
const EVENTS: Array<{ t: string; label: string; status: string; kind: EventKind; pause: number }> = [
  { t: "09:14:02", label: "QuickBooks sync", status: "run died · 18,420 tokens", kind: "blocked", pause: 900 },
  { t: "09:14:03", label: "dead-run detector", status: "expired OAuth · 96%", kind: "verified", pause: 1100 },
  { t: "09:14:04", label: "secure reconnect link", status: "sent to account owner", kind: "request", pause: 1200 },
  { t: "09:18:41", label: "QuickBooks access", status: "same subject restored", kind: "person", pause: 1200 },
  { t: "09:18:42", label: "resume safety", status: "recent · resume", kind: "verified", pause: 900 },
  { t: "09:18:43", label: "fetch-open-invoices", status: "same run resumed", kind: "resumed", pause: 900 },
];
const ICONS = { blocked: Pause, request: EnvelopeSimple, person: HandPointing, verified: Check, resumed: Play };

function phase(count: number) {
  if (count <= 1) return { label: "BLOCKED", className: "bg-[#fcedeb] text-[#a13b35]" };
  if (count <= 2) return { label: "WAITING", className: "bg-[#fff1cf] text-[#83521c]" };
  if (count <= 5) return { label: "VALIDATING", className: "bg-[#edf0ff] text-[#2e49c8]" };
  return { label: "RESUMED", className: "bg-[#151922] text-white" };
}

export function HeroVisual() {
  const reduceMotion = useReducedMotion(); const [count, setCount] = useState(0);
  useEffect(() => {
    if (reduceMotion) { setCount(EVENTS.length); return; }
    let step = 0; let timer: ReturnType<typeof setTimeout>;
    const tick = () => { step += 1; setCount(step); timer = step < EVENTS.length ? setTimeout(tick, EVENTS[step - 1].pause) : setTimeout(() => { step = 0; setCount(0); timer = setTimeout(tick, 700); }, 4300); };
    timer = setTimeout(tick, 750); return () => clearTimeout(timer);
  }, [reduceMotion]);
  const current = phase(Math.max(1, count)); const resumed = count === EVENTS.length;
  return <div className="hero-intro-visual relative min-w-0"><figure className="relative flex h-full min-h-[560px] items-center justify-center overflow-hidden border-t border-[#151922] bg-[#2946cf] px-5 py-16 sm:px-10 lg:border-l lg:border-t-0" aria-label="A bookkeeping agent run dies after QuickBooks access expires, Revive detects the blocker, sends the account owner a reconnect link, and resumes the same run">
    <div aria-hidden className="absolute aspect-square w-[125%] rounded-full border border-dashed border-white/20" /><div aria-hidden className="absolute aspect-square w-[88%] rounded-full border border-[#151922]/20" />
    <div className="relative w-full max-w-[510px] border border-[#151922] bg-[#fbfcf8] shadow-[10px_12px_0_rgba(21,25,34,.28)]">
      <div className="flex items-center justify-between border-b border-[#e0e3dd] px-5 py-3.5"><div className="flex items-center gap-2.5"><span className={`h-1.5 w-1.5 rounded-full ${resumed ? "bg-[#18724e]" : "bg-[#c2413a]"}`} /><span className="font-mono text-[10px] font-medium tracking-[.08em]">RUN · books_842</span></div><AnimatePresence mode="wait" initial={false}><motion.span key={current.label} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={`px-2 py-1 font-mono text-[9px] font-semibold tracking-[.08em] ${current.className}`}>{current.label}</motion.span></AnimatePresence></div>
      <div className="min-h-[310px] px-5 py-4">{EVENTS.slice(0, count).map((event, index) => { const Icon = ICONS[event.kind]; const accent = event.kind === "blocked" ? "text-[#c2413a]" : event.kind === "resumed" || event.kind === "verified" ? "text-[#18724e]" : "text-[#2946cf]"; return <motion.div key={`${event.label}-${index}`} initial={reduceMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }} className="grid grid-cols-[62px_20px_1fr] gap-3 border-b border-[#eef0eb] py-3.5 last:border-0"><span className="font-mono text-[9px] text-[#9aa1aa]">{event.t}</span><span className={`flex h-5 w-5 items-center justify-center border border-[#dfe2dc] bg-white ${accent}`}><Icon size={11} weight="bold" /></span><span className="min-w-0"><span className="block truncate font-mono text-[11px] text-[#151922]">{event.label}</span><span className={`mt-0.5 block truncate font-mono text-[8.5px] tracking-[.04em] ${accent}`}>{event.status.toUpperCase()}</span></span></motion.div>; })}</div>
      <div className="flex items-center justify-between border-t border-[#e0e3dd] bg-[#f4f5f1] px-5 py-3 font-mono text-[8.5px] tracking-[.06em] text-[#7b8491]"><span>RECIPIENT · RUN · CHECKPOINT · GEN 8</span><span>{resumed ? "CONTINUED ONCE" : "WORKER PARKED"}</span></div>
    </div>
  </figure></div>;
}
