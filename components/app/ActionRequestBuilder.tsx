"use client";

import { Check, Copy, PaperPlaneTilt, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  ["approval", "Approval or edit"], ["clarification", "Clarification"], ["reauthorization", "Restore access"],
  ["verification", "Verify an outcome"], ["permission", "Grant permission"], ["browser_handoff", "Complete browser step"],
  ["document_request", "Provide a document"],
] as const;

export function ActionRequestBuilder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setUrl("");
    const data = new FormData(event.currentTarget);
    const runId = String(data.get("runId") || "").trim();
    const actionType = String(data.get("actionType") || "clarification");
    const title = String(data.get("title") || "").trim();
    const checkpointId = String(data.get("checkpointId") || "").trim();
    const context = String(data.get("context") || "").trim();
    const response = await fetch("/api/workspaces/action-requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId, checkpointId: checkpointId || undefined,
        actionType, idempotencyKey: `${runId}:${checkpointId || "unblock"}:${actionType}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
        title, description: String(data.get("description") || ""),
        recipient: { email: String(data.get("email") || ""), subjectId: String(data.get("subjectId") || "").trim() || String(data.get("email") || "") },
        expiresIn: String(data.get("expiresIn") || "48h"), generation: Number(data.get("generation") || 1),
        context: context ? { agent_message: context } : undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error || "Could not create request."); return; }
    setUrl(body.request.url || ""); router.refresh();
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url.startsWith("http") ? url : `${window.location.origin}${url}`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  }

  return <>
    <button onClick={() => { setOpen(true); setError(""); setUrl(""); }} className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px"><Plus size={12} />New request</button>
    {open && <div className="fixed inset-0 z-[80] bg-[#151922]/25 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <aside role="dialog" aria-modal="true" aria-label="Create action request" className="ml-auto flex h-full w-full max-w-[520px] flex-col border-l border-[#151922] bg-[#f4f5f1] shadow-[-16px_0_40px_rgba(21,25,34,.12)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-[64px] items-center justify-between border-b border-[#151922] px-5"><div><h2 className="text-[15px] font-semibold tracking-[-.03em]">New user action</h2><p className="mt-0.5 text-[9.5px] text-[#687180]">Create a one-use link and pause the run.</p></div><button aria-label="Close" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center border border-[#c7ccd2] hover:border-[#151922]"><X size={14} /></button></div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <Field label="Action type"><select name="actionType" className="console-input">{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Title"><input name="title" required maxLength={180} placeholder="Confirm the approved compensation range" className="console-input" /></Field>
            <Field label="Why the agent stopped"><textarea name="description" rows={3} maxLength={1200} placeholder="The candidate's requested salary exceeds the current band." className="console-input h-auto py-2.5" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Recipient email"><input name="email" type="email" required placeholder="owner@company.com" className="console-input" /></Field><Field label="Recipient subject ID"><input name="subjectId" placeholder="usr_budget_owner" className="console-input" /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Run ID"><input name="runId" required placeholder="run_recruiting_4821" className="console-input font-mono" /></Field><Field label="Checkpoint"><input name="checkpointId" placeholder="compensation-review" className="console-input font-mono" /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Run generation"><input name="generation" type="number" min="0" defaultValue="1" className="console-input font-mono" /></Field><Field label="Expires"><select name="expiresIn" defaultValue="48h" className="console-input"><option value="30m">30 minutes</option><option value="4h">4 hours</option><option value="24h">24 hours</option><option value="48h">48 hours</option><option value="7d">7 days</option></select></Field></div>
            <Field label="Context shown to recipient"><textarea name="context" rows={3} maxLength={1000} placeholder="Current range: $150k–$165k. Candidate requested $175k." className="console-input h-auto py-2.5" /></Field>
            {error && <p role="alert" className="border-l-[3px] border-[#af4039] bg-[#fff0ee] px-3 py-2 text-[10.5px] text-[#8f342f]">{error}</p>}
            {url && <div className="border border-[#18724e] bg-[#edf8f2] p-4"><div className="flex items-center gap-2 text-[10.5px] font-semibold text-[#18724e]"><Check size={13} />Secure action link created</div><div className="mt-3 flex gap-2"><input readOnly value={url} className="console-input min-w-0 flex-1 font-mono text-[9px]" /><button type="button" onClick={() => void copy()} className="flex h-9 shrink-0 items-center gap-1.5 border border-[#18724e] px-3 text-[9.5px] font-semibold text-[#18724e]">{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button></div></div>}
          </div>
          <div className="flex items-center justify-between border-t border-[#151922] bg-[#fbfcf8] px-5 py-4"><p className="max-w-[260px] text-[9px] leading-4 text-[#687180]">Recipient gets email when delivery is configured. The returned link always works.</p><button disabled={saving} className="inline-flex h-10 items-center gap-2 bg-[#4967f2] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50"><PaperPlaneTilt size={13} />{saving ? "Creating…" : "Create request"}</button></div>
        </form>
      </aside>
    </div>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">{label}</span>{children}</label>;
}
