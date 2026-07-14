"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, CheckCircle, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/app/ConsolePrimitives";

interface CatalogEntry {
  provider: string;
  displayName: string;
  authMode: string;
  categories: string[];
  docsUrl?: string;
  logoUrl?: string;
  status: "ready" | "registered_needs_probe" | "available" | "manual";
  integrationId?: string;
  provisional?: boolean;
  requiresCredentials: boolean;
  identity: "built-in" | "curated" | "custom" | "none";
}

const RENDER_CAP = 60;
const EMPTY_CREDENTIALS = { clientId: "", clientSecret: "", scopes: "" };

/** Full Nango provider catalog: search, filter, enable, connect. Rendered as a
 *  modal so the connections page itself stays uncrowded. */
export function ProviderCatalog({ onConnect, onClose }: {
  onConnect: (integrationId: string) => void;
  onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [enabling, setEnabling] = useState<string | null>(null);
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function refresh() {
    const response = await fetch("/api/workspaces/provider-catalog");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setNotice({ tone: "error", text: typeof payload.error === "string" ? payload.error : "Could not load the provider catalog" }); setCatalog([]); return; }
    setCatalog(payload.catalog ?? []);
    setRestricted(Boolean(payload.restricted));
  }

  useEffect(() => { void refresh(); }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of catalog ?? []) for (const item of entry.categories) set.add(item);
    return [...set].sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog ?? []).filter((entry) => {
      if (category !== "all" && !entry.categories.includes(category)) return false;
      if (!needle) return true;
      return entry.displayName.toLowerCase().includes(needle)
        || entry.provider.includes(needle)
        || entry.categories.some((item) => item.includes(needle));
    });
  }, [catalog, query, category]);

  const ready = filtered.filter((entry) => entry.status === "ready");
  const rest = filtered.filter((entry) => entry.status !== "ready");

  async function enable(entry: CatalogEntry) {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/workspaces/provider-catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: entry.provider,
          clientId: credentials.clientId || undefined,
          clientSecret: credentials.clientSecret || undefined,
          scopes: credentials.scopes || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({ tone: "error", text: typeof payload.error === "string" ? payload.error : "Could not enable this provider" });
        return;
      }
      setNotice({ tone: "ok", text: payload.warning ? `${entry.displayName} enabled. ${payload.warning}` : `${entry.displayName} enabled. Users can connect it now.` });
      setEnabling(null);
      setCredentials(EMPTY_CREDENTIALS);
      window.dispatchEvent(new Event("revive:connectors-changed"));
      await refresh();
    } finally { setBusy(false); }
  }

  function row(entry: CatalogEntry) {
    const open = enabling === entry.provider;
    return (
      <div key={entry.provider} className="border-b border-[#e9eae6] py-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            {entry.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={entry.logoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />
              : <div className="h-6 w-6 shrink-0 border border-[#d5d8d2] bg-white" />}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-semibold text-[#151922]">{entry.displayName}</span>
                {entry.status === "ready" && <StatusBadge tone={entry.provisional ? "warn" : "ok"}>{entry.provisional ? "provisional" : "certified"}</StatusBadge>}
                {entry.status === "registered_needs_probe" && <StatusBadge tone="warn">needs identity probe</StatusBadge>}
                {entry.status === "available" && entry.identity === "curated" && <StatusBadge tone="cobalt">probe included</StatusBadge>}
              </div>
              <div className="mt-0.5 truncate font-mono text-[8.5px] text-[#7b8491]">
                {entry.provider} · {entry.authMode}{entry.categories.length ? ` · ${entry.categories.join(", ")}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {entry.docsUrl && (
              <a href={entry.docsUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 px-2 font-mono text-[8.5px] text-[#7b8491] hover:text-[#151922]">
                docs <ArrowSquareOut size={10} />
              </a>
            )}
            {entry.status === "ready" && entry.integrationId && (
              <button onClick={() => onConnect(entry.integrationId!)} className="inline-flex h-8 items-center gap-1.5 border border-[#151922] bg-[#151922] px-3 text-[10px] font-semibold text-white transition hover:bg-[#2b3340]">
                <Plus size={11} weight="bold" /> Connect
              </button>
            )}
            {entry.status === "available" && (
              <button
                onClick={() => { setEnabling(open ? null : entry.provider); setCredentials(EMPTY_CREDENTIALS); setNotice(null); }}
                className="inline-flex h-8 items-center gap-1.5 border border-[#c9cec7] px-3 text-[10px] font-semibold text-[#151922] transition hover:border-[#151922]"
              >
                {open ? "Cancel" : "Enable"}
              </button>
            )}
            {entry.status === "manual" && (
              <span className="font-mono text-[8.5px] text-[#8a93a0]">configure in Nango dashboard</span>
            )}
            {entry.status === "registered_needs_probe" && (
              <span className="font-mono text-[8.5px] text-[#8a651e]">add custom connector below</span>
            )}
          </div>
        </div>
        {open && (
          <div className="mt-3 border border-[#d5d8d2] bg-[#f7f8f4] p-3">
            {entry.requiresCredentials ? (
              <>
                <p className="text-[9.5px] leading-4 text-[#687180]">
                  {entry.displayName} uses {entry.authMode}. Create an OAuth app in the provider and paste its client credentials.
                  They are stored by Nango, not Revive.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input value={credentials.clientId} placeholder="Client ID" spellCheck={false} disabled={busy}
                    onChange={(event) => setCredentials((current) => ({ ...current, clientId: event.target.value }))}
                    className="h-9 border border-[#d5d8d2] bg-white px-3 font-mono text-[10px] outline-none focus:border-[#4967f2]" />
                  <input value={credentials.clientSecret} placeholder="Client secret" type="password" spellCheck={false} disabled={busy}
                    onChange={(event) => setCredentials((current) => ({ ...current, clientSecret: event.target.value }))}
                    className="h-9 border border-[#d5d8d2] bg-white px-3 font-mono text-[10px] outline-none focus:border-[#4967f2]" />
                </div>
                <input value={credentials.scopes} placeholder="Scopes (optional, comma separated)" spellCheck={false} disabled={busy}
                  onChange={(event) => setCredentials((current) => ({ ...current, scopes: event.target.value }))}
                  className="mt-2 h-9 w-full border border-[#d5d8d2] bg-white px-3 font-mono text-[10px] outline-none focus:border-[#4967f2]" />
              </>
            ) : (
              <p className="text-[9.5px] leading-4 text-[#687180]">
                {entry.displayName} uses {entry.authMode}; users supply their credential when they connect. No app registration is needed.
              </p>
            )}
            {entry.identity === "none" && (
              <p className="mt-2 text-[9.5px] leading-4 text-[#8a651e]">
                Revive has no identity probe for this provider yet. After enabling, register a custom connector so connections can be identity-bound.
              </p>
            )}
            <button
              onClick={() => void enable(entry)}
              disabled={busy || (entry.requiresCredentials && (!credentials.clientId.trim() || !credentials.clientSecret.trim()))}
              className="mt-3 inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle size={13} weight="bold" /> {busy ? "Enabling" : `Enable ${entry.displayName}`}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#151922]/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Provider catalog">
      <div className="flex max-h-full w-full max-w-3xl flex-col border border-[#151922] bg-[#fbfcf8]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e2e3df] px-4 py-3 sm:px-5">
          <div>
            <div className="text-[12.5px] font-semibold text-[#151922]">All providers</div>
            <div className="mt-0.5 text-[9.5px] leading-4 text-[#687180]">
              Everything Nango supports. Certified adapters are identity-verified by Revive; curated and custom probes are provisional.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center border border-[#c9cec7] text-[#151922] hover:border-[#151922]"><X size={13} weight="bold" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e3df] px-4 py-3 sm:px-5">
          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a0]" />
            <input
              autoFocus value={query} placeholder="Search providers" spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full border border-[#d5d8d2] bg-white pl-8 pr-3 text-[11px] outline-none focus:border-[#4967f2]"
            />
          </div>
          <select
            value={category} onChange={(event) => setCategory(event.target.value)}
            className="h-9 border border-[#d5d8d2] bg-white px-2 font-mono text-[9.5px] outline-none focus:border-[#4967f2]"
          >
            <option value="all">all categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {restricted && (
          <div className="border-b border-[#e2e3df] bg-[#fff8e8] px-4 py-2 text-[9.5px] leading-4 text-[#72551f] sm:px-5">
            NANGO_ALLOWED_INTEGRATIONS restricts which enabled providers are offered to users. Unset it to offer everything registered.
          </div>
        )}
        {notice && (
          <div role={notice.tone === "error" ? "alert" : "status"} className={`border-b px-4 py-2 text-[10px] leading-4 sm:px-5 ${notice.tone === "error" ? "border-[#c2413a] bg-[#fcedeb] text-[#8b3e38]" : "border-[#3e7d4e] bg-[#eef7ee] text-[#2f5e3b]"}`}>
            {notice.text}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
          {catalog === null && <div className="py-6 font-mono text-[9px] text-[#8a93a0]">Loading the provider catalog…</div>}
          {catalog !== null && filtered.length === 0 && <div className="py-6 text-[10.5px] text-[#8a93a0]">No providers match.</div>}
          {ready.length > 0 && (
            <>
              <div className="pt-4 font-mono text-[8.5px] uppercase tracking-[.1em] text-[#7b8491]">Ready to connect</div>
              {ready.map(row)}
            </>
          )}
          {rest.length > 0 && (
            <>
              <div className="pt-4 font-mono text-[8.5px] uppercase tracking-[.1em] text-[#7b8491]">Available to enable</div>
              {rest.slice(0, RENDER_CAP).map(row)}
              {rest.length > RENDER_CAP && (
                <div className="py-3 font-mono text-[9px] text-[#8a93a0]">{rest.length - RENDER_CAP} more — refine the search to see them.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
