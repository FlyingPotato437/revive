"use client";

import { ArrowRight, CircleNotch, Pulse } from "@phosphor-icons/react";
import { useState } from "react";

type Analysis = { category: string; confidence: number; recoverable: boolean; suggestedActionType: string; suggestedRecipientRole: string; suggestedQuestion: string; reason: string; classifier: string };

export function DeadRunAnalyzer() {
  const [failureMessage, setFailureMessage] = useState("QuickBooks sync stopped: OAuth refresh returned invalid_grant. Access token was revoked.");
  const [trace, setTrace] = useState("run=invoice_reconciliation_842\ncheckpoint=fetch_open_invoices\nprovider=quickbooks\nHTTP 401 invalid_grant\nworker terminated after retry budget exhausted");
  const [analysis, setAnalysis] = useState<Analysis | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function analyze(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setAnalysis(null);
    const response = await fetch("/api/workspaces/dead-runs/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ failureMessage, trace }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(body.error || "Could not analyze trace."); return; }
    setAnalysis(body.analysis);
  }
  return <section className="overflow-hidden border border-[#151922] bg-[#fbfcf8]">
    <div className="grid lg:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={analyze} className="border-b border-[#151922] p-5 sm:p-6 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 font-mono text-[8px] tracking-[.1em] text-[#4967f2]"><Pulse size={13} />PASTE A DEAD RUN</div>
        <label className="mt-5 block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">Terminal failure</span><textarea value={failureMessage} onChange={(event) => setFailureMessage(event.target.value)} required maxLength={2000} rows={3} className="console-input h-auto py-2.5" /></label>
        <label className="mt-4 block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">Trace excerpt</span><textarea value={trace} onChange={(event) => setTrace(event.target.value)} maxLength={64000} rows={7} className="console-input h-auto py-2.5 font-mono text-[9.5px]" /></label>
        {error && <p role="alert" className="mt-3 border-l-[3px] border-[#af4039] bg-[#fff0ee] px-3 py-2 text-[10px] text-[#8f342f]">{error}</p>}
        <button disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] disabled:opacity-50">{busy ? <CircleNotch size={13} className="animate-spin" /> : <Pulse size={13} />}{busy ? "Reading trace…" : "Find what killed it"}</button>
        <p className="mt-3 text-[8.5px] leading-4 text-[#7b8491]">Tokens, secrets, emails and payment-like numbers are redacted before classification or storage.</p>
      </form>
      <div className="flex min-h-[390px] flex-col p-5 sm:p-6">
        {analysis ? <>
          <div className="flex items-center justify-between"><span className="font-mono text-[8px] tracking-[.1em] text-[#7b8491]">WHY THIS RUN DIED</span><span className="border border-[#d4d9fa] bg-[#edf0ff] px-2 py-1 font-mono text-[8px] text-[#2e49c8]">{analysis.classifier.toUpperCase()}</span></div>
          <div className="mt-7 text-[29px] font-semibold leading-tight tracking-[-.045em] text-[#151922]">{analysis.category.replaceAll("_", " ")}</div>
          <p className="mt-3 max-w-[520px] text-[12px] leading-6 text-[#687180]">{analysis.reason}</p>
          <div className="mt-6 border-l-[3px] border-[#4967f2] bg-[#edf0ff] p-4"><div className="font-mono text-[8px] text-[#6677c7]">SMALLEST ASK</div><div className="mt-2 text-[14px] font-semibold leading-5 text-[#263260]">{analysis.suggestedQuestion}</div><div className="mt-3 text-[9.5px] text-[#6677c7]">Send to: {analysis.suggestedRecipientRole} · {Math.round(analysis.confidence * 100)}% confidence</div></div>
          <div className="mt-auto flex items-center justify-between border-t border-[#d9ddd6] pt-4"><span className={`font-mono text-[9px] ${analysis.recoverable ? "text-[#18724e]" : "text-[#9a5c15]"}`}>{analysis.recoverable ? "HUMAN-RECOVERABLE" : "REVIEW NEEDED"}</span><a href="/app/quickstart" className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#2e49c8] hover:underline">Install detector <ArrowRight size={11} /></a></div>
        </> : <div className="flex flex-1 flex-col justify-center"><div className="font-mono text-[52px] font-semibold leading-none tracking-[-.06em] text-[#d5d9d3]">TRACE</div><h3 className="mt-5 text-[18px] font-semibold tracking-[-.03em]">See preventable loss before asking anyone to change workflow.</h3><p className="mt-3 max-w-[430px] text-[11px] leading-5 text-[#687180]">Paste one failed run. Revive classifies blocker, recovery path, smallest user ask and likely recipient role.</p></div>}
      </div>
    </div>
  </section>;
}
