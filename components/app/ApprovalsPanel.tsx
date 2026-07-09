"use client";

// Approvals inbox: agent actions that match the workspace approval policy wait
// here for a human. Approve releases the action to run exactly once; deny
// blocks it for good.

import { useCallback, useEffect, useState } from "react";

interface ApprovalRow {
  actionId: string;
  actionKey: string;
  runId: string;
  state: string;
  status: "pending" | "approved" | "denied";
  summary?: string;
  requestedBy: string;
  requestedAt: number;
  decidedBy?: string;
  decidedAt?: number;
  reason?: string;
}

function ago(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ApprovalsPanel({ limit, pendingOnly }: { limit?: number; pendingOnly?: boolean } = {}) {
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspaces/approvals", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "failed to load approvals");
      let list: ApprovalRow[] = body.approvals;
      if (pendingOnly) list = list.filter((row) => row.status === "pending");
      if (limit) list = list.slice(0, limit);
      setRows(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load approvals");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load, limit, pendingOnly]);

  const decide = async (actionId: string, decision: "approve" | "deny") => {
    setBusy(actionId);
    try {
      const response = await fetch(`/api/workspaces/approvals/${actionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "decision failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "decision failed");
    } finally {
      setBusy(null);
    }
  };

  if (rows === null && !error) {
    return <p className="px-5 py-6 font-mono text-[9.5px] text-[#828b97]">Loading approvals…</p>;
  }
  if (error) {
    return <p className="px-5 py-6 font-mono text-[9.5px] text-[#af4039]">{error}</p>;
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="px-5 py-6 text-[11px] text-[#687180]">
        No approvals yet. Actions that match this workspace&apos;s approval policy pause here until someone
        approves them &mdash; including every call through the MCP gateway. Set the policy in
        <span className="font-mono text-[10px]"> Settings &rarr; Approval policy</span>.
      </p>
    );
  }

  return (
    <div>
      {rows.map((row) => (
        <div key={row.actionId} className="grid gap-3 border-b border-[#e1e5ea] px-5 py-4 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-[#151922]">{row.actionKey}</span>
              <span
                className={`border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[.08em] ${
                  row.status === "pending"
                    ? "border-[#ead9ba] bg-[#fff7e8] text-[#9a5c15]"
                    : row.status === "approved"
                      ? "border-[#cbe3d7] bg-[#edf8f2] text-[#18724e]"
                      : "border-[#edceca] bg-[#fff0ee] text-[#af4039]"
                }`}
              >
                {row.status}
              </span>
            </div>
            <p className="mt-1 font-mono text-[9px] text-[#828b97]">
              run {row.runId} · requested {ago(row.requestedAt)} by {row.requestedBy}
              {row.decidedBy ? ` · ${row.status} by ${row.decidedBy}${row.decidedAt ? ` ${ago(row.decidedAt)}` : ""}` : ""}
            </p>
            {row.summary && <p className="mt-1 text-[10.5px] text-[#687180]">{row.summary}</p>}
          </div>
          {row.status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => void decide(row.actionId, "approve")}
                disabled={busy === row.actionId}
                className="border border-[#18724e] bg-[#edf8f2] px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[.08em] text-[#18724e] transition hover:bg-[#dff0e7] disabled:opacity-50"
              >
                {busy === row.actionId ? "…" : "Approve"}
              </button>
              <button
                onClick={() => void decide(row.actionId, "deny")}
                disabled={busy === row.actionId}
                className="border border-[#af4039] bg-[#fff0ee] px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[.08em] text-[#af4039] transition hover:bg-[#fbe3e0] disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
