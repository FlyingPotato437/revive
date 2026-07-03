"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ClassifierResult, ReconsentTicket } from "@/lib/types";

export function ClassifierCard({ c }: { c: ClassifierResult }) {
  const policy = c.code === "AADSTS50078" || c.code === "AADSTS50076" ? "Step-up authentication" : "Interactive reauthorization";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-3 mb-3 rounded-[10px] border border-hairline bg-paper-baseline p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-fail" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">Provider signal classified</span>
        </div>
        <span className="rounded-[5px] border border-fail/15 bg-fail-soft px-2 py-1 font-mono text-[10px] text-fail">{c.code}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <div className="text-[13px] font-semibold text-ink">{c.title}</div>
          <p className="mt-1 max-w-[60ch] text-[11.5px] leading-5 text-ink-muted">{c.reason}</p>
        </div>
        <div className="rounded-[7px] border border-hairline bg-white px-3 py-2 text-right">
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Selected policy</div>
          <div className="mt-1 text-[11px] font-medium text-cobalt">{policy}</div>
          <div className="mt-0.5 font-mono text-[9px] text-ink-faint">confidence {c.confidence.toFixed(2)}</div>
        </div>
      </div>
    </motion.div>
  );
}

export function ReconsentCard({ ticket, approving, onApprove }: { ticket: ReconsentTicket; approving: boolean; onApprove: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, ticket.expiresAt - Date.now()));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, ticket.expiresAt - Date.now())), 1000);
    return () => clearInterval(timer);
  }, [ticket.expiresAt]);
  const minutes = String(Math.floor(remaining / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  const fullUrl = typeof window === "undefined" ? ticket.url : `${window.location.origin}${ticket.url}`;

  async function copy() {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-3 mb-3 overflow-hidden rounded-[10px] border border-warn/25 bg-warn-soft/55">
        <div className="flex items-center justify-between border-b border-warn/15 px-4 py-3">
          <div>
            <div className="text-[12px] font-semibold text-ink">User action required</div>
            <div className="mt-0.5 text-[10.5px] text-ink-muted">The run is durably parked; no worker is blocked.</div>
          </div>
          <span className="rounded-[5px] bg-white/70 px-2 py-1 font-mono text-[10px] text-warn">{remaining === 0 ? "validating expiry" : `${minutes}m ${seconds}s left`}</span>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-[11px]">
            <dt className="text-ink-faint">Account</dt><dd className="truncate font-mono text-ink">{ticket.account}</dd>
            <dt className="text-ink-faint">Recovery case</dt><dd className="truncate font-mono text-ink">{ticket.runId}</dd>
            <dt className="text-ink-faint">Policy trigger</dt><dd className="font-mono text-ink">{ticket.code}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">{ticket.scopes.map((scope) => <span key={scope} className="rounded-[5px] border border-hairline bg-white/80 px-2 py-1 font-mono text-[9.5px] text-ink-muted">{scope}</span>)}</div>
          <div className="mt-3 flex items-center gap-2 rounded-[7px] border border-hairline bg-white px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-muted">{fullUrl}</span>
            <button onClick={copy} className="shrink-0 rounded-[5px] bg-paper-inset px-2 py-1 text-[9px] font-semibold text-ink-muted">{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button onClick={onApprove} disabled={approving || ticket.status !== "open"} className="h-10 flex-1 rounded-[8px] bg-ink px-4 text-[12px] font-semibold text-white transition hover:bg-[#272d39] disabled:opacity-45">{approving ? "Authorizing…" : "Authorize and resume"}</button>
            <a href={ticket.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-[8px] border border-hairline bg-white px-4 text-[11px] font-medium text-ink-muted hover:bg-paper-inset">Open consent screen ↗</a>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
