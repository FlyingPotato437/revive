"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "@phosphor-icons/react";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean).map((label, index) => ({ key: slug(label) || `rule-${index + 1}`, label }));
}

export function OutcomeContractBuilder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [approvalMode, setApprovalMode] = useState("policy");
  const [preconditions, setPreconditions] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [compensation, setCompensation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generatedKey = useMemo(() => key || slug(name), [key, name]);

  async function save() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/workspaces/outcome-contracts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, key: generatedKey, description, approvalMode, preconditions: lines(preconditions), requiredOutcomes: lines(outcomes), compensation: lines(compensation) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create the contract");
      setOpen(false); setName(""); setKey(""); setDescription(""); setPreconditions(""); setOutcomes(""); setCompensation("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the contract");
    } finally { setBusy(false); }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px"><Plus size={12} weight="bold" /> New contract</button>;

  return <div className="fixed inset-0 z-[70] flex items-start justify-end bg-[#151922]/25 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={() => setOpen(false)}>
  <section className="instrument-panel max-h-[calc(100dvh-1.5rem)] w-full max-w-[720px] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]" aria-labelledby="new-contract-title" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between border-b border-[#151922] bg-[#edf0ff] px-5 py-3.5"><div><h2 id="new-contract-title" className="text-[12px] font-semibold text-[#151922]">Define the final state</h2><p className="mt-0.5 text-[9.5px] text-[#687180]">One line per condition. Revive stores rules, not customer payloads.</p></div><button onClick={() => setOpen(false)} aria-label="Close contract builder" className="flex h-7 w-7 items-center justify-center border border-transparent text-[#687180] hover:border-[#151922]"><X size={13} /></button></div>
    {error && <p role="alert" className="border-b border-[#edceca] bg-[#fff0ee] px-5 py-3 text-[10.5px] text-[#af4039]">{error}</p>}
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-[9.5px] font-semibold text-[#4f5866]">Contract name<input value={name} onChange={(event) => { setName(event.target.value); if (!key) setKey(slug(event.target.value)); }} placeholder="Refund and cancel" className="h-10 border border-[#c8cdd2] bg-white px-3 text-[11px] outline-none transition focus:border-[#4967f2]" /></label>
        <label className="grid gap-1.5 text-[9.5px] font-semibold text-[#4f5866]">Contract key<input value={generatedKey} onChange={(event) => setKey(slug(event.target.value))} placeholder="refund-and-cancel" className="h-10 border border-[#c8cdd2] bg-white px-3 font-mono text-[10px] outline-none transition focus:border-[#4967f2]" /></label>
        <label className="grid gap-1.5 text-[9.5px] font-semibold text-[#4f5866]">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What business operation does this contract settle?" className="min-h-20 resize-y border border-[#c8cdd2] bg-white px-3 py-2.5 text-[10.5px] leading-5 outline-none transition focus:border-[#4967f2]" /></label>
        <label className="grid gap-1.5 text-[9.5px] font-semibold text-[#4f5866]">Approval<select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value)} className="h-10 border border-[#c8cdd2] bg-white px-3 text-[10.5px] outline-none focus:border-[#4967f2]"><option value="policy">Use workspace policy</option><option value="always">Always require approval</option><option value="never">Never require transaction approval</option></select></label>
      </div>
      <div className="grid gap-4">
        <RuleField label="Preconditions" value={preconditions} onChange={setPreconditions} placeholder={"Payment is settled\nOrder has not been refunded"} />
        <RuleField label="Required outcomes" value={outcomes} onChange={setOutcomes} placeholder={"Refund is settled\nSubscription is cancelled\nCRM customer is updated"} required />
        <RuleField label="Recovery or compensation" value={compensation} onChange={setCompensation} placeholder={"Escalate if cancellation cannot be proved"} />
      </div>
    </div>
    <div className="flex justify-end gap-2 border-t border-[#e1e2de] bg-[#f7f8f5] px-5 py-4"><button onClick={() => setOpen(false)} className="h-9 border border-[#c8cdd2] bg-white px-4 text-[10px] font-semibold text-[#596273] hover:border-[#151922]">Cancel</button><button onClick={() => void save()} disabled={busy || !name.trim() || !generatedKey || !lines(outcomes).length} className="h-9 border border-[#151922] bg-[#151922] px-5 text-[10px] font-semibold text-white transition hover:bg-[#2b3340] disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Creating" : "Create contract"}</button></div>
  </section></div>;
}

function RuleField({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  return <label className="grid gap-1.5 text-[9.5px] font-semibold text-[#4f5866]">{label}{required && <span className="sr-only"> required</span>}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 resize-y border border-[#c8cdd2] bg-white px-3 py-2.5 font-mono text-[9.5px] leading-5 outline-none transition focus:border-[#4967f2]" /></label>;
}
