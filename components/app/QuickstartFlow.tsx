"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, Check, CheckCircle, Clock, Copy, GitBranch, Key,
  PaperPlaneTilt, Plugs, Pulse, ShieldCheck, SpinnerGap, UserCircle, Wrench,
} from "@phosphor-icons/react";
import { ResumeEndpointManager } from "@/components/app/ResumeEndpointManager";

type SetupPath = "langgraph" | "temporal" | "mcp" | "custom";
type RequestState = { id: string; status: string; resumeStatus: string; url?: string };
type Stage = 0 | 1 | 2 | 3;

export interface QuickstartInitialState {
  email: string;
  workspaceName: string;
  project: { id: string; name: string };
  canAdmin: boolean;
  canOperate: boolean;
  hasActiveKey: boolean;
  hasDeadRun: boolean;
  hasRuntimeRun: boolean;
  availableDeadRunId?: string;
  latestRequest?: RequestState;
  endpointConfigured: boolean;
  channels: { email: boolean; slack: boolean };
}

const STAGES = ["Understand", "Prove handoff", "Add boundary", "All set"] as const;

const PATHS: Record<SetupPath, { label: string; detail: string; icon: typeof GitBranch; filename: string; code: string }> = {
  langgraph: {
    label: "LangGraph", detail: "Use the thread and checkpoint you already persist.", icon: GitBranch, filename: "graph.ts",
    code: `import { ReviveClient, createLangGraphInterruptHandler } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});
const detect = createLangGraphInterruptHandler(revive);

// Add this at your existing interrupt or terminal error boundary.
await detect({
  runId: config.configurable.thread_id,
  checkpointId: state.checkpointId,
  generation: state.generation,
  failureMessage: error.message,
  trace: state.redactedTrace,
});`,
  },
  temporal: {
    label: "Temporal", detail: "Keep Temporal durability and report from the failure signal.", icon: Clock, filename: "workflow.ts",
    code: `import { ReviveClient, createTemporalFailureSignal } from "revive-sdk";
import { workflowInfo } from "@temporalio/workflow";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});
const detect = createTemporalFailureSignal(revive);

await detect({
  runId: workflowInfo().workflowId,
  checkpointId: "current-activity",
  generation: 1,
  failureMessage: failure.message,
  trace: failure.redactedTrace,
});`,
  },
  mcp: {
    label: "MCP", detail: "Report at the elicitation boundary using the tool-call ID.", icon: Plugs, filename: "mcp-host.ts",
    code: `import { ReviveClient, createMcpElicitationHandler } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});
const detect = createMcpElicitationHandler(revive);

await detect({
  runId,
  checkpointId: toolCall.id,
  failureMessage: "User input required",
  trace: redactedTrace,
});`,
  },
  custom: {
    label: "Custom API", detail: "One authenticated request from any language or runtime.", icon: Wrench, filename: "request.sh",
    code: `curl https://revivelabs.app/api/v1/dead-runs \\
  -H "Authorization: Bearer $REVIVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "runId": "your-stable-run-id",
    "checkpointId": "saved-checkpoint",
    "generation": 1,
    "idempotencyKey": "stable-failure-id",
    "runtime": "custom",
    "failureMessage": "Missing required customer input"
  }'`,
  },
};

