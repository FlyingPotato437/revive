"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowClockwise, Check, WarningCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { AttentionItem, ReadinessItem } from "@/lib/attention";

export function AttentionQueue({ initialItems, readiness = [], showAll = false }: { initialItems: AttentionItem[]; readiness?: ReadinessItem[]; showAll?: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const decide = async (item: AttentionItem, decision: "approve" | "deny") => {
    if (!item.actionId && !item.transactionId) return;
    setBusy(item.id);
    setError(null);
    try {
      const endpoint = item.transactionId
        ? `/api/workspaces/transactions/${item.transactionId}/approval`
        : `/api/workspaces/approvals/${item.actionId}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save the decision");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the decision");
    } finally {
      setBusy(null);
    }
  };

  const retry = async (item: AttentionItem) => {
    if (!item.jobId) return;
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch("/api/workspaces/jobs/dead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: item.jobId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not retry delivery");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry delivery");
    } finally {
      setBusy(null);
    }
  };

  const incomplete = readiness.filter((item) => !item.done);
  return (
    <section className="instrument-panel overflow-hidden" aria-labelledby="attention-title">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5">
        <div>
          <h2 id="attention-title" className="text-[12px] font-semibold text-[#25282d]">Attention</h2>
          <p className="mt-0.5 text-[10px] text-[#687180]">Only work that needs a human or a retry.</p>
        </div>
        <span className={`font-mono text-[9px] ${items.length ? "text-[#9a5c15]" : "text-[#18724e]"}`}>{items.length ? `${items.length} open` : "all clear"}</span>
      </div>

      {error && <p role="alert" className="border-b border-[#edceca] bg-[#fff0ee] px-5 py-3 text-[10.5px] text-[#af4039]">{error}</p>}
      {items.length ? (
        <div>
          {(showAll ? items : items.slice(0, 4)).map((item) => (
            <div key={item.id} className="flex flex-col gap-3 border-b border-[#e8ebe7] px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><WarningCircle size={14} className="shrink-0 text-[#9a5c15]" /><span className="truncate text-[11px] font-semibold text-[#151922]">{item.title}</span></div>
                <p className="mt-1 pl-[22px] text-[10px] leading-4 text-[#687180]">{item.detail}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {item.kind === "approval" || item.kind === "transaction_approval" ? <>
                  <button onClick={() => void decide(item, "approve")} disabled={busy === item.id} className="h-8 border border-[#18724e] bg-[#edf8f2] px-3 text-[9px] font-semibold text-[#18724e] transition hover:bg-[#dff0e7] disabled:opacity-50">{busy === item.id ? "Saving" : "Approve"}</button>
                  <button onClick={() => void decide(item, "deny")} disabled={busy === item.id} className="h-8 border border-[#edceca] bg-white px-3 text-[9px] font-semibold text-[#af4039] transition hover:bg-[#fff0ee] disabled:opacity-50">Deny</button>
                </> : item.kind === "delivery" ? <button onClick={() => void retry(item)} disabled={busy === item.id} className="inline-flex h-8 items-center gap-1.5 border border-[#4967f2] bg-[#edf0ff] px-3 text-[9px] font-semibold text-[#2e49c8] transition hover:bg-[#dfe2ff] disabled:opacity-50"><ArrowClockwise size={11} /> {busy === item.id ? "Retrying" : "Retry"}</button> : item.href ? <Link href={item.href} className="inline-flex h-8 items-center gap-1.5 border border-[#cbd1d8] bg-white px-3 text-[9px] font-semibold text-[#3f4856] transition hover:border-[#151922]">Review <ArrowRight size={11} /></Link> : null}
              </div>
            </div>
          ))}
          {!showAll && items.length > 4 && <Link href="/app/attention" className="flex items-center justify-between px-5 py-3 text-[10px] font-semibold text-[#2e49c8] hover:bg-[#f5f6f2]">View all {items.length} open items <ArrowRight size={12} /></Link>}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-5"><span className="flex h-7 w-7 items-center justify-center border border-[#cbe3d7] bg-[#edf8f2] text-[#18724e]"><Check size={14} weight="bold" /></span><p className="text-[11px] text-[#596273]">No user request, recovery, uncertain action, or delivery needs your attention.</p></div>
      )}

      {incomplete.length > 0 && (
        <div className="border-t border-[#e1e2de] bg-[#f7f8f5] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-[10.5px] font-semibold text-[#151922]">Get operational</h3><p className="mt-0.5 text-[9.5px] text-[#687180]">Finish the next real setup step.</p></div><span className="font-mono text-[8.5px] text-[#7b8491]">{readiness.length - incomplete.length}/{readiness.length}</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{incomplete.slice(0, 2).map((item) => <Link key={item.id} href={item.href} className="group flex items-center justify-between border border-[#dfe3df] bg-white px-3 py-2.5 text-[10px] text-[#3f4753] transition hover:border-[#4967f2]"><span><span className="font-semibold text-[#151922]">{item.label}</span><span className="block pt-0.5 text-[9px] text-[#7b8491]">{item.detail}</span></span><ArrowRight size={12} className="ml-2 shrink-0 text-[#4967f2]" /></Link>)}</div>
        </div>
      )}
    </section>
  );
}
