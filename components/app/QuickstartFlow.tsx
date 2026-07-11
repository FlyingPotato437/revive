"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock, Copy, GitBranch, Plugs } from "@phosphor-icons/react";
import { useState } from "react";

type SetupPath = "langgraph" | "temporal" | "mcp";
const PATHS: Record<SetupPath, { label: string; title: string; description: string; detail: string; icon: typeof GitBranch; filename: string; code: string }> = {
  langgraph: {
    label: "LangGraph", title: "Point interrupt handler at Revive",
    description: "Record dead runs where LangGraph already interrupts or terminates. No workflow protocol change.",
    detail: "Free detector classifies blocker and loss. Call reviveDeadRun only when you want Revive to reach a person.",
    icon: GitBranch, filename: "graph.ts",
    code: `import {
  ReviveClient,
  createLangGraphInterruptHandler,
} from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

const detect = createLangGraphInterruptHandler(revive);

// Existing interrupt/error boundary
await detect({
  runId: state.runId,
  checkpointId: state.checkpointId,
  generation: state.generation,
  failureMessage: error.message,
  trace: state.trace,
  inputTokens: usage.input,
  outputTokens: usage.output,
  estimatedCostUsd: usage.costUsd,
});`,
  },
  temporal: {
    label: "Temporal", title: "Record failure from existing workflow signal",
    description: "Keep Temporal durability. Revive measures which terminal runs needed a customer or operator.",
    detail: "When resolved, signed continuation returns run, checkpoint, generation, response and resume-or-replan decision.",
    icon: Clock, filename: "workflow.ts",
    code: `import {
  ReviveClient,
  createTemporalFailureSignal,
} from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

export const reportDeadRun =
  createTemporalFailureSignal(revive);

await reportDeadRun({
  runId: workflowInfo().workflowId,
  checkpointId: "sync-customer-books",
  generation: 4,
  failureMessage: failure.message,
  trace: failure.trace,
});`,
  },
  mcp: {
    label: "MCP", title: "Send failed elicitation to detector",
    description: "Use MCP elicitation boundary as detection point while existing gateway keeps tool writes replay-safe.",
    detail: "Detector and secure resolution remain separate: observe free, resolve only selected recoverable blockers.",
    icon: Plugs, filename: "mcp-host.ts",
    code: `import {
  ReviveClient,
  createMcpElicitationHandler,
} from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

const reportElicitationFailure =
  createMcpElicitationHandler(revive);

await reportElicitationFailure({
  runId,
  checkpointId: toolCall.id,
  failureMessage: "User input required",
  trace: redactedTrace,
});`,
  },
};

const NEXT_STEPS = [
  { href: "/app/api-keys", label: "Create API key", detail: "Scoped credential for detector traffic." },
  { href: "/app/detector", label: "Observe one dead run", detail: "See blocker, wasted tokens and smallest ask." },
  { href: "/app/requests", label: "Resolve selected blockers", detail: "Paid action links start only when needed." },
];

export function QuickstartFlow() {
  const [active, setActive] = useState<SetupPath>("langgraph"); const [copied, setCopied] = useState(false);
  const option = PATHS[active]; const Icon = option.icon;
  async function copy() { try { await navigator.clipboard.writeText(option.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }
  return <section className="instrument-panel overflow-hidden border-[#151922]">
    <div className="grid border-b border-[#151922] lg:grid-cols-[.82fr_1.18fr]"><div className="p-5 sm:p-6"><span className="font-mono text-[8px] tracking-[.12em] text-[#4967f2]">INTERRUPT ADAPTERS</span><h2 className="mt-3 max-w-[380px] text-[22px] font-semibold leading-tight tracking-[-.04em]">Watch runs where they already stop.</h2><p className="mt-2 max-w-[420px] text-[11px] leading-5 text-[#687180]">No new protocol. One handler inside current error or interrupt boundary.</p></div><div className="grid border-t border-[#e1e2de] sm:grid-cols-3 lg:border-l lg:border-t-0">{(Object.keys(PATHS) as SetupPath[]).map((key) => { const item = PATHS[key]; const PathIcon = item.icon; const selected = key === active; return <button key={key} onClick={() => { setActive(key); setCopied(false); }} className={`border-b border-[#e1e2de] p-4 text-left last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${selected ? "bg-[#edf0ff]" : "bg-[#fbfcf8] hover:bg-[#f7f8f5]"}`}><span className={`flex h-7 w-7 items-center justify-center border ${selected ? "border-[#4967f2] text-[#2e49c8]" : "border-[#cbd1d8] text-[#687180]"}`}><PathIcon size={14} /></span><span className="mt-3 block text-[10.5px] font-semibold">{item.label}</span><span className="mt-1 block text-[9.5px] text-[#687180]">one-line hook</span></button>; })}</div></div>
    <div className="grid lg:grid-cols-[.76fr_1.24fr]"><div className="border-b border-[#151922] p-5 sm:p-6 lg:border-b-0 lg:border-r"><span className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><Icon size={18} /></span><h3 className="mt-5 text-[20px] font-semibold tracking-[-.035em]">{option.title}</h3><p className="mt-3 text-[11px] leading-5 text-[#596273]">{option.description}</p><p className="mt-4 border-l-[3px] border-[#4967f2] pl-3 text-[10px] leading-5 text-[#687180]">{option.detail}</p></div><div className="min-w-0 bg-[#f7f8f5]"><div className="flex items-center justify-between border-b border-[#d8dde3] px-5 py-3"><span className="font-mono text-[8.5px] text-[#7b8491]">{option.filename}</span><button onClick={() => void copy()} className="inline-flex h-7 items-center gap-1.5 border border-[#cbd1d8] bg-white px-2.5 text-[9px] font-semibold">{copied ? <Check size={11} className="text-[#18724e]" /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button></div><pre className="min-h-[330px] overflow-x-auto p-5 font-mono text-[10px] leading-5 text-[#252b35] sm:p-6"><code>{option.code}</code></pre></div></div>
    <div className="border-t border-[#151922] bg-[#fbfcf8]"><div className="border-b border-[#e1e2de] px-5 py-3 text-[11px] font-semibold">Path to first recovered run</div><div className="grid sm:grid-cols-3">{NEXT_STEPS.map((step, index) => <Link key={step.href} href={step.href} className={`group flex min-h-[88px] flex-col justify-between border-b border-[#e1e2de] px-5 py-4 last:border-b-0 sm:border-b-0 ${index ? "sm:border-l" : ""}`}><span><span className="text-[10.5px] font-semibold">{step.label}</span><span className="mt-1 block text-[9.5px] leading-4 text-[#687180]">{step.detail}</span></span><ArrowRight size={12} className="mt-3 text-[#4967f2] transition group-hover:translate-x-0.5" /></Link>)}</div></div>
  </section>;
}
