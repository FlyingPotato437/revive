"use client";

// Lets a workspace admin decide which agent actions pause for a human before
// they run. Pick a mode; optionally name always-require / never-require
// patterns. Read-only for non-admins.

import { useCallback, useEffect, useState } from "react";

type Mode = "off" | "high_risk" | "all_mutations" | "custom";

interface Policy {
  mode: Mode;
  requirePatterns: string[];
  allowPatterns: string[];
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Always require (comma-separated)</span>
          <input
            value={requireText}
            onChange={(event) => setRequireText(event.target.value)}
            placeholder="wire_transfer, prod_deploy"
            className="mt-1.5 w-full border border-[#dfe0dc] bg-white px-3 py-2 font-mono text-[11px] text-[#151922] outline-none focus:border-[#4967f2]"
          />
          <span className="mt-1 block text-[9.5px] text-[#828b97]">Action keys containing any of these always pause.</span>
        </label>
        <label className="block">
          <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Never require (comma-separated)</span>
          <input
            value={allowText}
            onChange={(event) => setAllowText(event.target.value)}
            placeholder="send_receipt, get_status"
            className="mt-1.5 w-full border border-[#dfe0dc] bg-white px-3 py-2 font-mono text-[11px] text-[#151922] outline-none focus:border-[#4967f2]"
          />
          <span className="mt-1 block text-[9.5px] text-[#828b97]">Wins over the mode above. Use for safe write actions.</span>
        </label>
      </div>

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
