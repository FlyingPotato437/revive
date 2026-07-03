import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import benchmarkReport from "@/benchmarks/results/revivebench-local.json";
import liveCertification from "@/benchmarks/results/revive-certification-live.json";
import { EvidenceReveal } from "@/components/marketing/EvidenceReveal";

export const metadata: Metadata = {
  title: "ReviveBench | Recovery correctness report",
  description: "Methodology, raw runs, and limitations for Revive's executable credential recovery benchmark.",
};

type ObservationValue = string | number | boolean | string[] | null | undefined;
type RunRecord = {
  executionId: string;
  passed: boolean;
  durationMs: number;
  failure: string | null;
  observed: Record<string, ObservationValue> | null;
};
type CaseResult = {
  id: string;
  title: string;
  iterations: number;
  passed: number;
  failed: number;
  p50Ms: number;
  p95Ms: number;
  failures: string[];
  runs: RunRecord[];
  exampleRun: RunRecord | null;
};
type Report = {
  generatedAt: string;
  sourceCommit: string | null;
  sourceTreeDirty?: boolean | null;
  environment: { python: string; platform: string; fixture: string };
  methodology: {
    iterationsPerCase: number;
    scope: string;
    assertionModel: string;
    providerTransport: string;
    restartPersistence: string;
    exclusions: string[];
  };
  summary: { executions: number; passed: number; failed: number };
  cases: CaseResult[];
};

type LiveCertification = {
  generatedAt: string;
  sourceCommit: string;
  passed: boolean;
  durationMs: number;
  runtime: { name: string; checkpointer: string; threadId: string };
  credentialSystem: { name: string; integrationId: string; connectionHash: string };
  provider: { name: string; operation: string };
  failureInjection: { credential: string; sideEffect: string };
  assertions: Record<string, boolean>;
  observed: { mutationCalls: number; remoteDraftCount: number; finalGeneration: number };
  cleanup: { attempted: boolean; succeeded: boolean };
  claimsExcluded: string[];
};

const caseDetails: Record<string, { failure: string; acceptance: string; evidence: string }> = {
  "same-run-resume": {
    failure: "A protected call rejects the access token, then the refresh grant is rejected after two workflow steps have completed.",
    acceptance: "The run parks at the failing step and completes under the original run ID after reauthorization.",
    evidence: "Checkpoint identity, completed step count, and the advanced lease generation are asserted in every execution.",
  },
  "worker-restart": {
    failure: "The original worker is removed after the checkpoint is written and before the recovery reply arrives.",
    acceptance: "A replacement worker opens the same file-backed store and resumes the parked run.",
    evidence: "The first SQLite connection is closed before a new store and engine instance perform the resume.",
  },
  "identity-binding": {
    failure: "The recovery reply identifies Bob while the failed connection is bound to Alice.",
    acceptance: "The reply is rejected before the one-time recovery rendezvous is consumed.",
    evidence: "Expected and attempted provider subjects are recorded with a true mismatchRejected observation.",
  },
  "generation-fencing": {
    failure: "A worker holding generation 1 wakes after recovery has advanced the credential lease to generation 2.",
    acceptance: "Generation 1 is rejected before the old worker executes another step.",
    evidence: "Both generations and the stale-worker rejection are captured in the run record.",
  },
  "side-effect-reconcile": {
    failure: "An action is already marked started, but the worker cannot know whether the remote mutation committed.",
    acceptance: "The reconciliation callback confirms the action and the mutation function is not called again.",
    evidence: "Each run records zero mutation calls and a completed action ledger entry.",
  },
};

