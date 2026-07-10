"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useReviveClient } from "@/lib/useReviveClient";
import { RUN_SCRIPT, DEFAULT_FAILURE_STEP } from "@/lib/steps";
import { LaneColumn } from "@/components/Lane";
import { ClassifierCard, ReconsentCard } from "@/components/Panels";
import { EventLog } from "@/components/EventLog";
import { Outcome } from "@/components/Outcome";
import { PageHeader, SummaryStrip, StatusBadge } from "@/components/app/ConsolePrimitives";
import { RecoveryTrace } from "@/components/app/RecoveryTrace";

const DEATH_CODES = [
  { code: "AADSTS700082", label: "Refresh token inactive" },
  { code: "AADSTS50173", label: "Grant revoked after credential change" },
  { code: "AADSTS50078", label: "MFA session expired" },
  { code: "AADSTS65001", label: "Consent not granted" },
];

export default function RecoveryLab() {
  const { state, start, reset, approve } = useReviveClient();
  const [failureStep, setFailureStep] = useState(DEFAULT_FAILURE_STEP);
  const [deathCode, setDeathCode] = useState("AADSTS700082");
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  const running = !!state.sessionId && !state.done;
  const revive = state.revive;
  const baseline = state.baseline;
  const awaiting = revive?.status === "awaiting_reconsent" && revive.ticket?.status === "open";

  async function onApprove() {
    setApproving(true);
    setApprovalError("");
    try {
      await approve();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Approval failed");
    } finally {
      setTimeout(() => setApproving(false), 450);
    }
  }

  function onRun() {
    setApproving(false);
    setApprovalError("");
    start(failureStep, deathCode);
  }

  const caseStatus = revive?.recoveryCase?.status ?? (running ? "monitoring" : "ready");
  const leaseGeneration = revive?.token.generation ?? 1;
  const committedActions = revive?.actions.filter((action) => action.state === "committed").length ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Playground · local sandbox" title="Drill a credential failure before production does" description="Break a sandbox grant on purpose and verify the complete recovery path. Classification, checkpointing, one-time reauthorization, and fenced resume are recorded as a recovery case." actions={<><StatusBadge tone="ok"><span className="h-1.5 w-1.5 rounded-full bg-current" />local sandbox store</StatusBadge><span className="font-mono text-[9px] text-[#95989d]">policy v0.2</span></>} />

      <div className="mt-5"><SummaryStrip items={[
        { label: "Recovery case", value: caseStatus.replaceAll("_", " "), detail: revive?.recoveryCase?.id ?? "No open case", tone: awaiting ? "warn" : revive?.recoveryCase?.status === "recovered" ? "ok" : undefined },
        { label: "Credential lease", value: `Generation ${leaseGeneration}`, detail: revive?.token.leaseId ?? "Created on run", tone: leaseGeneration > 1 ? "cobalt" : undefined },
        { label: "Action ledger", value: `${committedActions} committed`, detail: revive?.actions[0]?.idempotencyKey ?? "Duplicate-prevention guard ready", tone: committedActions ? "ok" : undefined },
        { label: "Run continuity", value: revive?.metrics.resumes ? `${revive.metrics.resumes} resume` : "Checkpoint ready", detail: "Process-independent logical run", tone: revive?.metrics.resumes ? "cobalt" : undefined },
      ]} /></div>

      <section className="instrument-panel evidence-plate mt-5 rounded-[8px] p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end">
          <div className="min-w-[230px] xl:border-r xl:border-hairline xl:pr-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Scenario</div>
            <div className="mt-1.5 text-[15px] font-semibold text-ink">Nightly executive briefing</div>
            <div className="mt-1 text-[12px] text-ink-muted">Microsoft Graph / unattended / 8 steps</div>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField label="Failure point" value={failureStep} onChange={(value) => setFailureStep(Number(value))} disabled={running}>
              {RUN_SCRIPT.map((step, index) => index === 0 ? null : <option key={step.id} value={index}>{index + 1}. {step.label}</option>)}
            </SelectField>
            <SelectField label="Provider signal" value={deathCode} onChange={setDeathCode} disabled={running}>
              {DEATH_CODES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.label}</option>)}
            </SelectField>
          </div>

          <div className="flex items-center gap-2 xl:pl-2">
            {state.sessionId && <button onClick={reset} className="h-10 rounded-[8px] border border-hairline bg-white px-4 text-[12px] font-medium text-ink-muted transition hover:bg-paper-inset">Reset</button>}
            <button onClick={onRun} disabled={state.starting || running} className="inline-flex h-10 min-w-[154px] items-center justify-center gap-2 rounded-[8px] bg-ink px-5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#272d39] disabled:cursor-not-allowed disabled:opacity-45">
              {running ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Running scenario</> : "Start fault injection"}
            </button>
          </div>
        </div>
      </section>

      <ProcessStepper revive={revive} awaiting={awaiting} done={state.done} running={running} />

      <section className="instrument-panel evidence-plate mt-5 overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e3e4e0] px-5"><div><span className="text-[11px] font-semibold text-[#26292e]">Recovery continuity spine</span><span className="ml-2 font-mono text-[8.5px] text-[#96999e]">identity → run → action</span></div><StatusBadge tone={revive?.status === "completed" ? "ok" : awaiting ? "warn" : revive ? "cobalt" : "neutral"}>{revive?.status?.replaceAll("_", " ") ?? "not started"}</StatusBadge></div><RecoveryTrace run={revive} /></section>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LaneColumn run={baseline} eyebrow="Control" title="Unprotected workflow" accent="baseline">
          {baseline?.status === "dead" && <div className="relative z-10 mx-3 mb-3 rounded-[9px] border border-fail/15 bg-fail-soft px-4 py-3 text-[12px] leading-5 text-ink-muted">The workflow exhausted retries against a dead grant. Remaining steps were abandoned and now require an operator restart.</div>}
        </LaneColumn>

        <LaneColumn run={revive} eyebrow="Protected" title="Revive recovery path" accent="revive">
          <AnimatePresence>{revive?.classifier && <ClassifierCard c={revive.classifier} />}</AnimatePresence>
          {awaiting && revive?.ticket && <ReconsentCard ticket={revive.ticket} approving={approving} onApprove={onApprove} />}
          {approvalError && <div className="mx-3 mb-3 rounded-[8px] bg-fail-soft px-3 py-2 text-[12px] text-fail">{approvalError}</div>}
        </LaneColumn>
      </div>

      <AnimatePresence>{state.done && baseline && revive && <div className="mt-4"><Outcome baseline={baseline} revive={revive} /></div>}</AnimatePresence>

      <div className="mt-5 h-[310px] overflow-hidden rounded-[10px]">
        <EventLog logs={state.logs} />
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 text-[11px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <span>Sandbox flow: detect → bind run → checkpoint → reauthorize → rotate lease → replay once</span>
        <span className="font-mono">No provider credentials are stored by this demo</span>
      </div>
    </div>
  );
}

