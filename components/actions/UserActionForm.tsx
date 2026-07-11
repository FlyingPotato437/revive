"use client";

import { ArrowSquareOut, Check, CircleNotch, LockKey, PaperPlaneTilt } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { PublicUserActionRequest, UserActionField } from "@/lib/action-requests";

function initialValue(field: UserActionField): unknown {
  if (field.type === "boolean") return false;
  if (field.type === "currency") return { currency: "USD", amount: "" };
  return "";
}

export function UserActionForm({ token, initial }: { token: string; initial: PublicUserActionRequest }) {
  const [request, setRequest] = useState(initial);
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(initial.fields.map((field) => [field.key, initialValue(field)])));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const expires = useMemo(() => new Date(request.expiresAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }), [request.expiresAt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError("");
    const response = await fetch(`/api/actions/${encodeURIComponent(token)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ generation: request.generation, response: values }),
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) { setError(body.error || "Revive could not submit this action."); return; }
    setRequest(body.request);
  }

  if (request.status === "completed") {
    return <div className="border border-[#151922] bg-[#fbfcf8] p-6 shadow-[8px_8px_0_#d9ddd6] sm:p-8">
      <span className="flex h-10 w-10 items-center justify-center bg-[#18724e] text-white"><Check size={20} weight="bold" /></span>
      <h2 className="mt-6 text-[26px] font-semibold tracking-[-.04em] text-[#151922]">Action received</h2>
      <p className="mt-3 max-w-[500px] text-[13px] leading-6 text-[#687180]">Your response is bound to the paused run. {request.resumeStatus === "acknowledged" ? request.resumeDecision === "replan" ? "The runtime refreshed its plan before continuing." : "The agent resumed from the correct checkpoint." : request.resumeStatus === "queued" ? request.resumeDecision === "replan" ? "Revive is asking the runtime to refresh state before continuing." : "Revive is delivering it to the agent now." : request.resumeStatus === "held_for_review" ? "Run age or context needs operator review before continuation." : "The workflow owner can retrieve it through the API."}</p>
      <div className="mt-7 border-t border-[#d9ddd6] pt-4 font-mono text-[9px] text-[#7b8491]">REQUEST {request.id} · COMPLETED ONCE</div>
    </div>;
  }

  if (request.status !== "pending") {
    return <div className="border border-[#151922] bg-[#fbfcf8] p-6 shadow-[8px_8px_0_#d9ddd6] sm:p-8"><LockKey size={25} className="text-[#9a5c15]" /><h2 className="mt-5 text-[24px] font-semibold tracking-[-.04em] text-[#151922]">This action is {request.status}</h2><p className="mt-3 text-[13px] leading-6 text-[#687180]">Ask the workflow owner to create a new request. This link cannot be reused.</p></div>;
  }

  return <form onSubmit={submit} className="overflow-hidden border border-[#151922] bg-[#fbfcf8] shadow-[10px_10px_0_#d9ddd6]">
    {request.destinationUrl && <div className="border-b border-[#d9ddd6] bg-[#edf0ff] p-5 sm:p-6"><div className="text-[10px] font-semibold text-[#2e49c8]">COMPLETE THE EXTERNAL STEP FIRST</div><a href={request.destinationUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 items-center gap-2 bg-[#151922] px-4 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Open secure provider flow <ArrowSquareOut size={13} /></a></div>}
    <div className="divide-y divide-[#e1e4de]">
      {request.fields.map((field) => <Field key={field.key} field={field} value={values[field.key]} values={values} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}
    </div>
    <div className="border-t border-[#151922] p-5 sm:p-6">
      {error && <p role="alert" className="mb-4 border-l-[3px] border-[#af4039] bg-[#fff0ee] px-3 py-2 text-[11px] leading-5 text-[#8f342f]">{error}</p>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-mono text-[8.5px] text-[#7b8491]"><LockKey size={12} />ONE USE · EXPIRES {expires.toUpperCase()}</div>
        <button disabled={submitting} className="inline-flex h-11 items-center justify-center gap-2 bg-[#4967f2] px-5 text-[12px] font-semibold text-white transition hover:bg-[#3b55d9] active:translate-y-px disabled:cursor-wait disabled:opacity-60">{submitting ? <CircleNotch size={15} className="animate-spin" /> : <PaperPlaneTilt size={15} />}Submit and resume</button>
      </div>
    </div>
  </form>;
}

function Field({ field, value, values, onChange }: { field: UserActionField; value: unknown; values: Record<string, unknown>; onChange: (value: unknown) => void }) {
  const conditional = field.requiredWhen && values[field.requiredWhen.field] === field.requiredWhen.equals;
  const required = field.required || conditional;
  const base = "mt-2 h-11 w-full border border-[#c7ccd2] bg-white px-3 text-[13px] text-[#151922] outline-none transition focus:border-[#4967f2] focus:ring-2 focus:ring-[#4967f2]/15";
  return <label className="block p-5 sm:p-6">
    <span className="flex items-baseline gap-2 text-[12px] font-semibold text-[#151922]">{field.label}{required && <span className="font-mono text-[8px] font-normal text-[#af4039]">REQUIRED</span>}</span>
    {field.description && <span className="mt-1 block text-[10.5px] leading-5 text-[#687180]">{field.description}</span>}
    {field.type === "textarea" ? <textarea required={required} value={String(value || "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={4} className={`${base} h-auto resize-y py-3`} />
      : field.type === "select" ? <select required={required} value={String(value || "")} onChange={(event) => onChange(event.target.value)} className={base}><option value="">Choose one</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : field.type === "boolean" ? <span className="mt-3 flex items-center gap-3"><input type="checkbox" checked={Boolean(value)} required={required} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#4967f2]" /><span className="text-[11px] text-[#596273]">Confirmed</span></span>
      : field.type === "currency" ? <span className="mt-2 grid grid-cols-[90px_1fr]"><input aria-label="Currency" value={String((value as { currency?: string })?.currency || "USD")} onChange={(event) => onChange({ ...(value as object), currency: event.target.value.toUpperCase() })} maxLength={3} className={`${base} mt-0 border-r-0 font-mono`} /><input aria-label="Amount" type="number" step="0.01" required={required} value={String((value as { amount?: string })?.amount || "")} onChange={(event) => onChange({ ...(value as object), amount: event.target.value === "" ? "" : Number(event.target.value) })} className={`${base} mt-0`} /></span>
      : <input required={required} type={field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "url" || field.type === "file_url" ? "url" : "text"} value={String(value || "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder || (field.type === "file_url" ? "https://drive.example.com/..." : undefined)} className={base} />}
  </label>;
}
