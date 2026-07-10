"use client";

// Lets a workspace admin decide which agent actions pause for a human before
// they run. Pick a mode; optionally name always-require / never-require
// patterns. Read-only for non-admins.

import { useCallback, useEffect, useState } from "react";

type Mode = "off" | "high_risk" | "all_mutations" | "custom";

type OutboundMode = "off" | "all" | "bulk";

interface Guardrails {
  outboundMessages: OutboundMode;
  bulkRecipientThreshold: number;
  monetaryActions: boolean;
  destructiveActions: boolean;
  productionChanges: boolean;
}

interface Policy {
  mode: Mode;
  requirePatterns: string[];
  allowPatterns: string[];
  guardrails: Guardrails;
}

const MODES: Array<{ value: Mode; label: string; detail: string }> = [
  { value: "off", label: "Off", detail: "No action ever waits for approval." },
  { value: "high_risk", label: "High-risk only", detail: "Payments, refunds, emails, deletes, deploys pause. Everything else runs." },
  { value: "all_mutations", label: "All writes", detail: "Every action that changes state pauses. Read-only calls run." },
  { value: "custom", label: "Custom", detail: "Only the patterns you list below pause." },
];

export function ApprovalPolicyEditor() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [requireText, setRequireText] = useState("");
  const [allowText, setAllowText] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewAction, setPreviewAction] = useState("slack.post_message");
  const [previewRecipients, setPreviewRecipients] = useState(1);
  const [previewProduction, setPreviewProduction] = useState(false);
  const [preview, setPreview] = useState<{ required: boolean; reason: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspaces/approval-policy", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "failed to load policy");
      setPolicy(body.policy);
      setRequireText((body.policy.requirePatterns || []).join(", "));
      setAllowText((body.policy.allowPatterns || []).join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load policy");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch("/api/workspaces/approval-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: policy.mode,
          requirePatterns: requireText.split(",").map((s) => s.trim()).filter(Boolean),
          allowPatterns: allowText.split(",").map((s) => s.trim()).filter(Boolean),
          guardrails: policy.guardrails,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "save failed");
      setPolicy(body.policy);
      setStatus("Saved. New actions use this policy immediately.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const testPolicy = async () => {
    if (!policy) return;
    setPreviewing(true);
    setPreview(null);
    setError(null);
    try {
      const response = await fetch("/api/workspaces/approval-policy/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionKey: previewAction,
          riskContext: {
            operation: "outbound_message",
            recipientCount: Math.max(0, Math.floor(previewRecipients || 0)),
            production: previewProduction,
          },
          policy: {
            ...policy,
            requirePatterns: requireText.split(",").map((value) => value.trim()).filter(Boolean),
            allowPatterns: allowText.split(",").map((value) => value.trim()).filter(Boolean),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "preview failed");
      setPreview({ required: body.required, reason: body.reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  if (!policy && !error) return <p className="px-5 py-6 font-mono text-[9.5px] text-[#828b97]">Loading policy…</p>;
  if (error && !policy) return <p className="px-5 py-6 font-mono text-[9.5px] text-[#af4039]">{error}</p>;
  if (!policy) return null;

  return (
    <div className="p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((option) => {
          const active = policy.mode === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setPolicy({ ...policy, mode: option.value })}
              className={`border px-4 py-3 text-left transition ${
                active ? "border-[#4967f2] bg-[#f0f2ff]" : "border-[#dfe0dc] bg-[#fbfcf8] hover:border-[#151922]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full border ${active ? "border-[#4967f2] bg-[#4967f2]" : "border-[#b7bcc3]"}`} />
                <span className="text-[11px] font-semibold text-[#151922]">{option.label}</span>
              </div>
              <p className="mt-1.5 pl-[18px] text-[10px] leading-4 text-[#687180]">{option.detail}</p>
            </button>
          );
        })}
      </div>

      <section className="mt-6 border border-[#d8dde3] bg-[#f7f8f5] p-4" aria-labelledby="typed-guardrails-title">
        <div className="max-w-[640px]">
          <h3 id="typed-guardrails-title" className="text-[11px] font-semibold text-[#151922]">Typed action guardrails</h3>
          <p className="mt-1 text-[10px] leading-5 text-[#687180]">The MCP gateway sends only action facts such as recipient count or production target. It never sends the message body, recipient addresses, or provider tokens.</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="border border-[#dfe0dc] bg-white p-3">
            <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Outbound messages</span>
            <select
              value={policy.guardrails.outboundMessages}
              onChange={(event) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, outboundMessages: event.target.value as OutboundMode } })}
              className="mt-2 w-full border border-[#dfe0dc] bg-white px-2 py-1.5 text-[10.5px] text-[#151922] outline-none focus:border-[#4967f2]"
            >
              <option value="off">Do not add an outbound rule</option>
              <option value="bulk">Require approval for bulk sends</option>
              <option value="all">Require approval for every send</option>
            </select>
            {policy.guardrails.outboundMessages === "bulk" && <span className="mt-2 flex items-center gap-2 text-[9.5px] text-[#687180]">At least <input aria-label="Bulk recipient threshold" type="number" min="1" max="100000" value={policy.guardrails.bulkRecipientThreshold} onChange={(event) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, bulkRecipientThreshold: Math.max(1, Number(event.target.value) || 1) } })} className="w-16 border border-[#dfe0dc] px-2 py-1 font-mono text-[10px] text-[#151922] outline-none focus:border-[#4967f2]" /> recipients</span>}
          </label>
          <div className="grid gap-2 border border-[#dfe0dc] bg-white p-3">
            <Toggle label="Money movement" detail="charges, refunds, transfers" checked={policy.guardrails.monetaryActions} onChange={(monetaryActions) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, monetaryActions } })} />
            <Toggle label="Destructive changes" detail="delete, revoke, terminate" checked={policy.guardrails.destructiveActions} onChange={(destructiveActions) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, destructiveActions } })} />
            <Toggle label="Production changes" detail="deploy, release, publish" checked={policy.guardrails.productionChanges} onChange={(productionChanges) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, productionChanges } })} />
          </div>
        </div>
      </section>

      <details className="mt-5 border border-[#d8dde3] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-[10.5px] font-semibold text-[#151922] marker:text-[#4967f2]">Advanced rules and policy test</summary>
        <div className="border-t border-[#e2e3df] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Always require</span>
              <input value={requireText} onChange={(event) => setRequireText(event.target.value)} placeholder="wire_transfer, prod_deploy" className="mt-1.5 w-full border border-[#dfe0dc] bg-white px-3 py-2 font-mono text-[11px] text-[#151922] outline-none focus:border-[#4967f2]" />
              <span className="mt-1 block text-[9.5px] text-[#828b97]">Comma-separated action-key patterns.</span>
            </label>
            <label className="block">
              <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Never require</span>
              <input value={allowText} onChange={(event) => setAllowText(event.target.value)} placeholder="send_receipt, get_status" className="mt-1.5 w-full border border-[#dfe0dc] bg-white px-3 py-2 font-mono text-[11px] text-[#151922] outline-none focus:border-[#4967f2]" />
              <span className="mt-1 block text-[9.5px] text-[#828b97]">Overrides the mode for known-safe writes.</span>
            </label>
          </div>
          <div className="mt-5 border-t border-[#e2e3df] pt-4" aria-labelledby="policy-preview-title">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-[220px] flex-1"><span id="policy-preview-title" className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Test this draft</span><input value={previewAction} onChange={(event) => setPreviewAction(event.target.value)} className="mt-1.5 w-full border border-[#dfe0dc] px-3 py-2 font-mono text-[10.5px] text-[#151922] outline-none focus:border-[#4967f2]" /></label>
              <label className="block w-[110px]"><span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Recipients</span><input type="number" min="0" value={previewRecipients} onChange={(event) => setPreviewRecipients(Number(event.target.value))} className="mt-1.5 w-full border border-[#dfe0dc] px-3 py-2 font-mono text-[10.5px] text-[#151922] outline-none focus:border-[#4967f2]" /></label>
              <label className="flex h-9 items-center gap-2 border border-[#dfe0dc] px-3 text-[9.5px] text-[#596273]"><input type="checkbox" checked={previewProduction} onChange={(event) => setPreviewProduction(event.target.checked)} /> Production</label>
              <button onClick={() => void testPolicy()} disabled={previewing} className="h-9 border border-[#4967f2] bg-[#edf0ff] px-4 text-[10px] font-semibold text-[#2e49c8] transition hover:bg-[#dfe2ff] disabled:opacity-50">{previewing ? "Testing…" : "Test draft"}</button>
            </div>
            {preview && <p className={`mt-3 border-l-[3px] px-3 py-2 text-[10px] ${preview.required ? "border-[#9a5c15] bg-[#fff7e8] text-[#7a571c]" : "border-[#18724e] bg-[#edf8f2] text-[#176846]"}`}>{preview.required ? "This action would wait for approval." : "This action would run without approval."} {preview.reason}</p>}
          </div>
        </div>
      </details>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
        {status && <span className="font-mono text-[9.5px] text-[#18724e]">{status}</span>}
        {error && <span className="font-mono text-[9.5px] text-[#af4039]">{error}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#151922]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 accent-[#4967f2]" /><span className="font-semibold">{label}</span><span className="text-[#828b97]">{detail}</span></label>;
}
