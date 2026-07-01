"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecoveryCase, RunStatus } from "@/lib/types";
import { PageHeader, StatusBadge, SummaryStrip } from "@/components/app/ConsolePrimitives";

interface SessionSummary {
  id: string;
  runId: string;
  createdAt: number;
  deathCode?: string;
  status: RunStatus;
  recoveryCase?: RecoveryCase;
  completedSteps: number;
  totalSteps: number;
  recoveredMs?: number;
  generation: number;
  deduplicatedActions: number;
}

export default function RecoveryCasesPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "recovered">("all");
  useEffect(() => {
    fetch("/api/sessions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setSessions(data.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const recovered = sessions.filter((item) => item.status === "completed").length;
  const open = sessions.filter((item) => item.status === "awaiting_reconsent" || item.status === "resuming").length;
  const median = sessions.filter((item) => item.recoveredMs).map((item) => item.recoveredMs!).sort((a, b) => a - b);
  const medianMs = median.length ? median[Math.floor(median.length / 2)] : 0;
  const shown = sessions.filter((item) => {
    if (filter === "all") return true;
    if (filter === "recovered") return item.status === "completed";
    return item.status === "awaiting_reconsent" || item.status === "resuming" || item.status === "running";
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Operations" title="Recovery cases" description="Every record joins a rejected credential, the interrupted run, its checkpoint, and the action that must not execute twice." actions={<Link href="/app" className="inline-flex h-9 items-center rounded-[6px] bg-[#171a20] px-4 text-[10.5px] font-semibold text-white hover:bg-[#292d35]">Run recovery drill</Link>} />

      <div className="mt-5"><SummaryStrip items={[{ label: "Total cases", value: String(sessions.length), detail: "workspace lifetime" }, { label: "Recovered", value: String(recovered), detail: "terminal success", tone: "ok" }, { label: "Open", value: String(open), detail: "operator attention", tone: open ? "warn" : undefined }, { label: "Median recovery", value: medianMs ? `${(medianMs / 1000).toFixed(1)}s` : "Not measured", detail: "sandbox measurement" }]} /></div>

      <section className="instrument-panel mt-5 overflow-hidden rounded-[8px]">
        <div className="flex flex-col gap-3 border-b border-[#e2e3df] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-1 rounded-[6px] bg-[#f2f2ee] p-0.5">{(["all", "open", "recovered"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-[5px] px-3 py-1.5 text-[9.5px] font-medium capitalize transition ${filter === item ? "bg-white text-[#24272c] shadow-[0_1px_2px_rgba(20,24,32,.08)]" : "text-[#85898e] hover:text-[#4c5056]"}`}>{item}</button>)}</div><div className="flex items-center gap-3 text-[9px] text-[#8d9095]"><span>{shown.length} records</span><span className="h-3 w-px bg-[#d8d9d5]" /><span className="font-mono">updated now</span></div></div>
        <div className="evidence-plate hidden grid-cols-[1.3fr_.9fr_.9fr_.8fr_.7fr_.7fr] gap-4 border-b border-hairline px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint md:grid"><span>Recovery case</span><span>Provider signal</span><span>Status</span><span>Progress</span><span>Generation</span><span>Opened</span></div>
        {loading ? <div className="p-10 text-center text-[12px] text-ink-faint">Loading recovery history…</div> : sessions.length === 0 ? <EmptyState /> : shown.map((item) => <Link href={`/app/runs/${item.id}`} key={item.id} className="group grid gap-3 border-b border-hairline px-5 py-4 last:border-0 hover:bg-[#fafaf7] md:grid-cols-[1.3fr_.9fr_.9fr_.8fr_.7fr_.7fr] md:items-center md:gap-4">
          <div className="min-w-0"><div className="truncate text-[12px] font-medium text-ink">{item.recoveryCase?.id ?? item.runId}</div><div className="mt-0.5 truncate font-mono text-[9.5px] text-ink-faint">{item.runId}</div></div>
          <div><span className="font-mono text-[9.5px] text-[#676b72]">{item.deathCode ?? "Not recorded"}</span></div>
          <div><CaseStatus status={item.status}>{item.recoveryCase?.status?.replaceAll("_", " ") ?? item.status.replaceAll("_", " ")}</CaseStatus></div>
          <div><div className="flex items-center gap-2"><div className="flex gap-0.5" aria-hidden="true">{Array.from({ length: item.totalSteps }).map((_, index) => <span key={index} className={`h-2 w-1.5 ${index < item.completedSteps ? "bg-cobalt" : "bg-[#d8dce0]"}`} />)}</div><span className="font-mono text-[9.5px] text-ink-faint">{item.completedSteps}/{item.totalSteps}</span></div></div>
          <div className="font-mono text-[10px] text-ink-muted">gen {item.generation}</div><div className="flex items-center justify-between text-[10.5px] text-ink-faint"><span>{relativeTime(item.createdAt)}</span><span className="translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100">→</span></div>
        </Link>)}
      </section>
    </div>
  );
}

function CaseStatus({ status, children }: { status: RunStatus; children: React.ReactNode }) { const tone = status === "completed" ? "ok" : status === "dead" || status === "stalled" ? "fail" : status === "awaiting_reconsent" ? "warn" : status === "running" || status === "resuming" ? "cobalt" : "neutral"; return <StatusBadge tone={tone}><span className="h-1 w-1 rounded-full bg-current" />{children}</StatusBadge>; }

function EmptyState() {
  return <div className="px-6 py-14 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[10px] border border-hairline bg-paper-inset text-[16px] text-ink-faint">↻</div><div className="mt-3 text-[13px] font-semibold text-ink">No recovery cases yet</div><p className="mx-auto mt-1 max-w-[360px] text-[11.5px] leading-5 text-ink-muted">Run a fault injection in the recovery lab. The resulting case will be written to the durable local event store.</p><Link href="/app" className="mt-4 inline-flex text-[11px] font-semibold text-cobalt">Open recovery lab →</Link></div>;
}

function relativeTime(at: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
