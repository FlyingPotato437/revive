"use client";

import { use, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ClassifierResult, ReconsentTicket } from "@/lib/types";

type Phase = "loading" | "ready" | "approving" | "done" | "error";
const SCOPE_PERMS: Record<string, string> = {
  offline_access: "Maintain access after this browser session",
  "Mail.ReadWrite": "Read and update mail",
  "Calendars.Read": "Read calendar events",
  "Files.Read.All": "Read accessible files",
};

export default function Reauthorize({ params }: { params: Promise<{ ticket: string }> }) {
  const { ticket } = use(params);
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<{ ticket: ReconsentTicket; classifier?: ClassifierResult; authorization: { mode: "entra_pkce" | "sandbox"; url: string | null } } | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("completed") === "1") { setPhase("done"); return; }
    if (query.get("error") === "1") { setPhase("error"); return; }
    fetch(`/api/reconsent/${ticket}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value) => { setData(value); setPhase("ready"); })
      .catch(() => setPhase("error"));
  }, [ticket]);

  async function approve() {
    if (data?.authorization.mode === "entra_pkce" && data.authorization.url) {
      window.location.assign(data.authorization.url);
      return;
    }
    setPhase("approving");
    const response = await fetch(`/api/reconsent/${ticket}`, { method: "POST" });
    setPhase(response.ok ? "done" : "error");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f9] px-5 py-10">
      <div className="mx-auto flex max-w-[980px] items-center justify-between"><a href="/" className="flex items-center gap-2 text-[15px] font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-cobalt text-[12px] text-white">R</span>Revive</a><span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-faint">Secure recovery request</span></div>
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-16 w-full max-w-[480px] overflow-hidden rounded-[16px] border border-hairline bg-white shadow-[0_24px_70px_-35px_rgba(25,35,60,.35)]">
        <div className="border-b border-hairline px-6 py-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint"><span className="h-2 w-2 rounded-full bg-warn" />Microsoft Entra · Credential recovery</div></div>
        {phase === "loading" && <div className="px-6 py-16 text-center text-[12px] text-ink-faint">Validating recovery request…</div>}
        {phase === "error" && <div className="px-7 py-14 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-fail-soft text-fail">×</div><h1 className="mt-4 text-[20px] font-semibold tracking-[-0.025em] text-ink">This recovery link is inactive</h1><p className="mt-2 text-[12px] leading-5 text-ink-muted">The link was consumed, expired after 15 minutes, or the recovery case was closed.</p></div>}
        {(phase === "ready" || phase === "approving") && data && <div className="p-6">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">Reauthorize the parked workflow</h1>
          <p className="mt-2 text-[12px] leading-5 text-ink-muted">The current grant can no longer access Microsoft Graph. Authorizing creates a new credential generation and resumes the same logical run.</p>
          <div className="mt-5 rounded-[10px] border border-hairline bg-paper-baseline p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#0878d1] text-[12px] font-semibold text-white">M</span><div className="min-w-0"><div className="text-[12px] font-semibold text-ink">Microsoft Graph</div><div className="mt-0.5 truncate font-mono text-[10px] text-ink-muted">{data.ticket.account}</div></div></div>{data.classifier && <div className="mt-3 border-t border-hairline pt-3"><div className="font-mono text-[9.5px] text-fail">{data.classifier.code}</div><div className="mt-1 text-[10.5px] text-ink-muted">{data.classifier.title}</div></div>}</div>
          <div className="mt-5 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Requested access</div>
          <ul className="mt-2 divide-y divide-hairline rounded-[10px] border border-hairline">{data.ticket.scopes.map((scope) => <li key={scope} className="flex items-start gap-3 px-3 py-2.5"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-cobalt" /><div><div className="font-mono text-[10px] text-ink">{scope}</div><div className="mt-0.5 text-[9.5px] text-ink-faint">{SCOPE_PERMS[scope] ?? "Scoped provider access"}</div></div></li>)}</ul>
          <button onClick={approve} disabled={phase === "approving"} className="mt-5 h-11 w-full rounded-[9px] bg-ink text-[12px] font-semibold text-white transition hover:bg-[#272d39] disabled:opacity-50">{phase === "approving" ? "Rotating credential lease…" : data.authorization.mode === "entra_pkce" ? "Continue with Microsoft" : "Authorize and resume"}</button>
          <p className="mt-3 text-center text-[9.5px] leading-4 text-ink-faint">This one-time link is scoped to a single run and expires 15 minutes after issue.</p>
        </div>}
        {phase === "done" && <div className="px-7 py-14 text-center"><motion.div initial={{ scale: .7 }} animate={{ scale: 1 }} className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-[20px] text-ok">✓</motion.div><h1 className="mt-4 text-[20px] font-semibold tracking-[-0.025em] text-ink">Workflow resumed</h1><p className="mt-2 text-[12px] leading-5 text-ink-muted">The credential lease advanced to a new generation. The durable worker is replaying the failed action with its original idempotency key.</p></div>}
      </motion.section>
    </main>
  );
}
