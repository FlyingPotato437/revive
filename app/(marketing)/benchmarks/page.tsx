import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

type CaseResult = { id: string; title: string; iterations: number; passed: number; failed: number; p50Ms: number; p95Ms: number };
type Report = {
  generatedAt: string;
  sourceCommit: string | null;
  sourceTreeDirty?: boolean | null;
  environment: { python: string; platform: string; fixture: string };
  methodology: { iterationsPerCase: number; scope: string; exclusions: string[] };
  summary: { executions: number; passed: number; failed: number };
  cases: CaseResult[];
};

const caseDetails: Record<string, { failure: string; pass: string }> = {
  "same-run-resume": {
    failure: "The access token expires and the refresh token is rejected after two completed workflow steps.",
    pass: "The engine parks at the failed step, accepts a new provider grant and completes the original run ID.",
  },
  "worker-restart": {
    failure: "The worker that created the checkpoint is replaced before reauthorization completes.",
    pass: "A new engine instance reads SQLite state and resumes without in-memory routing data.",
  },
  "identity-binding": {
    failure: "A reauthorization reply returns a different provider subject from the original connection.",
    pass: "The reply is rejected before the one-time recovery capability is consumed.",
  },
  "generation-fencing": {
    failure: "An old worker wakes up with credential generation 1 after recovery advanced the lease to generation 2.",
    pass: "The durable lease store rejects generation 1 before the worker can execute a step.",
  },
  "side-effect-reconcile": {
    failure: "An action is marked started, but the worker cannot tell whether the remote mutation committed.",
    pass: "The reconciliation callback confirms the remote action and the mutation function is not called again.",
  },
};

function readReport(): Report | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "benchmarks/results/revivebench-local.json"), "utf8")) as Report; } catch { return null; }
}

export const dynamic = "force-dynamic";

