"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Check, CheckCircle, Clock, Copy, GitBranch, Key,
  PaperPlaneTilt, Plugs, Pulse, SpinnerGap, UserCircle, Wrench,
} from "@phosphor-icons/react";
import { ResumeEndpointManager } from "@/components/app/ResumeEndpointManager";

type SetupPath = "langgraph" | "temporal" | "mcp" | "custom";
type RequestState = { id: string; status: string; resumeStatus: string; url?: string };

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

const PATHS: Record<SetupPath, { label: string; detail: string; icon: typeof GitBranch; filename: string; code: string }> = {
  langgraph: {
    label: "LangGraph", detail: "Use the thread and checkpoint you already persist.", icon: GitBranch, filename: "graph.ts",
    code: `import { ReviveClient, createLangGraphInterruptHandler } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});
const detect = createLangGraphInterruptHandler(revive);

// Add this to your existing interrupt or terminal error boundary.
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
    code: `curl https://revivelabs.app/v1/dead-runs \\
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
  const [active, setActive] = useState<SetupPath>("langgraph");
  const [keyReady, setKeyReady] = useState(initial.hasActiveKey);
  const [revealedKey, setRevealedKey] = useState("");
  const [deadRunId, setDeadRunId] = useState(initial.availableDeadRunId || "");
  const [deadRunReady, setDeadRunReady] = useState(initial.hasDeadRun);
  const [request, setRequest] = useState<RequestState | undefined>(initial.latestRequest);
  const [busy, setBusy] = useState<"key" | "run" | "request" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setKeyReady(initial.hasActiveKey || keyReady);
    setDeadRunReady(initial.hasDeadRun || deadRunReady);
    if (initial.availableDeadRunId && !deadRunId) setDeadRunId(initial.availableDeadRunId);
    if (initial.latestRequest && initial.latestRequest.status !== request?.status) setRequest(initial.latestRequest);
  }, [initial, keyReady, deadRunReady, deadRunId, request?.status]);

  const requestReady = request?.status === "pending" || request?.status === "completed";
  const responseReady = request?.status === "completed";
  const progress = [keyReady, deadRunReady, requestReady, responseReady].filter(Boolean).length;
  const option = PATHS[active];
  const setupBundle = useMemo(() => [
    active === "custom" ? "# No SDK required for the custom API" : "npm install revive-sdk",
    `REVIVE_API_KEY=${revealedKey || "rv_live_your_key"}`,
  ].join("\n"), [active, revealedKey]);

  async function copy(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1400);
    } catch { setError("Clipboard access was blocked. Select and copy the text manually."); }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the setup key"); }
    finally { setBusy(null); }
  }

  async function createTestRun() {
    setBusy("run"); setError("");
    try {
      const response = await fetch("/api/workspaces/onboarding/test-run", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runtime: active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the test blocker");
      setDeadRunId(body.run.id); setDeadRunReady(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the test blocker"); }
    finally { setBusy(null); }
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
          description: "The example agent is paused before continuing its billing workflow. Enter the email address it should use for billing questions.",
          fields: [{
            key: "billing_contact_email",
            type: "email",
            label: "Billing contact email",
            description: "The address the example agent should use for future billing questions.",
            placeholder: "billing@company.com",
            required: true,
          }],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the secure request");
      setRequest({ id: body.request.id, status: body.request.status, resumeStatus: body.request.resumeStatus, url: body.request.url });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the secure request"); }
    finally { setBusy(null); }
  }

  const nextAction = !keyReady
    ? "key"
    : requestReady
      ? request?.status === "pending" ? "respond" : "complete"
      : !deadRunId ? "run" : "request";

  return <div className="space-y-5">
    <section className="instrument-panel overflow-hidden border-[#151922]">
      <div className="grid border-b border-[#151922] lg:grid-cols-[.72fr_1.28fr]">
        <div className="bg-[#eef0eb] p-5 sm:p-6">
          <div className="flex items-center justify-between"><span className="font-mono text-[8px] tracking-[.12em] text-[#4967f2]">FIRST RECOVERY</span><span className="font-mono text-[9px] text-[#596273]">{progress}/4</span></div>
          <div className="mt-4 h-1.5 bg-[#d8dcd5]"><div className="h-full bg-[#4967f2] transition-all" style={{ width: `${progress * 25}%` }} /></div>
          <h2 className="mt-6 max-w-[330px] text-[25px] font-semibold leading-[1.05] tracking-[-.045em]">Prove the entire human handoff with safe test data.</h2>
          <p className="mt-3 max-w-[370px] text-[11px] leading-5 text-[#687180]">Your workspace, project, recipient, test run ID, checkpoint, generation, and request fields all receive useful defaults.</p>
          <ol className="mt-7 border-t border-[#cbd0ca]">
            <SetupStep number="01" title="Create a scoped key" detail="One click · operator role · 90 days" done={keyReady} active={nextAction === "key"} />
            <SetupStep number="02" title="Detect a blocker" detail="Synthetic run first; real runtime next" done={deadRunReady} active={nextAction === "run"} />
            <SetupStep number="03" title="Send the human request" detail={`Defaults to ${initial.email}`} done={requestReady} active={nextAction === "request"} />
            <SetupStep number="04" title="Complete the secure response" detail="Validate the exact recipient and run" done={responseReady} active={nextAction === "respond"} />
          </ol>
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-3 border-b border-[#e1e2de] pb-5"><span className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><UserCircle size={18} /></span><div><div className="text-[11px] font-semibold">{initial.workspaceName}</div><div className="mt-0.5 font-mono text-[8px] text-[#8a929d]">{initial.project.name} · CREATED AUTOMATICALLY</div></div><CheckCircle size={16} weight="fill" className="ml-auto text-[#18724e]" /></div>

          {error && <div role="alert" className="mt-5 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[10.5px] leading-5 text-[#8b3e38]">{error}</div>}

          {nextAction === "key" && <ActionBlock eyebrow="Next · API key" title="Create the detector credential" body="Revive will bind it to the Recovery sandbox with the operator role. You can rotate or revoke it later.">
            {initial.canAdmin ? <PrimaryButton onClick={createKey} busy={busy === "key"} label="Create setup key" icon={Key} /> : <p className="text-[10.5px] text-[#8b5f1d]">Ask a workspace admin to create an operator key, then refresh this page.</p>}
          </ActionBlock>}

          {nextAction === "run" && <ActionBlock eyebrow="Next · detector" title="Create a safe test blocker" body="This writes one clearly labeled onboarding event. It uses no customer data and contacts nobody.">
            {initial.canOperate ? <PrimaryButton onClick={createTestRun} busy={busy === "run"} label="Create test blocker" icon={Pulse} /> : <p className="text-[10.5px] text-[#8b5f1d]">An operator or admin must run this test.</p>}
          </ActionBlock>}

          {nextAction === "request" && <ActionBlock eyebrow="Next · human handoff" title="Send the secure request to yourself" body={`Revive will create the recipient, subject ID, run ID, checkpoint, generation, and response field. ${initial.channels.email ? "A real email will also be sent." : "Email is not configured, so use the secure link shown here."}`}>
            <PrimaryButton onClick={sendRequest} busy={busy === "request"} label="Send secure request to me" icon={PaperPlaneTilt} />
          </ActionBlock>}

          {nextAction === "respond" && request && <ActionBlock eyebrow="Next · respond" title="Complete the request as the recipient" body="Open the one-use page, enter the billing contact email the example agent asks for, and send the response. Return here afterward and refresh the status.">
            <div className="flex flex-wrap gap-2">{request.url && <a href={request.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white">Open secure request <ArrowRight size={12} /></a>}<Link href={`/app/requests/${request.id}`} className="inline-flex h-10 items-center border border-[#c8cdd2] bg-white px-4 text-[10.5px] font-semibold">Open request record</Link><button onClick={() => router.refresh()} className="h-10 px-3 text-[10px] font-semibold text-[#2e49c8]">Refresh status</button></div>
          </ActionBlock>}

          {nextAction === "complete" && <ActionBlock eyebrow="Test passed" title="The human-request loop works" body="Revive detected the blocker, bound a secure response to the correct run, and validated the recipient input. Now connect the real runtime below.">
            <div className="flex flex-wrap gap-2"><a href="#runtime" className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white">Connect my runtime <ArrowRight size={12} /></a><Link href="/app/detector" className="inline-flex h-10 items-center border border-[#c8cdd2] bg-white px-4 text-[10.5px] font-semibold">View detector</Link></div>
          </ActionBlock>}

          {revealedKey && <div className="mt-6 border border-[#4967f2] bg-[#edf0ff] p-4"><div className="text-[10.5px] font-semibold text-[#2e49c8]">Copy this key now</div><p className="mt-1 text-[9.5px] text-[#596273]">Revive stores only its hash. The setup bundle below includes it until you leave this page.</p><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto border border-[#c7cff9] bg-white px-3 py-2 font-mono text-[9px]">{revealedKey}</code><CopyButton onClick={() => copy(revealedKey, "key")} copied={copied === "key"} /></div></div>}
        </div>
      </div>
    </section>

    <section id="runtime" className="instrument-panel scroll-mt-24 overflow-hidden border-[#151922]">
      <div className="grid border-b border-[#151922] lg:grid-cols-[.7fr_1.3fr]"><div className="p-5 sm:p-6"><span className="font-mono text-[8px] tracking-[.12em] text-[#4967f2]">REAL RUNTIME</span><h2 className="mt-3 text-[22px] font-semibold tracking-[-.04em]">One package. One existing failure boundary.</h2><p className="mt-2 max-w-[430px] text-[10.5px] leading-5 text-[#687180]">Revive generates idempotency keys. Your runtime supplies its stable run and checkpoint identifiers so continuation returns to the right place.</p></div><div className="grid grid-cols-2 border-t border-[#e1e2de] sm:grid-cols-4 lg:border-l lg:border-t-0">{(Object.keys(PATHS) as SetupPath[]).map((key) => { const item = PATHS[key]; const Icon = item.icon; const selected = active === key; return <button key={key} onClick={() => setActive(key)} className={`border-b border-r border-[#e1e2de] p-4 text-left transition last:border-r-0 sm:border-b-0 ${selected ? "bg-[#edf0ff] text-[#2e49c8]" : "bg-[#fbfcf8] text-[#596273] hover:bg-[#f7f8f5]"}`}><Icon size={15} /><span className="mt-3 block text-[10.5px] font-semibold">{item.label}</span><span className="mt-1 block text-[8.5px] leading-4">{item.detail}</span></button>; })}</div></div>
      <div className="grid lg:grid-cols-[.7fr_1.3fr]"><div className="border-b border-[#151922] p-5 sm:p-6 lg:border-b-0 lg:border-r"><div className="font-mono text-[8.5px] text-[#7b8491]">1 · INSTALL + ENV</div><pre className="mt-3 overflow-x-auto border border-[#d8dde3] bg-[#f7f8f5] p-4 font-mono text-[10px] leading-5">{setupBundle}</pre><button onClick={() => copy(setupBundle, "setup")} className="mt-3 inline-flex h-8 items-center gap-2 border border-[#c8cdd2] bg-white px-3 text-[9.5px] font-semibold"><Copy size={11} />{copied === "setup" ? "Copied" : "Copy setup"}</button><p className="mt-5 border-l-[3px] border-[#4967f2] pl-3 text-[9.5px] leading-5 text-[#687180]">Start with detector-only mode. It observes redacted failures and contacts no users until your team explicitly revives a run.</p></div><div className="min-w-0 bg-[#f7f8f5]"><div className="flex items-center justify-between border-b border-[#d8dde3] px-5 py-3"><span className="font-mono text-[8.5px] text-[#7b8491]">2 · {option.filename}</span><CopyButton onClick={() => copy(option.code, "code")} copied={copied === "code"} /></div><pre className="min-h-[310px] overflow-x-auto p-5 font-mono text-[10px] leading-5 text-[#252b35] sm:p-6"><code>{option.code}</code></pre></div></div>
    </section>

    <section className="instrument-panel overflow-hidden">
      <div className="border-b border-[#151922] px-5 py-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[13px] font-semibold">Production readiness</h2><p className="mt-1 text-[9.5px] text-[#687180]">Detector value comes first. These checks turn on reliable automatic continuation.</p></div><span className="font-mono text-[8px] text-[#7b8491]">SAFE DEFAULT POLICY IS ALREADY ACTIVE</span></div></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4"><Readiness title="Real runtime event" done={initial.hasRuntimeRun} detail={initial.hasRuntimeRun ? "Received" : "Add the generated handler"} /><Readiness title="Delivery channel" done={initial.channels.email || initial.channels.slack} detail={[initial.channels.email && "email", initial.channels.slack && "Slack"].filter(Boolean).join(" + ") || "Configure email or Slack"} /><Readiness title="Resume endpoint" done={initial.endpointConfigured} detail={initial.endpointConfigured ? "Registered" : "Add when ready to resume"} /><Readiness title="Continuation ack" done={request?.resumeStatus === "acknowledged"} detail={request?.resumeStatus === "acknowledged" ? "Verified" : "Complete a request after callback setup"} /></div>
    </section>

    <details className="group instrument-panel overflow-hidden"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4"><span><span className="text-[11px] font-semibold">Turn on automatic resume</span><span className="ml-2 text-[9.5px] text-[#7b8491]">advanced only after detector works</span></span><span className="font-mono text-[10px] transition group-open:rotate-45">+</span></summary><div className="border-t border-[#e1e2de] p-5"><ResumeEndpointManager /><div className="mt-5 flex flex-wrap gap-4 border-t border-[#e1e2de] pt-4 text-[9.5px]"><a href="https://github.com/FlyingPotato437/revive/blob/main/sidecar/examples/resume_receiver_express.js" className="font-semibold text-[#2e49c8] hover:underline">Express receiver template</a><a href="https://github.com/FlyingPotato437/revive/blob/main/sidecar/examples/resume_receiver_fastapi.py" className="font-semibold text-[#2e49c8] hover:underline">FastAPI receiver template</a><Link href="/app/settings" className="font-semibold text-[#596273] hover:text-[#151922]">Policy and callback settings</Link></div></div></details>
  </div>;
}

function SetupStep({ number, title, detail, done, active }: { number: string; title: string; detail: string; done: boolean; active: boolean }) {
  return <li className={`grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-[#d8dcd5] py-3 ${active ? "text-[#151922]" : "text-[#687180]"}`}><span className="font-mono text-[8px]">{number}</span><span><span className="block text-[10.5px] font-semibold">{title}</span><span className="mt-0.5 block text-[8.5px]">{detail}</span></span>{done ? <Check size={13} weight="bold" className="text-[#18724e]" /> : active ? <ArrowRight size={12} className="text-[#4967f2]" /> : <span className="h-2 w-2 border border-[#b7bdc4]" />}</li>;
}

function ActionBlock({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return <div className="py-7"><span className="font-mono text-[8px] tracking-[.1em] text-[#4967f2]">{eyebrow.toUpperCase()}</span><h3 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-[560px] text-[11px] leading-5 text-[#687180]">{body}</p><div className="mt-5">{children}</div></div>;
}

function PrimaryButton({ onClick, busy, label, icon: Icon }: { onClick: () => void; busy: boolean; label: string; icon: typeof Key }) {
  return <button onClick={() => void onClick()} disabled={busy} className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-55">{busy ? <SpinnerGap size={13} className="animate-spin" /> : <Icon size={13} />}{busy ? "Working…" : label}</button>;
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return <button onClick={() => void onClick()} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[#cbd1d8] bg-white px-2.5 text-[9px] font-semibold">{copied ? <Check size={11} className="text-[#18724e]" /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button>;
}

function Readiness({ title, done, detail }: { title: string; done: boolean; detail: string }) {
  return <div className="border-b border-r border-[#e1e2de] p-4 last:border-r-0 sm:last:border-b-0"><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center border ${done ? "border-[#18724e] bg-[#edf8f2] text-[#18724e]" : "border-[#c8cdd2] text-[#8a929d]"}`}>{done ? <Check size={11} weight="bold" /> : <span className="h-1.5 w-1.5 bg-[#b7bdc4]" />}</span><span className="text-[10px] font-semibold">{title}</span></div><p className="mt-2 font-mono text-[8px] text-[#7b8491]">{detail}</p></div>;
}
