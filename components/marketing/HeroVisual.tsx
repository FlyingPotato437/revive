"use client";

import { motion } from "framer-motion";

const events = [
  { label: "Grant rejected", meta: "AADSTS700082", tone: "fail", delay: .2 },
  { label: "Run checkpointed", meta: "step 05 · files", tone: "blue", delay: .55 },
  { label: "User reauthorized", meta: "lease generation 2", tone: "warn", delay: .9 },
  { label: "Action replayed once", meta: "8 / 8 complete", tone: "ok", delay: 1.25 },
];

export function HeroVisual() {
  return (
    <motion.div initial={{ opacity: 0, y: 22, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .85, delay: .2, ease: [0.22, 1, 0.36, 1] }} className="relative">
      <div className="absolute -inset-10 -z-10 rounded-full bg-cobalt/10 blur-3xl" />
      <div className="overflow-hidden rounded-[18px] border border-[#292f3d] bg-[#121620] shadow-[0_28px_80px_-32px_rgba(18,27,60,.55)]">
        <header className="flex h-12 items-center justify-between border-b border-white/10 px-4"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#42d392] shadow-[0_0_0_4px_rgba(66,211,146,.1)]" /><span className="text-[10px] font-medium text-white/70">Recovery case</span></div><span className="font-mono text-[8.5px] text-white/25">rcv_7f2b1a</span></header>
        <div className="grid gap-0 md:grid-cols-[1fr_170px]">
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-[9px] font-semibold uppercase tracking-[.11em] text-white/30">Nightly executive briefing</div><div className="mt-1 text-[12px] font-medium text-white/85">Same logical run · process independent</div></div><span className="rounded-[5px] border border-[#d19a35]/20 bg-[#d19a35]/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-[.08em] text-[#e5b75f]">recovering</span></div>
            <div className="relative space-y-1">
              <span className="absolute bottom-5 left-[11px] top-5 w-px bg-white/10" />
              {events.map((event, index) => <motion.div key={event.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .45, delay: event.delay }} className="relative flex items-center gap-3 rounded-[8px] px-1 py-2.5"><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: event.delay, type: "spring", stiffness: 300, damping: 20 }} className={`relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border ${event.tone === "fail" ? "border-[#e06a61]/35 bg-[#e06a61]/10" : event.tone === "ok" ? "border-[#42d392]/35 bg-[#42d392]/10" : event.tone === "warn" ? "border-[#e5b75f]/35 bg-[#e5b75f]/10" : "border-[#7890ff]/35 bg-[#7890ff]/10"}`}><span className={`h-1.5 w-1.5 rounded-full ${event.tone === "fail" ? "bg-[#e06a61]" : event.tone === "ok" ? "bg-[#42d392]" : event.tone === "warn" ? "bg-[#e5b75f]" : "bg-[#7890ff]"}`} /></motion.span><div className="min-w-0 flex-1"><div className="text-[10.5px] font-medium text-white/80">{event.label}</div><div className="mt-0.5 truncate font-mono text-[8.5px] text-white/28">{event.meta}</div></div>{index === events.length - 1 && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="font-mono text-[8px] text-[#42d392]">resolved</motion.span>}</motion.div>)}
            </div>
          </div>
          <aside className="border-t border-white/10 bg-white/[.025] p-4 md:border-l md:border-t-0"><div className="text-[8px] font-semibold uppercase tracking-[.12em] text-white/25">Invariants</div><div className="mt-4 space-y-3"><Invariant label="Credential" value="gen 2" /><Invariant label="Checkpoint" value="durable" /><Invariant label="Duplicate effects" value="0" /><Invariant label="Resume time" value="4.8s" /></div><div className="mt-5 rounded-[8px] border border-[#42d392]/15 bg-[#42d392]/[.06] p-3"><div className="flex items-center gap-2 text-[9px] font-medium text-[#6de2ad]"><span className="h-1.5 w-1.5 rounded-full bg-[#42d392]" />Run recovered</div><div className="mt-1.5 font-mono text-[8px] text-white/30">action key preserved</div></div></aside>
        </div>
        <div className="relative h-1 overflow-hidden bg-white/[.04]"><motion.span initial={{ x: "-100%" }} animate={{ x: "400%" }} transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }} className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-cobalt to-transparent" /></div>
      </div>
    </motion.div>
  );
}

function Invariant({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-white/[.07] pb-2.5 text-[9px] last:border-0"><span className="text-white/30">{label}</span><span className="font-mono text-white/65">{value}</span></div>;
}
