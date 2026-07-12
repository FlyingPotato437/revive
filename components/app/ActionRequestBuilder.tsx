"use client";

import { Check, Copy, PaperPlaneTilt, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = [
  ["approval", "Approval or edit"], ["clarification", "Clarification"], ["reauthorization", "Restore access"],
  ["verification", "Verify an outcome"], ["permission", "Grant permission"], ["browser_handoff", "Complete browser step"],
  ["document_request", "Provide a document"],
] as const;

type ActionType = typeof TYPES[number][0];
type BlockerOption = { id: string; runId: string; checkpointId?: string; generation: number; actionType: ActionType; title: string; category: string; recipientRole: string };
type RecipientOption = { email: string; subjectId: string; role: string };

export function ActionRequestBuilder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [blockers, setBlockers] = useState<BlockerOption[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [actionType, setActionType] = useState<ActionType>("approval");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [runId, setRunId] = useState("");
  const [checkpointId, setCheckpointId] = useState("");
  const [generation, setGeneration] = useState(1);
  const [expiresIn, setExpiresIn] = useState("48h");
  const [context, setContext] = useState("");

  async function openBuilder() {
    setOpen(true); setError(""); setUrl("");
    setLoadingOptions(true);
    try {
      const response = await fetch("/api/workspaces/action-requests/options", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load blocked runs");
      setBlockers(body.blockers || []);
      setRecipients(body.recipients || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load blocked runs");
    } finally {
      setLoadingOptions(false);
    }
  }

  function chooseBlocker(id: string) {
    setSourceId(id);
    const blocker = blockers.find((item) => item.id === id);
    if (!blocker) return;
    setRunId(blocker.runId);
    setCheckpointId(blocker.checkpointId || "");
    setGeneration(blocker.generation);
    setActionType(blocker.actionType);
    setTitle(blocker.title);
  }

  function chooseRecipient(value: string) {
    setEmail(value);
    const recipient = recipients.find((item) => item.email === value);
    if (recipient) setSubjectId(recipient.subjectId);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setUrl("");
    const response = await fetch("/api/workspaces/action-requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId, checkpointId: checkpointId || undefined,
        actionType,
        idempotencyKey: `${runId}:${checkpointId || "unblock"}:${actionType}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
        title, description,
        recipient: { email, subjectId: subjectId.trim() || email },
        expiresIn, generation,
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

  const selected = blockers.find((item) => item.id === sourceId);
  return <>
    <button onClick={() => void openBuilder()} className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px"><Plus size={12} />New request</button>
    {open && <div className="fixed inset-0 z-[80] bg-[#151922]/25 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <aside role="dialog" aria-modal="true" aria-label="Create action request" className="ml-auto flex h-full w-full max-w-[520px] flex-col border-l border-[#151922] bg-[#f4f5f1] shadow-[-16px_0_40px_rgba(21,25,34,.12)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-[64px] items-center justify-between border-b border-[#151922] px-5"><div><h2 className="text-[15px] font-semibold tracking-[-.03em]">Request human action</h2><p className="mt-0.5 text-[9.5px] text-[#687180]">Start from the blocked run; Revive fills the continuation details.</p></div><button aria-label="Close" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center border border-[#c7ccd2] hover:border-[#151922]"><X size={14} /></button></div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <Field label="Blocked run">
              <select value={sourceId} onChange={(event) => chooseBlocker(event.target.value)} disabled={loadingOptions} className="console-input">
                <option value="">{loadingOptions ? "Loading blocked runs…" : "Manual request"}</option>
                {blockers.map((blocker) => <option key={blocker.id} value={blocker.id}>{blocker.runId} · {blocker.category.replaceAll("_", " ")}</option>)}
              </select>
            </Field>
            {selected ? <div className="border-l-[3px] border-[#4967f2] bg-[#edf0ff] px-3 py-2.5"><div className="text-[10px] font-semibold text-[#2e49c8]">Continuation coordinates filled</div><div className="mt-1 font-mono text-[8.5px] leading-4 text-[#596273]">run {runId}{checkpointId ? ` · checkpoint ${checkpointId}` : ""} · generation {generation}</div><div className="mt-1 text-[9px] text-[#687180]">Suggested recipient: {selected.recipientRole}</div></div> : <div className="grid gap-4 sm:grid-cols-2"><Field label="Run ID"><input value={runId} onChange={(event) => setRunId(event.target.value)} required placeholder="run_recruiting_4821" className="console-input font-mono" /></Field><Field label="Checkpoint (optional)"><input value={checkpointId} onChange={(event) => setCheckpointId(event.target.value)} placeholder="compensation-review" className="console-input font-mono" /></Field></div>}

            <div className="grid gap-4 sm:grid-cols-2"><Field label="Action needed"><select value={actionType} onChange={(event) => setActionType(event.target.value as ActionType)} className="console-input">{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Recipient"><input list="revive-recipients" value={email} onChange={(event) => chooseRecipient(event.target.value)} type="email" required placeholder="owner@company.com" className="console-input" /><datalist id="revive-recipients">{recipients.map((recipient) => <option key={recipient.email} value={recipient.email}>{recipient.role}</option>)}</datalist></Field></div>
            <Field label="What do you need?"><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} placeholder="Confirm the approved compensation range" className="console-input" /></Field>
            <Field label="Why the agent stopped"><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={1200} placeholder="Give the recipient enough context to decide." className="console-input h-auto py-2.5" /></Field>
            <Field label="Context shown to recipient (optional)"><textarea value={context} onChange={(event) => setContext(event.target.value)} rows={2} maxLength={1000} placeholder="Only include what the recipient needs." className="console-input h-auto py-2.5" /></Field>

            <details className="border border-[#d8dde3] bg-white"><summary className="cursor-pointer px-3 py-2.5 text-[9.5px] font-semibold text-[#596273]">Advanced delivery and identity</summary><div className="grid gap-4 border-t border-[#e2e3df] p-3 sm:grid-cols-2"><Field label="Recipient subject ID"><input value={subjectId} onChange={(event) => setSubjectId(event.target.value)} placeholder="Defaults to email" className="console-input" /></Field><Field label="Run generation"><input value={generation} onChange={(event) => setGeneration(Math.max(0, Number(event.target.value) || 0))} type="number" min="0" className="console-input font-mono" /></Field><Field label="Expires"><select value={expiresIn} onChange={(event) => setExpiresIn(event.target.value)} className="console-input"><option value="30m">30 minutes</option><option value="4h">4 hours</option><option value="24h">24 hours</option><option value="48h">48 hours</option><option value="7d">7 days</option></select></Field></div></details>
            {error && <p role="alert" className="border-l-[3px] border-[#af4039] bg-[#fff0ee] px-3 py-2 text-[10.5px] text-[#8f342f]">{error}</p>}
            {url && <div className="border border-[#18724e] bg-[#edf8f2] p-4"><div className="flex items-center gap-2 text-[10.5px] font-semibold text-[#18724e]"><Check size={13} />Secure action link created</div><div className="mt-3 flex gap-2"><input readOnly value={url} className="console-input min-w-0 flex-1 font-mono text-[9px]" /><button type="button" onClick={() => void copy()} className="flex h-9 shrink-0 items-center gap-1.5 border border-[#18724e] px-3 text-[9.5px] font-semibold text-[#18724e]">{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button></div></div>}
          </div>
          <div className="flex items-center justify-between border-t border-[#151922] bg-[#fbfcf8] px-5 py-4"><p className="max-w-[260px] text-[9px] leading-4 text-[#687180]">The recipient gets one secure link. Revive binds the response to this exact run.</p><button disabled={saving || !runId || !title || !email} className="inline-flex h-10 items-center gap-2 bg-[#4967f2] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50"><PaperPlaneTilt size={13} />{saving ? "Creating…" : "Create request"}</button></div>
        </form>
      </aside>
    </div>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">{label}</span>{children}</label>;
}
