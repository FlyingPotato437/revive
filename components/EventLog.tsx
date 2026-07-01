"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LogLine } from "@/lib/useReviveClient";

const LEVEL: Record<string, string> = { info: "border-cobalt text-cobalt", good: "border-ok text-ok", warn: "border-warn text-warn", error: "border-fail text-fail" };

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
    <section className="recorder-panel flex h-full flex-col overflow-hidden border border-[#151922]">
      <header className="flex min-h-11 items-center justify-between border-b border-[#151922] px-4 py-2">
        <div className="flex items-center gap-2"><span className="font-mono text-[8px] tracking-[.1em] text-[#737c89]">EVENT RECORD</span><span className="h-2 w-2 bg-[#148060]" /><span className="text-[11px] font-semibold text-[#151922]">Recovery recorder</span></div>
        <div className="flex items-center border border-[#c5cbd3] bg-[#fbfcf8] p-0.5">{(["all", "baseline", "revive"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`px-2 py-1 text-[9px] font-medium uppercase tracking-[0.07em] ${filter === item ? "bg-[#151922] text-white" : "text-[#737c89] hover:text-[#151922]"}`}>{item === "baseline" ? "control" : item}</button>)}</div>
      </header>
      <div className="flex-1 overflow-y-auto bg-[#fbfcf8] px-3 py-2">
        {!shown.length ? <div className="flex h-full items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center border border-[#c7ccd2] bg-[#eef0eb] font-mono text-[13px] text-[#737c89]">›_</div><div className="font-mono text-[10px] text-[#8a929d]">Events will appear after fault injection</div></div></div> : <AnimatePresence initial={false}>{shown.map((line) => <motion.div key={line.id} initial={reduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[60px_58px_54px_1fr] items-baseline gap-2 border-b border-[#e0e3e6] px-2 py-1.5 font-mono text-[10.5px] hover:bg-[#f2f3ef]"><span className="text-[#8a929d]">{fmtTime(line.at)}</span><span className={`inline-flex w-fit items-center border px-1.5 py-0.5 text-[8.5px] uppercase ${line.lane === "revive" ? "border-[#b9c3ff] bg-[#edf0ff] text-[#2e49c8]" : "border-[#d1d5d9] bg-[#eef0eb] text-[#687180]"}`}><span className={`mr-1.5 inline-block h-1.5 w-1.5 border ${LEVEL[line.level]}`} />{line.lane === "revive" ? "revive" : "control"}</span><span className="text-[#747d8a]">{line.tag}</span><span className="min-w-0 text-[#3f4753]">{line.message}</span></motion.div>)}</AnimatePresence>}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
