"use client";

import { Check, Copy, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ActionRequestControls({ id, url, pending }: { id: string; url?: string; pending: boolean }) {
  const router = useRouter(); const [copied, setCopied] = useState(false); const [busy, setBusy] = useState(false);
  async function copy() { if (!url) return; await navigator.clipboard.writeText(url.startsWith("http") ? url : `${window.location.origin}${url}`); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }
  async function cancel() { setBusy(true); const response = await fetch(`/api/workspaces/action-requests/${encodeURIComponent(id)}`, { method: "DELETE" }); setBusy(false); if (response.ok) router.refresh(); }
  return <div className="flex items-center gap-2">{url && <button onClick={() => void copy()} className="inline-flex h-9 items-center gap-1.5 border border-[#c7ccd2] bg-[#fbfcf8] px-3 text-[9.5px] font-semibold hover:border-[#151922]">{copied ? <Check size={11} className="text-[#18724e]" /> : <Copy size={11} />}{copied ? "Copied" : "Copy link"}</button>}{pending && <button disabled={busy} onClick={() => void cancel()} className="inline-flex h-9 items-center gap-1.5 border border-[#edceca] bg-[#fff0ee] px-3 text-[9.5px] font-semibold text-[#af4039] disabled:opacity-50"><X size={11} />Cancel</button>}</div>;
}
