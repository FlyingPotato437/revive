"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { RunState } from "@/lib/types";

const PHASES = [
  { key: "detected", label: "Grant rejected", system: "identity" },
  { key: "bound", label: "Run bound", system: "revive" },
  { key: "checkpoint", label: "Checkpoint", system: "runtime" },
  { key: "requested", label: "User notified", system: "delivery" },
  { key: "authorized", label: "Reauthorized", system: "identity" },
  { key: "rotated", label: "Lease rotated", system: "revive" },
  { key: "replayed", label: "Replay once", system: "runtime" },
] as const;

export function RecoveryTrace({ run, compact = false }: { run: RunState | null; compact?: boolean }) {
  const reduceMotion = useReducedMotion();
  const reached = run ? [Boolean(run.classifier), Boolean(run.recoveryCase), Boolean(run.checkpoint), Boolean(run.ticket), run.token.generation > 1, run.token.generation > 1, run.metrics.resumes > 0] : PHASES.map(() => false);
  const current = reached.lastIndexOf(true);
  return <div className="overflow-x-auto"><div className={`relative grid min-w-[820px] grid-cols-7 ${compact ? "px-4 py-4" : "px-5 py-5"}`}>
    <div className="absolute left-[8%] right-[8%] top-[31px] h-px bg-[#dfe1dc]" />
    {PHASES.map((phase, index) => {
      const done = reached[index];
      const active = current === index && run?.status !== "completed";
      return <div key={phase.key} className="relative z-10 text-center">
        <motion.div initial={false} animate={{ scale: reduceMotion ? 1 : active ? 1.08 : 1 }} className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full border-[3px] border-white shadow-[0_0_0_1px_currentColor] ${done ? index === 0 ? "bg-[#c34d4d] text-[#c34d4d]" : index === 6 && run?.status === "completed" ? "bg-[#22845a] text-[#22845a]" : "bg-[#5065e8] text-[#5065e8]" : "bg-[#f6f6f2] text-[#c9cbc6]"}`}>
          {active && !reduceMotion && <span className="absolute h-5 w-5 animate-ping rounded-full bg-current opacity-15" />}
        </motion.div>
        <div className={`mt-3 text-[10px] font-semibold ${done ? "text-[#2a2d32]" : "text-[#9a9da1]"}`}>{phase.label}</div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[.08em] text-[#a0a3a7]">{phase.system}</div>
      </div>;
    })}
  </div></div>;
}
