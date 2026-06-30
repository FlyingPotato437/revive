"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useReviveClient } from "@/lib/useReviveClient";
import { RUN_SCRIPT, DEFAULT_FAILURE_STEP } from "@/lib/steps";
import { LaneColumn } from "@/components/Lane";
import { ClassifierCard, ReconsentCard } from "@/components/Panels";
import { EventLog } from "@/components/EventLog";
import { Outcome } from "@/components/Outcome";

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
    <div className="mx-auto max-w-[1380px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cobalt">
            Recovery lab
            <span className="rounded-[5px] bg-cobalt-soft px-1.5 py-0.5 text-[9px] tracking-[0.08em]">sandbox</span>
          </div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-ink sm:text-[32px]">
            Inspect a credential failure end to end
          </h1>
          <p className="mt-2 max-w-[720px] text-[14px] leading-6 text-ink-muted">
            Fault-inject an Entra grant failure, park the affected run, rotate its credential lease, and resume the same logical execution with an idempotent action key.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span className="h-2 w-2 rounded-full bg-ok shadow-[0_0_0_4px_rgba(20,128,96,.10)]" />
          Event store online
          <span className="text-hairline">·</span>
          <span className="font-mono">policy v0.2</span>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Recovery state">
        <Metric label="Recovery case" value={caseStatus.replaceAll("_", " ")} detail={revive?.recoveryCase?.id ?? "No open case"} tone={awaiting ? "warn" : revive?.recoveryCase?.status === "recovered" ? "ok" : "neutral"} />
        <Metric label="Credential lease" value={`Generation ${leaseGeneration}`} detail={revive?.token.leaseId ?? "Created on run"} tone={leaseGeneration > 1 ? "cobalt" : "neutral"} />
        <Metric label="Action ledger" value={`${committedActions} committed`} detail={revive?.actions[0]?.idempotencyKey ?? "Exactly-once guard ready"} tone={committedActions ? "ok" : "neutral"} />
        <Metric label="Run continuity" value={revive?.metrics.resumes ? `${revive.metrics.resumes} resume` : "Checkpoint ready"} detail="Process-independent logical run" tone={revive?.metrics.resumes ? "cobalt" : "neutral"} />
      </section>

      <section className="mt-4 rounded-card border border-hairline bg-white p-4 shadow-seat sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end">
          <div className="min-w-[230px] xl:border-r xl:border-hairline xl:pr-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Scenario</div>
            <div className="mt-1.5 text-[15px] font-semibold text-ink">Nightly executive briefing</div>
            <div className="mt-1 text-[12px] text-ink-muted">Microsoft Graph · unattended · 8 steps</div>
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

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
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

      <div className="mt-4 h-[310px] overflow-hidden rounded-card">
        <EventLog logs={state.logs} />
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 text-[11px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <span>Sandbox flow: detect → bind run → checkpoint → reauthorize → rotate lease → replay once</span>
        <span className="font-mono">No provider credentials are stored by this demo</span>
      </div>
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "neutral" | "cobalt" | "ok" | "warn" }) {
  const dot = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "cobalt" ? "bg-cobalt" : "bg-ink-faint";
  return (
    <div className="min-w-0 rounded-[11px] border border-hairline bg-white px-4 py-3 shadow-seat">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</div>
      <div className="mt-2 truncate text-[14px] font-semibold capitalize text-ink">{value}</div>
      <div className="mt-0.5 truncate font-mono text-[10px] text-ink-faint">{detail}</div>
    </div>
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
