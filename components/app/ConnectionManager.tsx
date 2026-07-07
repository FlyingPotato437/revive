"use client";

import Nango from "@nangohq/frontend";
import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, LinkSimple, Plus, X } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/app/ConsolePrimitives";
import { CustomConnectorManager } from "@/components/app/CustomConnectorManager";

interface ConnectionSummary {
  id: string;
  provider: string;
  accountId?: string;
  scopes: string[];
  vault?: string;
  displayName?: string;
  status?: string;
  generation?: number;
  updatedAt?: number;
  integrationId?: string;
}

type Phase = "idle" | "connecting" | "binding";

interface IntegrationOption { id: string; provider: string; label: string; provisional?: boolean }

export function ConnectionManager() {
  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationOption[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeIntegration, setActiveIntegration] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workspaces/connections");
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setConnections(payload.connections ?? []);
    else setError(payload.error || "Could not load connections");
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const load = () => void fetch("/api/integrations/nango/integrations")
      .then((response) => response.json())
      .then((payload) => setIntegrations(payload.integrations ?? []))
      .catch(() => setIntegrations([]));
    load();
    window.addEventListener("revive:connectors-changed", load);
    return () => window.removeEventListener("revive:connectors-changed", load);
  }, []);

  async function connect(integrationId?: string) {
    setError(null);
    setPhase("connecting");
    setActiveIntegration(integrationId ?? null);
    try {
      const sessionResponse = await fetch("/api/integrations/nango/connect-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(integrationId ? { integrations: [integrationId] } : {}),
      });
      const session = await sessionResponse.json() as { token?: string; error?: string };
      if (!sessionResponse.ok || !session.token) throw new Error(session.error || "Could not start the connect session");
      const nango = new Nango({ connectSessionToken: session.token });
      let completed = false;
      const connectUi = nango.openConnectUI({
        detectClosedAuthWindow: true,
        themeOverride: "light",
        onEvent: async (event) => {
          if (event.type === "error") { connectUi.close(); setPhase("idle"); setError("Provider authorization failed"); return; }
          if (event.type === "close" && !completed) { setPhase("idle"); return; }
          if (event.type !== "connect") return;
          completed = true;
          setPhase("binding");
          const bind = await fetch("/api/integrations/nango/connections/complete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ connectionId: event.payload.connectionId, integrationId: event.payload.providerConfigKey }),
          });
          const result = await bind.json().catch(() => ({}));
          connectUi.close();
          if (!bind.ok) setError(result.error || "Connection authorized but identity binding failed");
          setPhase("idle");
          setActiveIntegration(null);
          await refresh();
        },
      });
    } catch (cause) {
      setPhase("idle");
      setActiveIntegration(null);
      setError(cause instanceof Error ? cause.message : "Could not start the connect session");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[10.5px] leading-5 text-[#687180]">
          Connect the account your agents act as. Tokens stay in the credential vault (Nango); Revive stores the
          identity binding (subject + tenant) it verifies on every recovery.
        </p>
        <div className="flex flex-wrap gap-2">
          {(integrations.length ? integrations : [{ id: "", provider: "microsoft", label: "Microsoft" }]).map((integration) => {
            const busy = phase !== "idle" && (activeIntegration ?? "") === integration.id;
            return (
              <button
                key={integration.id || integration.provider}
                onClick={() => connect(integration.id || undefined)}
                disabled={phase !== "idle"}
                className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-60"
              >
                {busy
                  ? (phase === "connecting" ? "Opening provider" : "Binding identity")
                  : (<><Plus size={13} weight="bold" /> Connect {integration.label}{integration.provisional ? " · provisional" : ""}</>)}
              </button>
            );
          })}
          <button
            onClick={() => setCustomOpen((value) => !value)}
            className="inline-flex h-9 items-center gap-2 border border-[#c9cec7] bg-transparent px-4 text-[10.5px] font-semibold text-[#151922] transition hover:border-[#151922] active:translate-y-px"
          >
            {customOpen ? <X size={13} weight="bold" /> : <Plus size={13} weight="bold" />} Custom connector
          </button>
        </div>
      </div>

      {error && <div role="alert" className="mt-4 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[11px] leading-5 text-[#8b3e38]">{error}</div>}

      {customOpen && (
        <div className="mt-5 border border-[#e2e3df] bg-[#fbfcf8] p-4 sm:p-5">
          <CustomConnectorManager />
        </div>
      )}

      <div className="mt-5 border-t border-[#e2e3df]">
        {connections === null && <div className="py-6 text-[10.5px] text-[#8a93a0]">Loading connections…</div>}
        {connections?.length === 0 && (
          <div className="flex items-center gap-3 py-6 text-[10.5px] text-[#8a93a0]">
            <LinkSimple size={15} /> No connections yet. Recovery needs at least one bound account.
          </div>
        )}
        {connections?.map((connection) => (
          <div key={connection.id} className="grid gap-2 border-b border-[#e9eae6] py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-[#151922]">{connection.displayName || connection.accountId || connection.id}</span>
                <StatusBadge tone={connection.status === "active" || !connection.status ? "ok" : "warn"}>{connection.status || "bound"}</StatusBadge>
                {connection.vault && <StatusBadge tone="cobalt">{connection.vault} custody</StatusBadge>}
                {integrations.find((item) => item.id === connection.integrationId)?.provisional && <StatusBadge tone="warn">provisional connector</StatusBadge>}
              </div>
              <div className="mt-1 truncate font-mono text-[9px] text-[#7b8491]">
                {connection.provider} · {connection.id}{typeof connection.generation === "number" ? ` · generation ${connection.generation}` : ""}
              </div>
              <div className="mt-1 font-mono text-[8.5px] text-[#9aa1aa]">{connection.scopes.join(" ")}</div>
            </div>
            {connection.updatedAt && (
              <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#8a93a0]">
                <ArrowsClockwise size={11} /> {new Date(connection.updatedAt).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