export function QuickstartFlow({ initial }: { initial: QuickstartInitialState }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>(0);
  const [active, setActive] = useState<SetupPath>("langgraph");
  const [keyReady, setKeyReady] = useState(initial.hasActiveKey);
  const [revealedKey, setRevealedKey] = useState("");
  const [deadRunId, setDeadRunId] = useState(initial.availableDeadRunId || "");
  const [request, setRequest] = useState<RequestState | undefined>(initial.latestRequest);
  const [boundaryConfirmed, setBoundaryConfirmed] = useState(initial.hasRuntimeRun);
  const [busy, setBusy] = useState<"key" | "run" | "request" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setKeyReady((value) => initial.hasActiveKey || value);
    if (initial.availableDeadRunId && !deadRunId) setDeadRunId(initial.availableDeadRunId);
    if (initial.latestRequest && initial.latestRequest.status !== request?.status) setRequest(initial.latestRequest);
    if (initial.hasRuntimeRun) setBoundaryConfirmed(true);
  }, [initial, deadRunId, request?.status]);

  const deadRunReady = Boolean(deadRunId);
  const requestReady = request?.status === "pending" || request?.status === "completed";
  const responseReady = request?.status === "completed";
  const handoffProgress = [keyReady, deadRunReady, requestReady, responseReady].filter(Boolean).length;
  const unlockedStage = boundaryConfirmed && responseReady ? 3 : responseReady ? 2 : stage > 0 ? 1 : 0;
  const option = PATHS[active];
  const setupBundle = useMemo(() => [
    active === "custom" ? "# No SDK required for the custom API" : "npm install revive-sdk",
    `REVIVE_API_KEY=${revealedKey || "rv_live_your_scoped_key"}`,
  ].join("\n"), [active, revealedKey]);

  const nextAction = !keyReady ? "key" : !deadRunReady ? "run" : !requestReady ? "request" : !responseReady ? "respond" : "complete";

  function go(next: Stage) {
    setError("");
    setStage(next);
  }

  async function copy(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setError("Clipboard access was blocked. Select and copy the text manually.");
    }
  }

  async function createKey() {
    setBusy("key"); setError("");
    try {
      const response = await fetch("/api/workspaces/api-keys", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Quickstart SDK", projectId: initial.project.id, role: "operator", expiresInDays: 90 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the setup key");
      setRevealedKey(body.key); setKeyReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the setup key");
    } finally { setBusy(null); }
  }

  async function createTestRun() {
    setBusy("run"); setError("");
    try {
      const response = await fetch("/api/workspaces/onboarding/test-run", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runtime: active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the test blocker");
      setDeadRunId(body.run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the test blocker");
    } finally { setBusy(null); }
  }

  async function sendRequest() {
    if (!deadRunId) return;
    setBusy("request"); setError("");
    try {
      const response = await fetch(`/api/workspaces/dead-runs/${encodeURIComponent(deadRunId)}/revive`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient: { email: initial.email, subjectId: initial.email, role: "workspace owner" },
          title: "Enter the billing contact email",
          description: "The safe test agent is paused before continuing its billing workflow. Enter the address it should use for billing questions.",
          fields: [{
            key: "billing_contact_email", type: "email", label: "Billing contact email",
            description: "The address the safe test agent should use for future billing questions.",
            placeholder: "billing@company.com", required: true,
          }],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the secure request");
      setRequest({ id: body.request.id, status: body.request.status, resumeStatus: body.request.resumeStatus, url: body.request.url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the secure request");
    } finally { setBusy(null); }
  }

  return <div className="relative min-h-[calc(100dvh-63px)] overflow-hidden bg-[#f4f5f1]">
    <StageRail stage={stage} unlocked={unlockedStage} onSelect={go} />
    <AnimatePresence mode="wait" initial={false}>
      {stage === 0 && <StageFrame key="understand" reduceMotion={Boolean(reduceMotion)}>
        <OverviewStage onContinue={() => go(1)} reduceMotion={Boolean(reduceMotion)} />
      </StageFrame>}

      {stage === 1 && <StageFrame key="handoff" reduceMotion={Boolean(reduceMotion)}>
        <HandoffStage
          initial={initial} progress={handoffProgress} nextAction={nextAction} request={request}
          revealedKey={revealedKey} busy={busy} error={error} copied={copied}
          createKey={createKey} createTestRun={createTestRun} sendRequest={sendRequest}
          copy={copy} refresh={() => router.refresh()} onContinue={() => go(2)}
        />
      </StageFrame>}

      {stage === 2 && <StageFrame key="integration" reduceMotion={Boolean(reduceMotion)}>
        <IntegrationStage
          active={active} onActive={setActive} option={option} setupBundle={setupBundle}
          copied={copied} copy={copy} error={error}
          onContinue={() => { setBoundaryConfirmed(true); go(3); }}
        />
      </StageFrame>}

      {stage === 3 && <StageFrame key="complete" reduceMotion={Boolean(reduceMotion)}>
        <CompleteStage initial={initial} request={request} onBack={() => go(2)} />
      </StageFrame>}
    </AnimatePresence>
  </div>;
}

function StageFrame({ children, reduceMotion }: { children: ReactNode; reduceMotion: boolean }) {
  return <motion.div initial={reduceMotion ? false : { opacity: 0, x: "8%" }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: "-6%" }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.div>;
}

function StageRail({ stage, unlocked, onSelect }: { stage: Stage; unlocked: number; onSelect: (stage: Stage) => void }) {
  return <nav aria-label="Quickstart progress" className="border-b border-[#151922] bg-[#eef0eb] px-4 sm:px-6 lg:px-8"><ol className="mx-auto grid max-w-[1220px] grid-cols-4">{STAGES.map((label, index) => {
    const available = index <= unlocked || index <= stage;
    const active = index === stage;
    return <li key={label}><button disabled={!available} onClick={() => onSelect(index as Stage)} className={`relative flex h-12 w-full items-center gap-2 border-l border-[#cbd0d5] px-2 text-left last:border-r sm:px-4 ${active ? "bg-[#edf0ff] text-[#2e49c8]" : available ? "text-[#596273] hover:bg-[#f7f8f5]" : "cursor-not-allowed text-[#a1a8b1]"}`}>{active && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#4967f2]" />}<span className="font-mono text-[8px]">{String(index + 1).padStart(2, "0")}</span><span className="hidden text-[10px] font-semibold sm:block">{label}</span>{index < stage && <Check size={11} weight="bold" className="ml-auto text-[#18724e]" />}</button></li>;
  })}</ol></nav>;
}

function OverviewStage({ onContinue, reduceMotion }: { onContinue: () => void; reduceMotion: boolean }) {
  const workflow = [
    { icon: Pulse, title: "Run blocks", body: "The runtime reports a durable checkpoint." },
    { icon: UserCircle, title: "Person resolves", body: "Revive asks for one scoped human action." },
    { icon: ShieldCheck, title: "State is fenced", body: "Identity, generation, and side effects are checked." },
    { icon: GitBranch, title: "Same run resumes", body: "A worker continues from the saved checkpoint." },
  ];
  return <section className="flex min-h-[calc(100dvh-112px)] flex-col">
    <div className="mx-auto grid w-full max-w-[1220px] flex-1 gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:py-16">
      <div>
        <p className="font-mono text-[9px] font-semibold tracking-[.12em] text-[#4967f2]">HOW REVIVE RECOVERS WORK</p>
        <h1 className="mt-5 max-w-[540px] text-[clamp(38px,5vw,68px)] font-semibold leading-[.96] tracking-[-.06em]">A blocked agent run does not need to become a lost run.</h1>
        <p className="mt-6 max-w-[520px] text-[14px] leading-7 text-[#626c79]">Revive preserves the execution, gets the missing human decision, and returns control to the checkpoint that was already paid for.</p>
        <button onClick={onContinue} className="mt-8 inline-flex h-11 items-center gap-3 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Prove it with safe data <ArrowRight size={13} /></button>
      </div>

      <div className="border border-[#151922] bg-[#fbfcf8] shadow-[8px_8px_0_#d9ddd6]">
        <div className="flex items-center justify-between border-b border-[#151922] bg-[#edf0ff] px-5 py-4"><span className="text-[11px] font-semibold">One recoverable interruption</span><span className="font-mono text-[8px] text-[#596273]">RUN + CHECKPOINT + GENERATION</span></div>
        <div className="relative grid gap-px bg-[#cfd4da] sm:grid-cols-4">
          {!reduceMotion && <motion.div aria-hidden className="absolute left-0 top-0 z-10 hidden h-[3px] w-1/4 origin-left bg-[#4967f2] sm:block" animate={{ x: ["0%", "300%", "300%"], scaleX: [0.2, 1, 1] }} transition={{ duration: 3.6, repeat: Infinity, ease: [0.16, 1, 0.3, 1], times: [0, .78, 1] }} />}
          {workflow.map((item, index) => { const Icon = item.icon; return <motion.div key={item.title} className="min-h-[190px] bg-[#fbfcf8] p-5" animate={reduceMotion ? undefined : { backgroundColor: ["#fbfcf8", "#edf0ff", "#fbfcf8"] }} transition={{ duration: 3.6, repeat: Infinity, delay: index * .7, times: [0, .22, .45] }}><span className="flex h-9 w-9 items-center justify-center border border-[#151922] bg-white text-[#2e49c8]"><Icon size={17} /></span><div className="mt-7 font-mono text-[8px] text-[#8a929d]">{String(index + 1).padStart(2, "0")}</div><h2 className="mt-2 text-[13px] font-semibold">{item.title}</h2><p className="mt-2 text-[9.5px] leading-5 text-[#687180]">{item.body}</p></motion.div>; })}
        </div>
        <div className="grid border-t border-[#151922] sm:grid-cols-3"><ImpactDatum value="1" label="original run preserved" /><ImpactDatum value="0" label="duplicate writes allowed" /><ImpactDatum value="0" label="steps restarted from scratch" /></div>
      </div>
    </div>
  </section>;
}

function HandoffStage({
  initial, progress, nextAction, request, revealedKey, busy, error, copied,
  createKey, createTestRun, sendRequest, copy, refresh, onContinue,
}: {
  initial: QuickstartInitialState; progress: number; nextAction: string; request?: RequestState;
  revealedKey: string; busy: "key" | "run" | "request" | null; error: string; copied: string;
  createKey: () => Promise<void>; createTestRun: () => Promise<void>; sendRequest: () => Promise<void>;
  copy: (value: string, id: string) => Promise<void>; refresh: () => void; onContinue: () => void;
}) {
  return <section className="min-h-[calc(100dvh-112px)]">
    <div className="mx-auto grid min-h-[calc(100dvh-112px)] max-w-[1220px] lg:grid-cols-[.76fr_1.24fr]">
      <div className="border-x border-[#151922] bg-[#eef0eb] p-6 sm:p-8 lg:border-r-0">
        <div className="flex items-center justify-between"><span className="font-mono text-[9px] tracking-[.12em] text-[#4967f2]">SAFE FIRST RECOVERY</span><span className="font-mono text-[10px] text-[#596273]">{progress}/4</span></div>
        <div className="mt-4 h-1.5 bg-[#d8dcd5]"><motion.div className="h-full origin-left bg-[#4967f2]" animate={{ scaleX: progress / 4 }} /></div>
        <h1 className="mt-8 max-w-[420px] text-[clamp(32px,4vw,50px)] font-semibold leading-[1] tracking-[-.055em]">Prove the complete human handoff.</h1>
        <p className="mt-5 max-w-[420px] text-[12px] leading-6 text-[#687180]">This test uses a synthetic billing question, your own account, and no customer data. It creates real control-plane records you can inspect.</p>
        <ol className="mt-9 border-t border-[#cbd0ca]">
          <SetupStep title="Scoped operator key" detail="Project-bound and expires in 90 days" done={progress >= 1} active={nextAction === "key"} />
          <SetupStep title="Safe blocked run" detail="Synthetic checkpoint with measured token cost" done={progress >= 2} active={nextAction === "run"} />
          <SetupStep title="Recipient-bound request" detail={`Sent only to ${initial.email}`} done={progress >= 3} active={nextAction === "request"} />
          <SetupStep title="Validated response" detail="Recorded against the same run generation" done={progress >= 4} active={nextAction === "respond"} />
        </ol>
      </div>

      <div className="border-x border-b border-[#151922] bg-[#fbfcf8] p-6 sm:p-8 lg:border-b-0">
        <div className="flex items-center gap-3 border-b border-[#d8dde3] pb-5"><span className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><UserCircle size={18} /></span><div><div className="text-[11px] font-semibold">{initial.workspaceName}</div><div className="mt-0.5 font-mono text-[8px] text-[#8a929d]">{initial.project.name.toUpperCase()}</div></div><CheckCircle size={16} weight="fill" className="ml-auto text-[#18724e]" /></div>
        {error && <div role="alert" className="mt-5 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[10.5px] leading-5 text-[#8b3e38]">{error}</div>}

        {nextAction === "key" && <ActionBlock title="Create the detector credential" body="The key is scoped to this project with the operator role. Revive shows it once and stores only its hash.">{initial.canAdmin ? <PrimaryButton onClick={createKey} busy={busy === "key"} label="Create scoped key" icon={Key} /> : <p className="text-[10.5px] text-[#8b5f1d]">Ask a workspace admin to create an operator key, then refresh this page.</p>}</ActionBlock>}
        {nextAction === "run" && <ActionBlock title="Create one safe blocked run" body="This records a clearly labeled onboarding event with a saved checkpoint, generation, and estimated wasted-token cost.">{initial.canOperate ? <PrimaryButton onClick={createTestRun} busy={busy === "run"} label="Create safe blocker" icon={Pulse} /> : <p className="text-[10.5px] text-[#8b5f1d]">An operator or admin must run this test.</p>}</ActionBlock>}
        {nextAction === "request" && <ActionBlock title="Send the human request to yourself" body={initial.channels.email ? "Revive will create the secure request and deliver it by email." : "Email is not configured, so Revive will show the secure one-use link here."}><PrimaryButton onClick={sendRequest} busy={busy === "request"} label="Send request to me" icon={PaperPlaneTilt} /></ActionBlock>}
        {nextAction === "respond" && request && <ActionBlock title="Answer as the intended recipient" body="Open the one-use page, enter a safe billing contact email, submit it, then refresh this status."><div className="flex flex-wrap gap-2">{request.url && <a href={request.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white">Open secure request <ArrowRight size={12} /></a>}<Link href={`/app/requests/${request.id}`} className="inline-flex h-10 items-center border border-[#c8cdd2] bg-white px-4 text-[10.5px] font-semibold">Inspect record</Link><button onClick={refresh} className="h-10 px-3 text-[10px] font-semibold text-[#2e49c8]">Refresh status</button></div></ActionBlock>}
        {nextAction === "complete" && <ActionBlock title="The handoff is proven" body="The blocker, intended recipient, structured response, run, checkpoint, and generation now share one auditable record."><div className="grid gap-px border border-[#151922] bg-[#cfd4da] sm:grid-cols-3"><ProofDatum label="Recipient" value="matched" /><ProofDatum label="Run binding" value="preserved" /><ProofDatum label="Input" value="validated" /></div><button onClick={onContinue} className="mt-6 inline-flex h-11 items-center gap-3 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white hover:bg-[#2b3340] active:translate-y-px">Add my failure boundary <ArrowRight size={13} /></button></ActionBlock>}

        {revealedKey && <div className="mt-5 border border-[#4967f2] bg-[#edf0ff] p-4"><div className="text-[10.5px] font-semibold text-[#2e49c8]">Copy this key now</div><p className="mt-1 text-[9.5px] leading-5 text-[#596273]">It stays available only during this browser session.</p><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto border border-[#c7cff9] bg-white px-3 py-2 font-mono text-[9px]">{revealedKey}</code><CopyButton onClick={() => copy(revealedKey, "key")} copied={copied === "key"} /></div></div>}
      </div>
    </div>
  </section>;
}

function IntegrationStage({ active, onActive, option, setupBundle, copied, copy, error, onContinue }: {
  active: SetupPath; onActive: (path: SetupPath) => void; option: (typeof PATHS)[SetupPath];
  setupBundle: string; copied: string; copy: (value: string, id: string) => Promise<void>; error: string; onContinue: () => void;
}) {
  return <section className="min-h-[calc(100dvh-112px)]">
    <div className="mx-auto min-h-[calc(100dvh-112px)] max-w-[1220px] border-x border-[#151922] bg-[#fbfcf8]">
      <header className="grid border-b border-[#151922] lg:grid-cols-[.72fr_1.28fr]"><div className="p-6 sm:p-8"><p className="font-mono text-[9px] tracking-[.12em] text-[#4967f2]">YOUR REAL RUNTIME</p><h1 className="mt-4 max-w-[480px] text-[clamp(32px,4vw,52px)] font-semibold leading-[1] tracking-[-.055em]">One package. One existing failure boundary.</h1><p className="mt-4 max-w-[500px] text-[12px] leading-6 text-[#687180]">Keep your current runtime and checkpointer. Revive needs only the stable run, checkpoint, and generation identifiers.</p></div><div className="grid grid-cols-2 border-t border-[#151922] sm:grid-cols-4 lg:border-l lg:border-t-0">{(Object.keys(PATHS) as SetupPath[]).map((key) => { const item = PATHS[key]; const Icon = item.icon; const selected = active === key; return <button key={key} onClick={() => onActive(key)} className={`border-b border-r border-[#e1e2de] p-4 text-left transition last:border-r-0 sm:border-b-0 ${selected ? "bg-[#edf0ff] text-[#2e49c8]" : "bg-[#fbfcf8] text-[#596273] hover:bg-[#f7f8f5]"}`}><Icon size={15} /><span className="mt-3 block text-[10.5px] font-semibold">{item.label}</span><span className="mt-1 block text-[8.5px] leading-4">{item.detail}</span></button>; })}</div></header>
      {error && <div role="alert" className="border-b border-[#c2413a] bg-[#fcedeb] px-6 py-3 text-[10.5px] text-[#8b3e38]">{error}</div>}
      <div className="grid lg:grid-cols-[.72fr_1.28fr]"><div className="border-b border-[#151922] p-6 lg:border-b-0 lg:border-r"><h2 className="text-[13px] font-semibold">Install and authenticate</h2><pre className="mt-4 overflow-x-auto border border-[#d8dde3] bg-[#f7f8f5] p-4 font-mono text-[10px] leading-5">{setupBundle}</pre><button onClick={() => copy(setupBundle, "setup")} className="mt-3 inline-flex h-9 items-center gap-2 border border-[#c8cdd2] bg-white px-3 text-[9.5px] font-semibold"><Copy size={11} />{copied === "setup" ? "Copied" : "Copy setup"}</button><div className="mt-8 border-l-[3px] border-[#4967f2] pl-4"><h3 className="text-[11px] font-semibold">Detector first</h3><p className="mt-2 text-[9.5px] leading-5 text-[#687180]">The detector records redacted terminal failures. It does not contact users until your team chooses to revive a run.</p></div></div><div className="min-w-0 bg-[#f7f8f5]"><div className="flex items-center justify-between border-b border-[#d8dde3] px-5 py-3"><span className="font-mono text-[8.5px] text-[#7b8491]">ADD AT THE FAILURE BOUNDARY: {option.filename}</span><CopyButton onClick={() => copy(option.code, "code")} copied={copied === "code"} /></div><pre className="min-h-[330px] overflow-x-auto p-5 font-mono text-[10px] leading-5 text-[#252b35] sm:p-6"><code>{option.code}</code></pre></div></div>
      <div className="flex flex-col gap-4 border-t border-[#151922] bg-[#eef0eb] px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-[620px] text-[10.5px] leading-5 text-[#596273]">After this handler reports one real failure, it appears in Dead-run detector with the runtime and checkpoint you supplied.</p><button onClick={onContinue} className="inline-flex h-11 shrink-0 items-center justify-center gap-3 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white hover:bg-[#2b3340] active:translate-y-px">I added this boundary <ArrowRight size={13} /></button></div>
    </div>
  </section>;
}

function CompleteStage({ initial, request, onBack }: { initial: QuickstartInitialState; request?: RequestState; onBack: () => void }) {
  return <section className="flex min-h-[calc(100dvh-112px)] flex-col items-center justify-center px-5 py-12 sm:px-8">
    <div className="w-full max-w-[900px] border border-[#151922] bg-[#fbfcf8] shadow-[10px_10px_0_#d9ddd6]">
      <div className="grid md:grid-cols-[.72fr_1.28fr]"><div className="flex min-h-[300px] items-center justify-center border-b border-[#151922] bg-[#edf0ff] md:border-b-0 md:border-r"><motion.div initial={{ scale: .82, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 18 }} className="flex h-36 w-36 items-center justify-center border border-[#151922] bg-[#fbfcf8] text-[#18724e] shadow-[7px_7px_0_#cbd4f5]"><CheckCircle size={78} weight="thin" /></motion.div></div><div className="p-7 sm:p-10"><p className="font-mono text-[9px] tracking-[.12em] text-[#18724e]">QUICKSTART COMPLETE</p><h1 className="mt-5 text-[clamp(36px,5vw,58px)] font-semibold leading-[.98] tracking-[-.06em]">You are set to recover the first real blocker.</h1><p className="mt-5 max-w-[560px] text-[12px] leading-6 text-[#687180]">The workspace has a scoped credential, the human handoff is proven, and your runtime boundary has the code it needs to report a dead run.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/app/detector" className="inline-flex h-11 items-center gap-3 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white hover:bg-[#2b3340]">Open detector <ArrowRight size={13} /></Link><button onClick={onBack} className="inline-flex h-11 items-center border border-[#c8cdd2] bg-white px-4 text-[10.5px] font-semibold">Review integration</button></div></div></div>
      <div className="grid border-t border-[#151922] sm:grid-cols-4"><Readiness title="Scoped key" done detail="Operator role" /><Readiness title="Human handoff" done detail="Safe test passed" /><Readiness title="Failure boundary" done detail="Integration confirmed" /><Readiness title="Automatic resume" done={initial.endpointConfigured && request?.resumeStatus === "acknowledged"} detail={initial.endpointConfigured ? "Endpoint configured" : "Optional next step"} /></div>
      {!initial.endpointConfigured && <details className="group border-t border-[#151922]"><summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4"><span><span className="text-[11px] font-semibold">Turn on automatic resume</span><span className="ml-2 text-[9.5px] text-[#7b8491]">optional after detection works</span></span><span className="font-mono text-[10px] transition group-open:rotate-45">+</span></summary><div className="border-t border-[#e1e2de] p-6"><ResumeEndpointManager /></div></details>}
    </div>
  </section>;
}

function ImpactDatum({ value, label }: { value: string; label: string }) {
  return <div className="border-b border-[#151922] px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="text-[28px] font-semibold tracking-[-.05em] text-[#2e49c8]">{value}</div><div className="mt-1 text-[9px] leading-4 text-[#687180]">{label}</div></div>;
}

function SetupStep({ title, detail, done, active }: { title: string; detail: string; done: boolean; active: boolean }) {
  return <li className={`grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-[#d8dcd5] py-4 ${active ? "text-[#151922]" : "text-[#687180]"}`}><span className={`flex h-5 w-5 items-center justify-center border ${done ? "border-[#18724e] bg-[#edf8f2] text-[#18724e]" : active ? "border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]" : "border-[#b7bdc4]"}`}>{done ? <Check size={11} weight="bold" /> : active ? <ArrowRight size={10} /> : null}</span><span><span className="block text-[10.5px] font-semibold">{title}</span><span className="mt-1 block text-[8.5px] leading-4">{detail}</span></span>{active && !done ? <span className="font-mono text-[8px] text-[#4967f2]">NEXT</span> : null}</li>;
}

function ActionBlock({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return <div className="py-8"><h2 className="text-[clamp(26px,3vw,38px)] font-semibold leading-[1.04] tracking-[-.045em]">{title}</h2><p className="mt-4 max-w-[590px] text-[11px] leading-6 text-[#687180]">{body}</p><div className="mt-6">{children}</div></div>;
}

function PrimaryButton({ onClick, busy, label, icon: Icon }: { onClick: () => void | Promise<void>; busy: boolean; label: string; icon: ComponentType<{ size?: number }> }) {
  return <button onClick={() => void onClick()} disabled={busy} className="inline-flex h-11 items-center gap-2 border border-[#151922] bg-[#151922] px-5 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-55">{busy ? <SpinnerGap size={13} className="animate-spin" /> : <Icon size={13} />}{busy ? "Working..." : label}</button>;
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return <button onClick={() => void onClick()} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[#cbd1d8] bg-white px-2.5 text-[9px] font-semibold">{copied ? <Check size={11} className="text-[#18724e]" /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button>;
}

function ProofDatum({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#f4f5f1] p-4"><div className="font-mono text-[8px] text-[#8a929d]">{label}</div><div className="mt-2 text-[11px] font-semibold text-[#18724e]">{value}</div></div>;
}

function Readiness({ title, done, detail }: { title: string; done: boolean; detail: string }) {
  return <div className="border-b border-[#e1e2de] p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center border ${done ? "border-[#18724e] bg-[#edf8f2] text-[#18724e]" : "border-[#c8cdd2] text-[#8a929d]"}`}>{done ? <Check size={11} weight="bold" /> : null}</span><span className="text-[10px] font-semibold">{title}</span></div><p className="mt-2 font-mono text-[8px] text-[#7b8491]">{detail}</p></div>;
}