// Always-visible answer to "what is happening right now?": four plain phases
// plus one live narration sentence driven by the protected run's status.
function ProcessStepper({ revive, awaiting, done, running }: { revive: { status: string; currentStep?: number; steps?: unknown[] } | null; awaiting: boolean; done: boolean; running: boolean }) {
  const status = revive?.status ?? "idle";
  // Active phase index into `phases`; -1 = not started, 4 = all done.
  const phase = !revive || status === "idle" ? -1
    : awaiting ? 2
    : status === "refreshing" || status === "stalled" ? 1
    : status === "resuming" ? 3
    : status === "completed" ? 4
    : running ? 0 : 0;
  const phases = ["Agent works", "Credential dies", "Human reconnects", "Run resumes"];
  const narration = phase === -1
    ? "Press Start: we break a login mid-run on purpose, then show how the run survives."
    : phase === 0
      ? `The agent is doing its normal work (step ${(revive?.currentStep ?? 0) + 1} of ${revive?.steps?.length ?? 8}). The failure is coming.`
      : phase === 1
        ? "The login just died mid-task. The unprotected lane starts retrying blind; Revive parks its run safely."
        : phase === 2
          ? "Revive is asking the account owner to reconnect. Click 'Authorize and resume' in the right lane to act as them."
          : phase === 3
            ? "Same run continuing from its checkpoint. Anything that already completed is not repeated."
            : done
              ? "Done. The unprotected lane died and abandoned its work; the protected lane finished — nothing ran twice."
              : "Recovered: the protected run resumed exactly where it stopped.";
  return (
    <section className="instrument-panel evidence-plate mt-5 rounded-[8px] px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ol className="flex flex-wrap items-center gap-1.5">
          {phases.map((label, index) => {
            const stepNumber = index + 1;
            const stateOfStep = phase > index ? "done" : phase === index ? "active" : "todo";
            return (
              <li key={label} className="flex items-center gap-1.5">
                <span className={`flex h-6 items-center gap-1.5 border px-2 font-mono text-[9px] tracking-[.04em] ${
                  stateOfStep === "done" ? "border-[#cbe3d7] bg-[#edf8f2] text-[#18724e]"
                  : stateOfStep === "active" ? "border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"
                  : "border-[#dfe0dc] bg-[#f7f8f4] text-[#8a929d]"}`}>
                  <span className="font-semibold">{stateOfStep === "done" ? "✓" : stepNumber}</span> {label}
                </span>
                {index < phases.length - 1 && <span className="h-px w-3 bg-[#d5d9d0]" />}
              </li>
            );
          })}
        </ol>
        <p className="text-[11.5px] leading-5 text-[#596273] lg:max-w-[46%] lg:text-right" aria-live="polite">{narration}</p>
      </div>
    </section>
  );
}

function SelectField({ label, value, onChange, disabled, children }: { label: string; value: string | number; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-10 w-full appearance-none rounded-[8px] border border-hairline bg-paper-inset px-3 text-[12px] text-ink outline-none transition focus:border-cobalt focus:bg-white focus:ring-2 focus:ring-cobalt/10 disabled:opacity-55">
        {children}
      </select>
    </label>
  );
}
