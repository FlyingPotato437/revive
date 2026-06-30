"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecoveryCase, RunStatus } from "@/lib/types";

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

const TONE: Record<string, string> = {
  completed: "bg-ok-soft text-ok",
  awaiting_reconsent: "bg-warn-soft text-warn",
  resuming: "bg-cobalt-soft text-cobalt",
  dead: "bg-fail-soft text-fail",
  running: "bg-cobalt-soft text-cobalt",
  stalled: "bg-fail-soft text-fail",
};

export default function RecoveryCasesPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="mx-auto max-w-[1380px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cobalt">Operations</div><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-ink">Recovery cases</h1><p className="mt-2 max-w-[650px] text-[13px] leading-5 text-ink-muted">Event-derived records from this workspace. Cases are persisted locally across server restarts.</p></div>
        <Link href="/app" className="inline-flex h-10 items-center rounded-[8px] bg-ink px-4 text-[12px] font-semibold text-white hover:bg-[#272d39]">Run fault injection</Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Total cases" value={String(sessions.length)} />
        <Summary label="Recovered" value={String(recovered)} tone="ok" />
        <Summary label="Open" value={String(open)} tone={open ? "warn" : undefined} />
        <Summary label="Median recovery" value={medianMs ? `${(medianMs / 1000).toFixed(1)}s` : "—"} />
      </div>

      <section className="mt-4 overflow-hidden rounded-card border border-hairline bg-white shadow-seat">
        <div className="hidden grid-cols-[1.3fr_.9fr_.9fr_.8fr_.7fr_.7fr] gap-4 border-b border-hairline bg-paper-baseline px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint md:grid"><span>Recovery case</span><span>Provider signal</span><span>Status</span><span>Progress</span><span>Generation</span><span>Opened</span></div>
        {loading ? <div className="p-10 text-center text-[12px] text-ink-faint">Loading recovery history…</div> : sessions.length === 0 ? <EmptyState /> : sessions.map((item) => <div key={item.id} className="grid gap-3 border-b border-hairline px-5 py-4 last:border-0 hover:bg-paper-baseline md:grid-cols-[1.3fr_.9fr_.9fr_.8fr_.7fr_.7fr] md:items-center md:gap-4">
          <div className="min-w-0"><div className="truncate text-[12px] font-medium text-ink">{item.recoveryCase?.id ?? item.runId}</div><div className="mt-0.5 truncate font-mono text-[9.5px] text-ink-faint">{item.runId}</div></div>
          <div><span className="rounded-[5px] border border-hairline bg-paper-inset px-2 py-1 font-mono text-[9.5px] text-ink-muted">{item.deathCode ?? "—"}</span></div>
          <div><span className={`rounded-[5px] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] ${TONE[item.status] ?? "bg-paper-inset text-ink-muted"}`}>{item.recoveryCase?.status?.replaceAll("_", " ") ?? item.status.replaceAll("_", " ")}</span></div>
          <div><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-inset"><div className="h-full rounded-full bg-cobalt" style={{ width: `${(item.completedSteps / item.totalSteps) * 100}%` }} /></div><span className="font-mono text-[9.5px] text-ink-faint">{item.completedSteps}/{item.totalSteps}</span></div></div>
          <div className="font-mono text-[10px] text-ink-muted">gen {item.generation}</div>
          <div className="text-[10.5px] text-ink-faint">{relativeTime(item.createdAt)}</div>
        </div>)}
      </section>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return <div className="rounded-[11px] border border-hairline bg-white p-4 shadow-seat"><div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{label}</div><div className={`mt-2 text-[22px] font-semibold tracking-[-0.03em] ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</div></div>;
}

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