export default function BenchmarkWhitepaperPage() {
  const report = readReport();
  return <div className="bg-[#f4f5f1] text-[#151922]">
    <section className="border-b border-[#151922]"><div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28"><p className="text-[11px] font-semibold text-[#4967f2]">ReviveBench</p><h1 className="mt-5 max-w-[920px] text-[clamp(44px,6vw,76px)] font-semibold leading-[.93] tracking-[-.065em]">What happens when OAuth dies mid-run?</h1><p className="mt-7 max-w-[760px] text-[15px] leading-7 text-[#5f6876]">An executable study of checkpoint recovery, account binding, stale-worker fencing and side-effect safety.</p></div></section>

    {!report ? <section className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8"><div className="border border-[#151922] bg-[#fbfcf8] p-8"><h2 className="text-[24px] font-semibold">No benchmark report is available.</h2><p className="mt-3 text-[13px] text-[#687180]">Run <code className="font-mono">npm run bench:revive</code>. Revive does not display placeholder results.</p></div></section> : <>
      <section className="border-b border-[#151922] bg-[#eef0eb]"><div className="mx-auto grid max-w-[1180px] sm:grid-cols-3"><Metric label="Executions" value={report.summary.executions} detail="five recovery cases" /><Metric label="Passed" value={report.summary.passed} detail="observed invariant checks" /><Metric label="Failed" value={report.summary.failed} detail="retained in the report" /></div></section>

      <section className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28"><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><h2 className="text-[36px] font-semibold tracking-[-.05em]">The product under test</h2><p className="mt-5 text-[13px] leading-6 text-[#687180]">A credential provider can issue a new token. A workflow runtime can resume a checkpoint. Revive connects those events to the same account, run and pending action.</p></div><div className="border border-[#151922] bg-[#fbfcf8] p-5 sm:p-7"><RecoveryFlow /></div></div></section>

      <section className="border-y border-[#151922] bg-[#eef0eb]"><div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28"><h2 className="text-[36px] font-semibold tracking-[-.05em]">Evaluation setup</h2><p className="mt-4 max-w-[720px] text-[13px] leading-6 text-[#687180]">Every case invokes the repository's real engine, durable SQLite store and HTTP provider client. The provider is a local OAuth fixture, not Microsoft Entra production.</p><div className="mt-10 grid border border-[#151922] bg-[#fbfcf8] sm:grid-cols-2 lg:grid-cols-3"><Setup label="Runner" value="sidecar/benchmarks/revivebench.py" /><Setup label="Provider transport" value="Real localhost HTTP requests" /><Setup label="Durable state" value="SQLite checkpoints and leases" /><Setup label="Iterations" value={`${report.methodology.iterationsPerCase} per recovery case`} /><Setup label="Source" value={`${report.sourceCommit || "unavailable"}${report.sourceTreeDirty ? " with local changes" : ""}`} /><Setup label="Generated" value={new Date(report.generatedAt).toLocaleString()} /></div></div></section>

      <section className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28"><h2 className="text-[36px] font-semibold tracking-[-.05em]">Five failures, forty executions.</h2><div className="mt-10 space-y-4">{report.cases.map((item) => <CaseStudy key={item.id} result={item} />)}</div></section>

      <section className="border-y border-[#151922] bg-[#eef0eb]"><div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:py-28"><div><h2 className="text-[32px] font-semibold tracking-[-.045em]">What the result shows</h2><p className="mt-5 max-w-[500px] text-[13px] leading-6 text-[#596273]">In this harness, Revive preserved the logical run, rejected the wrong account and stale credential generation, survived worker replacement, and reconciled an ambiguous mutation before replay.</p></div><div><h2 className="text-[32px] font-semibold tracking-[-.045em]">What it does not show</h2><ul className="mt-5 space-y-3">{report.methodology.exclusions.map((item) => <li key={item} className="border-l-[3px] border-[#9a5c15] pl-4 text-[12px] leading-5 text-[#687180]">{item}</li>)}</ul><p className="mt-5 text-[11px] leading-5 text-[#7b8491]">The millisecond timings below describe a local process. They are included for reproducibility, not as a production latency claim.</p></div></div></section>

      <section className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8"><h2 className="text-[28px] font-semibold tracking-[-.04em]">Reproduce every run</h2><p className="mt-4 max-w-[620px] text-[12px] leading-6 text-[#687180]">The command rewrites the JSON report from fresh executions. A failed assertion is recorded and returns a non-zero exit code.</p><pre className="mt-6 overflow-x-auto border border-[#151922] bg-[#151922] p-5 font-mono text-[11px] leading-6 text-[#f4f5f1]"><code>{`npm run bench:revive\npython3 -m unittest discover -s sidecar/tests -v`}</code></pre><div className="mt-6 flex flex-wrap gap-5"><Link href="/app/quickstart" className="text-[11px] font-semibold text-[#2e49c8]">Read the integration guide</Link><Link href="/app" className="text-[11px] font-semibold text-[#2e49c8]">Run the recovery lab</Link></div></section>
    </>}
  </div>;
}

function RecoveryFlow() {
  const stages = [["Detect", "Provider rejects refresh"], ["Park", "Save run and action"], ["Verify", "Match provider identity"], ["Fence", "Advance lease generation"], ["Resume", "Signal the same run"]];
  return <div className="grid gap-0 md:grid-cols-5">{stages.map(([title, body], index) => <div key={title} className="relative border-b border-[#d8dde3] px-3 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><div className="font-mono text-[8px] text-[#2e49c8]">{String(index + 1).padStart(2, "0")}</div><div className="mt-3 text-[12px] font-semibold">{title}</div><div className="mt-2 text-[9px] leading-4 text-[#7b8491]">{body}</div></div>)}</div>;
}

function CaseStudy({ result }: { result: CaseResult }) {
  const detail = caseDetails[result.id];
  return <article className="grid gap-5 border border-[#bfc5cc] bg-[#fbfcf8] p-5 sm:p-6 lg:grid-cols-[1fr_1fr_auto]"><div><div className="font-mono text-[8px] text-[#7b8491]">{result.id}</div><h3 className="mt-2 text-[16px] font-semibold tracking-[-.025em]">{result.title}</h3><p className="mt-3 text-[10.5px] leading-5 text-[#687180]">{detail?.failure}</p></div><div className="border-l-[3px] border-[#4967f2] pl-4"><div className="text-[9px] font-semibold text-[#2e49c8]">Pass condition</div><p className="mt-2 text-[10.5px] leading-5 text-[#596273]">{detail?.pass}</p></div><div className="grid grid-cols-3 gap-5 lg:grid-cols-1 lg:content-center lg:border-l lg:border-[#d8dde3] lg:pl-6"><Result label="Passed" value={`${result.passed}/${result.iterations}`} /><Result label="P50" value={`${result.p50Ms} ms`} /><Result label="P95" value={`${result.p95Ms} ms`} /></div></article>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="border-b border-[#151922] px-5 py-7 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="font-mono text-[8px] tracking-[.1em] text-[#7b8491]">{label.toUpperCase()}</div><div className="mt-2 text-[36px] font-semibold tracking-[-.055em]">{value}</div><div className="mt-1 text-[10px] text-[#687180]">{detail}</div></div>; }
function Setup({ label, value }: { label: string; value: string }) { return <div className="border-b border-[#d8dde3] p-5 last:border-b-0 sm:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"><div className="font-mono text-[8px] tracking-[.08em] text-[#8a929d]">{label.toUpperCase()}</div><div className="mt-3 break-words text-[11px] font-semibold leading-5">{value}</div></div>; }
function Result({ label, value }: { label: string; value: string }) { return <div className="min-w-[74px]"><div className="font-mono text-[8px] tracking-[.08em] text-[#8a929d]">{label.toUpperCase()}</div><div className="mt-1 whitespace-nowrap text-[12px] font-semibold">{value}</div></div>; }
