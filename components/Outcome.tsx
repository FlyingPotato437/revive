"use client";

import { motion } from "framer-motion";
import type { RunState } from "@/lib/types";

export function Outcome({ baseline, revive }: { baseline: RunState; revive: RunState }) {
  const recovered = revive.metrics.recoveredMs ? `${(revive.metrics.recoveredMs / 1000).toFixed(1)}s` : "—";
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-card border border-hairline bg-white shadow-seat">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">Recovery result</div><div className="mt-1 text-[13px] font-medium text-ink">One credential failure, two execution outcomes</div></div>
        <span className="rounded-[6px] bg-ok-soft px-2 py-1 text-[10px] font-semibold text-ok">Invariant passed</span>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="p-5 md:border-r md:border-hairline">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-ink-muted">Unprotected workflow</span><span className="rounded-[5px] bg-fail-soft px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-fail">abandoned</span></div>
          <div className="mt-4 flex items-baseline gap-2"><span className="text-[30px] font-semibold tracking-[-0.04em] text-ink">{baseline.metrics.completedSteps}/{baseline.steps.length}</span><span className="text-[11px] text-ink-faint">steps committed</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Fact label="Stale retries" value={String(baseline.metrics.staleTokenReuses)} /><Fact label="Operator action" value="Restart run" /></div>
        </div>
        <div className="bg-ok-soft/25 p-5">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-ink">Protected workflow</span><span className="rounded-[5px] bg-ok-soft px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-ok">recovered</span></div>
          <div className="mt-4 flex items-baseline gap-2"><span className="text-[30px] font-semibold tracking-[-0.04em] text-ink">{revive.metrics.completedSteps}/{revive.steps.length}</span><span className="text-[11px] text-ink-faint">steps committed</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2"><Fact label="Time to resume" value={recovered} /><Fact label="Lease generation" value={`gen ${revive.token.generation}`} /><Fact label="Duplicate effects" value="0" /></div>
        </div>
      </div>
    </motion.section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[7px] border border-hairline bg-white/75 px-3 py-2"><div className="text-[9px] uppercase tracking-[0.08em] text-ink-faint">{label}</div><div className="mt-1 font-mono text-[10.5px] font-medium text-ink">{value}</div></div>;
}
