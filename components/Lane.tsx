"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { RunState, RunStep, RunStatus } from "@/lib/types";
import { Dot, MethodTag, Pill, StatusNode, TokenChip } from "./atoms";

type Accent = "baseline" | "revive";

const STATUS_META: Record<RunStatus, { label: string; tone: "neutral" | "cobalt" | "ok" | "fail" | "warn"; pulse?: boolean }> = {
  idle: { label: "idle", tone: "neutral" },
  running: { label: "running", tone: "cobalt", pulse: true },
  refreshing: { label: "refreshing", tone: "warn", pulse: true },
  awaiting_reconsent: { label: "awaiting user", tone: "warn", pulse: true },
  stalled: { label: "retrying", tone: "fail", pulse: true },
  resuming: { label: "resuming", tone: "cobalt", pulse: true },
  completed: { label: "recovered", tone: "ok" },
  dead: { label: "abandoned", tone: "fail" },
};

export function LaneColumn({ run, eyebrow, title, accent, children }: { run: RunState | null; eyebrow: string; title: string; accent: Accent; children?: React.ReactNode }) {
  const meta = run ? STATUS_META[run.status] : STATUS_META.idle;
  const steps = run?.steps ?? [];
  const deathIndex = steps.findIndex((step) => step.status === "failed" || step.status === "checkpointed");

  return (
    <motion.section layout className={`overflow-hidden rounded-card border bg-white shadow-seat ${accent === "revive" && run?.status === "completed" ? "border-ok/30" : "border-hairline"}`}>
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${accent === "revive" ? "text-cobalt" : "text-ink-faint"}`}>{eyebrow}</div>
          <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        </div>
        <Pill tone={meta.tone}><Dot tone={meta.tone} pulse={meta.pulse} />{meta.label}</Pill>
      </header>

      <div className="flex min-h-12 items-center gap-3 border-b border-hairline bg-paper-baseline px-5 py-2.5">
        {run ? <TokenChip fingerprint={run.token.fingerprint} generation={run.token.generation} rotated={run.token.generation > 1} /> : <span className="text-[11px] text-ink-faint">Credential lease appears when the run starts</span>}
        <span className="ml-auto font-mono text-[10px] text-ink-faint">{run ? `${run.metrics.completedSteps}/${run.steps.length}` : "0/8"}</span>
      </div>

      <ol className="p-2">
        {steps.map((step, index) => (
          <StepRow key={step.id} step={step} index={index} accent={accent} active={run?.currentStep === index} afterDeath={deathIndex >= 0 && index >= deathIndex} terminal={run?.status === "dead"} />
        ))}
        {!steps.length && Array.from({ length: 8 }).map((_, index) => <li key={index} className="mx-2 flex h-[52px] items-center gap-3 border-b border-hairline last:border-0"><span className="h-3.5 w-3.5 rounded-full border border-hairline" /><span className="h-2.5 rounded bg-paper-inset" style={{ width: `${42 + (index % 3) * 9}%` }} /></li>)}
      </ol>
      {children}
    </motion.section>
  );
}

function StepRow({ step, index, accent, active, afterDeath, terminal }: { step: RunStep; index: number; accent: Accent; active: boolean; afterDeath: boolean; terminal: boolean }) {
  const faded = accent === "baseline" && terminal && afterDeath && step.status === "pending";
  const tinted = active || step.status === "resuming" || step.status === "checkpointed";
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: faded ? 0.35 : 1 }} transition={{ delay: index * 0.025 }} className={`relative flex min-h-[54px] items-center gap-3 rounded-[8px] px-3 py-2 transition ${tinted ? "bg-cobalt-soft/60" : "hover:bg-paper-baseline"}`}>
      <div className="relative self-stretch pt-2">
        <StatusNode status={step.status} />
        {index < 7 && <span className={`absolute left-[10.5px] top-[29px] bottom-[-13px] w-px ${step.status === "ok" ? accent === "revive" ? "bg-cobalt/40" : "bg-ok/35" : "bg-hairline"}`} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-medium text-ink">{step.label}</span>
          {(step.attempts ?? 0) > 1 && <span className="rounded bg-fail-soft px-1.5 py-0.5 font-mono text-[9px] text-fail">attempt {step.attempts}</span>}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2"><MethodTag method={step.method} /><span className="truncate font-mono text-[10.5px] text-ink-faint">{step.path}</span></div>
        <AnimatePresence>{step.note && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-1 text-[10.5px] text-cobalt">{step.note}</motion.div>}</AnimatePresence>
      </div>
    </motion.li>
  );
}
