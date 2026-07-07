"use client";

import { useCallback, useEffect, useState } from "react";
import { FloppyDisk, Trash, WarningCircle } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/app/ConsolePrimitives";

interface CustomConnector {
  integrationId: string;
  label: string;
  identityProbe: { path: string; subjectField: string; tenantField: string; accountField: string };
  provisional: true;
  updatedAt: number;
}

const EMPTY = {
  integrationId: "",
  label: "",
  path: "",
  subjectField: "id",
  tenantField: "org.id",
  accountField: "email",
};

export function CustomConnectorManager() {
  const [connectors, setConnectors] = useState<CustomConnector[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workspaces/custom-connectors");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Could not load custom connectors"); return; }
    setConnectors(payload.connectors || []);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/workspaces/custom-connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integrationId: form.integrationId,
          label: form.label,
          identityProbe: {
            path: form.path,
            subjectField: form.subjectField,
            tenantField: form.tenantField,
            accountField: form.accountField,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "Could not register connector"); return; }
      setForm(EMPTY);
      await refresh();
      window.dispatchEvent(new Event("revive:connectors-changed"));
    } finally { setBusy(false); }
  }

  async function remove(integrationId: string) {
    if (!window.confirm(`Remove ${integrationId}? Existing connections using it cannot reauthorize until it is registered again.`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/workspaces/custom-connectors", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "Could not remove connector"); return; }
      await refresh();
      window.dispatchEvent(new Event("revive:connectors-changed"));
    } finally { setBusy(false); }
  }

  function edit(connector: CustomConnector) {
    setForm({
      integrationId: connector.integrationId,
      label: connector.label,
      path: connector.identityProbe.path,
      subjectField: connector.identityProbe.subjectField,
      tenantField: connector.identityProbe.tenantField,
      accountField: connector.identityProbe.accountField,
    });
  }

  const field = (key: keyof typeof EMPTY, label: string, placeholder: string, mono = true) => (
    <label className="grid gap-1.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[.1em] text-[#7b8491]">{label}</span>
      <input
        required value={form[key]} placeholder={placeholder} spellCheck={false} disabled={busy}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        className={`h-10 border border-[#d5d8d2] bg-white px-3 text-[11px] text-[#151922] outline-none transition focus:border-[#4967f2] disabled:opacity-60 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );

  return (
    <div>
      <p className="max-w-[64ch] text-[10.5px] leading-5 text-[#687180]">
        Register an identity probe for a Nango integration that Revive does not ship. The probe runs through Nango;
        Revive stores only the resulting subject, tenant, and account binding.
      </p>
      <div className="mt-2 flex items-start gap-2 text-[9.5px] leading-4 text-[#8a651e]">
        <WarningCircle size={13} className="mt-px shrink-0" />
        Custom connectors remain provisional because Revive cannot certify that an operator-selected identity field is stable.
      </div>

      {error && <div role="alert" className="mt-4 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[11px] text-[#8b3e38]">{error}</div>}

      <form onSubmit={save} className="mt-4 border border-[#151922] bg-[#f7f8f4] p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("integrationId", "Nango integration ID", "linear")}
            {field("label", "Display label", "Linear", false)}
          </div>
          <div className="mt-4">{field("path", "Identity probe path", "/v2/me")}</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {field("subjectField", "Subject field", "id")}
            {field("tenantField", "Tenant field", "org.id")}
            {field("accountField", "Account field", "email")}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#d5d8d2] pt-4">
            <p className="max-w-[58ch] font-mono text-[8.5px] leading-4 text-[#7b8491]">
              Subject and tenant must resolve to non-empty values during initial binding and every recovery.
            </p>
            <button disabled={busy} className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50">
              <FloppyDisk size={13} weight="bold" /> {busy ? "Saving" : "Save provisional connector"}
            </button>
          </div>
        </form>

      <div className="mt-5 border-t border-[#e2e3df]">
        {connectors === null && <div className="py-5 text-[10.5px] text-[#8a93a0]">Loading connectors…</div>}
        {connectors?.length === 0 && <div className="py-5 text-[10.5px] text-[#8a93a0]">No custom connectors registered.</div>}
        {connectors?.map((connector) => (
          <div key={connector.integrationId} className="grid gap-3 border-b border-[#e9eae6] py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <button type="button" onClick={() => edit(connector)} className="min-w-0 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-semibold text-[#151922]">{connector.label}</span>
                <StatusBadge tone="warn">provisional</StatusBadge>
              </div>
              <div className="mt-1 truncate font-mono text-[8.5px] text-[#7b8491]">
                {connector.integrationId} · GET {connector.identityProbe.path}
              </div>
              <div className="mt-1 font-mono text-[8px] text-[#9aa1aa]">
                subject={connector.identityProbe.subjectField} · tenant={connector.identityProbe.tenantField} · account={connector.identityProbe.accountField}
              </div>
            </button>
            <button onClick={() => remove(connector.integrationId)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 text-[9.5px] font-semibold text-[#a84139] disabled:opacity-50">
              <Trash size={12} weight="bold" /> Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