const traceLabels: Record<string, string> = {
  ok: "step committed",
  auth: "access rejected",
  classify: "grant classified",
  checkpoint: "checkpoint written",
  rendezvous: "recovery opened",
  rotate: "generation advanced",
  resume: "same run resumed",
  reconcile: "action reconciled",
  dedupe: "duplicate skipped",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function displayValue(value: ObservationValue) {
  if (Array.isArray(value)) return value.join(" > ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  return String(value);
}

export default function BenchmarkWhitepaperPage() {
  const report = benchmarkReport as Report;
  const live = liveCertification as LiveCertification;
  const allRuns = report.cases.flatMap((item) => item.runs);
  const representative = report.cases.find((item) => item.id === "same-run-resume")?.exampleRun;
  const representativeTags = Array.isArray(representative?.observed?.eventTags)
    ? representative.observed.eventTags
    : [];

  return (
    <article className="min-h-[100dvh] bg-[#f4f5f1] text-[#151922]">
      <header className="border-b border-[#151922]">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_320px] lg:items-end lg:py-24">
          <EvidenceReveal>
            <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#4967f2]">REVIVEBENCH TECHNICAL REPORT</p>
            <h1 className="mt-6 max-w-[820px] text-[clamp(42px,6.2vw,78px)] font-semibold leading-[0.94] tracking-[-0.065em]">
              Recovery correctness at the failure boundary.
            </h1>
            <p className="mt-7 max-w-[650px] text-[15px] leading-7 text-[#5f6876]">
              A reproducible local study of five invariants between credentials and durable execution.
            </p>
          </EvidenceReveal>

          <EvidenceReveal delay={0.08} className="border border-[#151922] bg-[#fbfcf8] p-5 shadow-[7px_7px_0_#d9ddd6]">
            <div className="flex items-center justify-between gap-4 border-b border-[#ccd1d6] pb-4">
              <span className="font-mono text-[9px] text-[#737d8a]">REPORT RECORD</span>
              <span className={`font-mono text-[9px] font-semibold ${report.summary.failed === 0 ? "text-[#18724e]" : "text-[#a23d34]"}`}>
                {report.summary.failed === 0 ? "ALL ASSERTIONS PASSED" : `${report.summary.failed} FAILURES`}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-4 gap-y-3 text-[10px] leading-4">
              <dt className="font-mono text-[#8a929d]">Generated</dt><dd>{formatDate(report.generatedAt)}</dd>
              <dt className="font-mono text-[#8a929d]">Commit</dt><dd className="font-mono">{report.sourceCommit ?? "unavailable"}</dd>
              <dt className="font-mono text-[#8a929d]">Source</dt><dd>{report.sourceTreeDirty ? "Uncommitted changes present" : "Clean tree"}</dd>
              <dt className="font-mono text-[#8a929d]">Scope</dt><dd>Local suite plus one live certification</dd>
            </dl>
          </EvidenceReveal>
        </div>
      </header>

      <section aria-label="Report summary" className="border-b border-[#151922] bg-[#e9ecff]">
        <div className="mx-auto grid max-w-[1240px] grid-cols-2 sm:grid-cols-4">
          <SummaryDatum label="Recorded executions" value={report.summary.executions} />
          <SummaryDatum label="Scenarios" value={report.cases.length} />
          <SummaryDatum label="Passed" value={report.summary.passed} />
          <SummaryDatum label="Failed" value={report.summary.failed} />
        </div>
      </section>

      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-20 lg:py-24">
        <aside className="hidden lg:block">
          <nav aria-label="Report contents" className="sticky top-24 border-l border-[#aeb5bd] pl-5">
            <p className="mb-5 font-mono text-[9px] text-[#8a929d]">CONTENTS</p>
            {[
              ["abstract", "Abstract"],
              ["live-certification", "Live certification"],
              ["apparatus", "System under test"],
              ["method", "Method"],
              ["results", "Results"],
              ["observed-run", "Observed run"],
              ["limits", "Limitations"],
              ["reproduce", "Reproduce"],
            ].map(([href, label]) => (
              <a key={href} href={`#${href}`} className="block py-1.5 text-[10.5px] text-[#687180] transition-colors hover:text-[#2e49c8]">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <ReportSection id="abstract" title="Abstract">
            <p className="max-w-[760px] text-[17px] leading-8 text-[#3f4855]">
              Revive coordinates recovery after an OAuth grant can no longer be refreshed. The benchmark asks a narrower question than a product demo: does the recovery engine preserve the original run, enforce account identity, fence stale workers, and prevent an ambiguous mutation from being repeated?
            </p>
            <div className="mt-8 border-l-[4px] border-[#4967f2] bg-[#e9ecff] px-5 py-4 text-[12px] leading-6 text-[#414b5b]">
              Result: all {report.summary.executions} local executions satisfied their assertions. A separate live certification below covers one Nango, Microsoft Graph, and LangGraph path.
            </div>
          </ReportSection>

          <ReportSection id="live-certification" title="Live provider certification">
            <div className="border border-[#151922] bg-[#fbfcf8] shadow-[7px_7px_0_#d9ddd6]">
              <div className="flex flex-col gap-3 border-b border-[#151922] bg-[#e9ecff] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-mono text-[9px] text-[#596273]">NANGO / MICROSOFT GRAPH / LANGGRAPH</div>
                  <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.03em]">One real draft. One recovered thread. No duplicate write.</h3>
                </div>
                <span className={`font-mono text-[9px] font-semibold ${live.passed ? "text-[#18724e]" : "text-[#a23d34]"}`}>
                  {live.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="grid gap-px bg-[#cfd4da] sm:grid-cols-2 lg:grid-cols-4">
                <MethodDatum label="Runtime" value={`${live.runtime.name}, ${live.runtime.checkpointer}`} />
                <MethodDatum label="Credential custody" value={`${live.credentialSystem.name}, ${live.credentialSystem.integrationId}`} />
                <MethodDatum label="Provider action" value={`${live.provider.name}, ${live.provider.operation}`} />
                <MethodDatum label="Observed result" value={`${live.observed.mutationCalls} mutation, ${live.observed.remoteDraftCount} remote draft, generation ${live.observed.finalGeneration}`} />
              </div>
              <div className="grid gap-7 px-5 py-6 md:grid-cols-2">
                <div><h4 className="font-mono text-[9px] text-[#8a929d]">Credential boundary</h4><p className="mt-3 text-[11px] leading-5 text-[#596273]">{live.failureInjection.credential}</p></div>
                <div><h4 className="font-mono text-[9px] text-[#8a929d]">Side-effect boundary</h4><p className="mt-3 text-[11px] leading-5 text-[#596273]">{live.failureInjection.sideEffect}</p></div>
              </div>
              <dl className="grid gap-px border-t border-[#cfd4da] bg-[#cfd4da] sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(live.assertions).map(([key, value]) => <div key={key} className="bg-[#f4f5f1] p-4"><dt className="font-mono text-[8px] text-[#8a929d]">{key}</dt><dd className={`mt-2 font-mono text-[9px] ${value ? "text-[#18724e]" : "text-[#a23d34]"}`}>{value ? "passed" : "failed"}</dd></div>)}
              </dl>
              <div className="flex flex-col gap-3 border-t border-[#151922] px-5 py-4 text-[10px] text-[#687180] sm:flex-row sm:items-center sm:justify-between">
                <span>Temporary draft cleanup: {live.cleanup.succeeded ? "confirmed" : "not confirmed"}. Generated {formatDate(live.generatedAt)}.</span>
                <a href="/api/evidence/revivebench?artifact=live&download=1" className="font-semibold text-[#2e49c8]">Download live JSON</a>
              </div>
            </div>
            <p className="mt-5 text-[10px] leading-5 text-[#7b8491]">This certifies one controlled path. It does not establish provider-wide recovery rates, availability, throughput, or customer MTTR.</p>
          </ReportSection>

          <ReportSection id="apparatus" title="System under test">
            <p className="max-w-[720px] text-[13px] leading-6 text-[#687180]">
              The harness exercises the real Python recovery engine, its HTTP provider client, durable checkpoint store, recovery rendezvous, lease fencing, and action ledger.
            </p>
            <div className="mt-9 overflow-hidden border border-[#151922] bg-[#151922] text-[#f4f5f1]">
              <div className="grid md:grid-cols-5">
                {[
                  ["Provider", "Reject access and refresh"],
                  ["Classifier", "Route the grant failure"],
                  ["Checkpoint", "Persist the exact step"],
                  ["Lease", "Verify identity and advance"],
                  ["Runtime", "Resume the original run"],
                ].map(([title, body], index) => (
                  <div key={title} className="relative border-b border-[#3a404a] p-5 last:border-b-0 md:min-h-[156px] md:border-b-0 md:border-r md:last:border-r-0">
                    <div className="font-mono text-[9px] text-[#91a3ff]">{String(index + 1).padStart(2, "0")}</div>
                    <h3 className="mt-7 text-[13px] font-semibold">{title}</h3>
                    <p className="mt-2 text-[10px] leading-4 text-[#aeb6c1]">{body}</p>
                    {index < 4 && <span aria-hidden className="absolute -right-[5px] top-1/2 hidden h-2 w-2 rotate-45 border-r border-t border-[#91a3ff] bg-[#151922] md:block" />}
                  </div>
                ))}
              </div>
            </div>
          </ReportSection>

          <ReportSection id="method" title="Method">
            <div className="grid gap-px border border-[#bfc5cc] bg-[#bfc5cc] sm:grid-cols-2">
              <MethodDatum label="Runner" value="sidecar/benchmarks/revivebench.py" />
              <MethodDatum label="Iterations" value={`${report.methodology.iterationsPerCase} per scenario`} />
              <MethodDatum label="Provider transport" value={report.methodology.providerTransport} />
              <MethodDatum label="Restart persistence" value={report.methodology.restartPersistence} />
              <MethodDatum label="Assertion model" value={report.methodology.assertionModel} />
              <MethodDatum label="Environment" value={`Python ${report.environment.python}, ${report.environment.fixture}`} />
            </div>
            <p className="mt-5 font-mono text-[9px] leading-5 text-[#858d98]">Host: {report.environment.platform}</p>
          </ReportSection>

          <ReportSection id="results" title="Results">
            <div className="overflow-x-auto border border-[#151922] bg-[#fbfcf8]">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="bg-[#e9ecff] font-mono text-[9px] text-[#596273]">
                  <tr><th className="px-5 py-4 font-medium">Scenario</th><th className="px-4 py-4 font-medium">Executions</th><th className="px-4 py-4 font-medium">Passed</th><th className="px-4 py-4 font-medium">Failed</th><th className="px-5 py-4 text-right font-medium">Local p50</th></tr>
                </thead>
                <tbody>
                  {report.cases.map((item) => (
                    <tr key={item.id} className="border-t border-[#d8dde3] text-[11px]">
                      <td className="px-5 py-4 font-semibold">{item.title}</td>
                      <td className="px-4 py-4 font-mono text-[#596273]">{item.iterations}</td>
                      <td className="px-4 py-4 font-mono text-[#18724e]">{item.passed}</td>
                      <td className="px-4 py-4 font-mono text-[#596273]">{item.failed}</td>
                      <td className="px-5 py-4 text-right font-mono text-[#596273]">{item.p50Ms.toFixed(3)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-[#7b8491]">Timing measures a local process and is included only to make run records comparable. It is not a latency claim.</p>

            <div className="mt-12">
              <h3 className="text-[22px] font-semibold tracking-[-0.035em]">Every recorded execution</h3>
              <p className="mt-3 max-w-[620px] text-[12px] leading-6 text-[#687180]">Each cell maps to one run in the raw JSON artifact. Green means every assertion for that execution passed.</p>
              <div className="mt-6 grid grid-cols-10 gap-1.5 border border-[#bfc5cc] bg-[#fbfcf8] p-4 sm:grid-cols-20">
                {allRuns.map((run) => (
                  <span key={run.executionId} title={`${run.executionId}: ${run.passed ? "passed" : "failed"}`} className={`aspect-square min-h-2 ${run.passed ? "bg-[#2d8a63]" : "bg-[#b94c43]"}`} />
                ))}
              </div>
            </div>

            <div className="mt-12 space-y-5">
              {report.cases.map((item) => <ScenarioEvidence key={item.id} result={item} />)}
            </div>
          </ReportSection>

          <ReportSection id="observed-run" title="One observed recovery">
            {representative ? (
              <div className="border border-[#151922] bg-[#151922] text-[#eef0eb]">
                <div className="flex flex-col gap-2 border-b border-[#3a404a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><span className="font-mono text-[9px] text-[#91a3ff]">REPRESENTATIVE RUN</span><span className="ml-3 font-mono text-[9px] text-[#7f8997]">closest to scenario p50</span></div>
                  <span className="font-mono text-[9px] text-[#aeb6c1]">{representative.executionId} / {representative.durationMs.toFixed(3)} ms</span>
                </div>
                <ol className="grid md:grid-cols-5">
                  {representativeTags.map((tag, index) => (
                    <li key={`${tag}-${index}`} className="border-b border-[#3a404a] px-4 py-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
                      <span className="font-mono text-[8px] text-[#687484]">{String(index + 1).padStart(2, "0")}</span>
                      <div className="mt-3 font-mono text-[9px] text-[#91a3ff]">{tag}</div>
                      <div className="mt-2 text-[10px] leading-4 text-[#c4cad2]">{traceLabels[tag] ?? tag}</div>
                    </li>
                  ))}
                </ol>
                {representative.observed && (
                  <dl className="grid gap-px border-t border-[#3a404a] bg-[#3a404a] sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(representative.observed).filter(([key]) => key !== "eventTags").map(([key, value]) => (
                      <div key={key} className="bg-[#1d222b] px-4 py-4"><dt className="font-mono text-[8px] text-[#7f8997]">{key}</dt><dd className="mt-2 break-words font-mono text-[10px] text-[#eef0eb]">{displayValue(value)}</dd></div>
                    ))}
                  </dl>
                )}
              </div>
            ) : <p className="text-[13px] text-[#687180]">No successful run is available.</p>}
          </ReportSection>

          <ReportSection id="limits" title="Claim boundary">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="text-[18px] font-semibold">Supported by this report</h3>
                <ul className="mt-5 space-y-4 text-[12px] leading-5 text-[#596273]">
                  <li>Same-run checkpoint recovery in the Python engine.</li>
                  <li>File-backed recovery after replacing the worker instance.</li>
                  <li>Provider-subject binding and credential-generation fencing.</li>
                  <li>Reconciliation before repeating an ambiguous mutation.</li>
                  <li>One live Nango, Microsoft Graph draft, and durable LangGraph recovery path.</li>
                </ul>
              </div>
              <div className="border-l border-[#bfc5cc] pl-6">
                <h3 className="text-[18px] font-semibold">Not measured yet</h3>
                <ul className="mt-5 space-y-4 text-[12px] leading-5 text-[#687180]">
                  {report.methodology.exclusions.map((item) => <li key={item}>{item}</li>)}
                  <li>Naturally occurring revoked-grant recovery across customer tenants.</li>
                </ul>
              </div>
            </div>
            <div className="mt-10 border border-[#c98c42] bg-[#fff3dd] p-5 text-[11px] leading-5 text-[#6e4c20]">
              The live certification is a controlled correctness result from one tenant and one connection. Broader production claims require repeated design-partner runs and operated service history.
            </div>
          </ReportSection>

          <ReportSection id="reproduce" title="Reproduce the report">
            <p className="max-w-[680px] text-[13px] leading-6 text-[#687180]">The runner rewrites the artifact from fresh executions. Any unmet assertion is retained in the JSON and produces a non-zero exit code.</p>
            <pre className="mt-7 overflow-x-auto border border-[#151922] bg-[#151922] p-5 font-mono text-[11px] leading-6 text-[#f4f5f1]"><code>{"npm run bench:revive\npython3 -m unittest discover -s sidecar/tests -v\nnpm run certify:live"}</code></pre>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/api/evidence/revivebench?download=1" className="inline-flex h-10 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Download raw JSON</a>
              <a href="https://github.com/FlyingPotato437/revive/blob/main/sidecar/benchmarks/revivebench.py" className="inline-flex h-10 items-center border border-[#151922] bg-transparent px-4 text-[10.5px] font-semibold text-[#151922] transition hover:bg-white active:translate-y-px">Read the runner</a>
              <Link href="/app/quickstart" className="inline-flex h-10 items-center px-2 text-[10.5px] font-semibold text-[#2e49c8]">Integration guide</Link>
            </div>
          </ReportSection>
        </div>
      </div>
    </article>
  );
}

function ReportSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <EvidenceReveal><section id={id} className="scroll-mt-24 border-t border-[#151922] py-14 first:border-t-0 first:pt-0 sm:py-20"><h2 className="mb-8 text-[clamp(28px,4vw,42px)] font-semibold tracking-[-0.05em]">{title}</h2>{children}</section></EvidenceReveal>;
}

function SummaryDatum({ label, value }: { label: string; value: number }) {
  return <div className="border-b border-r border-[#151922] px-5 py-6 even:border-r-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0"><div className="font-mono text-[9px] text-[#687180]">{label}</div><div className="mt-2 text-[36px] font-semibold tracking-[-0.055em]">{value}</div></div>;
}

function MethodDatum({ label, value }: { label: string; value: string }) {
  return <div className="min-h-[118px] bg-[#fbfcf8] p-5"><div className="font-mono text-[9px] text-[#858d98]">{label}</div><div className="mt-4 max-w-[42ch] text-[11px] font-semibold leading-5 text-[#303741]">{value}</div></div>;
}

function ScenarioEvidence({ result }: { result: CaseResult }) {
  const detail = caseDetails[result.id];
  const observations = result.exampleRun?.observed
    ? Object.entries(result.exampleRun.observed).filter(([key]) => key !== "eventTags")
    : [];

  return (
    <details className="group border border-[#bfc5cc] bg-[#fbfcf8] open:border-[#151922]">
      <summary className="grid cursor-pointer list-none gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div><div className="font-mono text-[9px] text-[#7b8491]">{result.id}</div><h3 className="mt-2 text-[17px] font-semibold tracking-[-0.025em]">{result.title}</h3></div>
        <div className="flex items-center gap-5"><span className="font-mono text-[10px] text-[#18724e]">{result.passed}/{result.iterations} passed</span><span aria-hidden className="text-[18px] text-[#4967f2] transition-transform group-open:rotate-45">+</span></div>
      </summary>
      <div className="border-t border-[#d8dde3] p-5 sm:p-6">
        <div className="grid gap-7 md:grid-cols-2"><div><h4 className="font-mono text-[9px] text-[#8a929d]">Injected failure</h4><p className="mt-3 text-[11px] leading-5 text-[#596273]">{detail.failure}</p></div><div><h4 className="font-mono text-[9px] text-[#8a929d]">Acceptance condition</h4><p className="mt-3 text-[11px] leading-5 text-[#596273]">{detail.acceptance}</p></div></div>
        <p className="mt-6 border-l-[3px] border-[#4967f2] pl-4 text-[10.5px] leading-5 text-[#596273]">{detail.evidence}</p>
        {observations.length > 0 && <dl className="mt-6 grid gap-px border border-[#d8dde3] bg-[#d8dde3] sm:grid-cols-2 lg:grid-cols-4">{observations.map(([key, value]) => <div key={key} className="bg-[#f4f5f1] p-4"><dt className="font-mono text-[8px] text-[#8a929d]">{key}</dt><dd className="mt-2 break-words font-mono text-[9px] text-[#303741]">{displayValue(value)}</dd></div>)}</dl>}
      </div>
    </details>
  );
}
