"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LogLine } from "@/lib/useReviveClient";

const LEVEL: Record<string, string> = { info: "bg-cobalt", good: "bg-ok", warn: "bg-warn", error: "bg-fail" };

function fmtTime(at: number) {
  return new Date(at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventLog({ logs }: { logs: LogLine[] }) {
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<"all" | "baseline" | "revive">("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const shown = logs.filter((line) => filter === "all" || line.lane === filter);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" }), [shown.length, reduceMotion]);

  return (
    <section className="recorder-panel flex h-full flex-col overflow-hidden rounded-[8px] border border-[#242936]">
      <header className="flex h-11 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2"><span className="font-mono text-[7.5px] text-white/22">REC/07</span><span className="h-1.5 w-1.5 rounded-full bg-[#42d392]" /><span className="text-[11px] font-medium text-white/80">Recovery event recorder</span><span className="font-mono text-[9px] text-white/30">live</span></div>
        <div className="flex items-center rounded-[6px] bg-white/[0.05] p-0.5">{(["all", "baseline", "revive"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-[5px] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${filter === item ? "bg-white/10 text-white" : "text-white/35 hover:text-white/70"}`}>{item === "baseline" ? "control" : item}</button>)}</div>
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!shown.length ? <div className="flex h-full items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.03] font-mono text-[13px] text-white/30">›_</div><div className="font-mono text-[10px] text-white/25">Events will appear after fault injection</div></div></div> : <AnimatePresence initial={false}>{shown.map((line) => <motion.div key={line.id} initial={reduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[60px_58px_54px_1fr] items-baseline gap-2 rounded-[5px] px-2 py-1.5 font-mono text-[10.5px] hover:bg-white/[0.025]"><span className="text-white/25">{fmtTime(line.at)}</span><span className={`inline-flex w-fit items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-[8.5px] uppercase ${line.lane === "revive" ? "bg-[#4967f2]/15 text-[#8ea0ff]" : "bg-white/[0.06] text-white/35"}`}><span className={`h-1 w-1 rounded-full ${LEVEL[line.level]}`} />{line.lane === "revive" ? "revive" : "control"}</span><span className="text-white/30">{line.tag}</span><span className="min-w-0 text-white/70">{line.message}</span></motion.div>)}</AnimatePresence>}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
