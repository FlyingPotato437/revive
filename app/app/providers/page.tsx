import { CODE_TABLE } from "@/lib/graph-codes";

const CONNECTIONS = [
  { name: "Microsoft Entra", role: "Identity provider", state: "PKCE adapter available", detail: "Real authorization-code callback with sandbox fallback", initial: "M", color: "bg-[#0878d1]" },
  { name: "Nango", role: "Credential vault", state: "Adapter available", detail: "Scoped connect sessions and authenticated proxy calls", initial: "N", color: "bg-[#24272d]" },
  { name: "Auth0", role: "Token Vault", state: "Adapter available", detail: "Backend federated access-token exchange", initial: "A", color: "bg-[#e85d3f]" },
  { name: "LangGraph", role: "Durable runtime", state: "Adapter available", detail: "Interrupt and checkpointer integration", initial: "L", color: "bg-[#1d5f4d]" },
  { name: "Temporal", role: "Durable runtime", state: "Adapter available", detail: "Signal-based recovery with opaque lease references", initial: "T", color: "bg-[#5a56e8]" },
];

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-[1380px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cobalt">Integration surface</div><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-ink">Connections and policies</h1><p className="mt-2 max-w-[720px] text-[13px] leading-5 text-ink-muted">Revive sits between the credential system and durable runtime. This page distinguishes what is implemented from what remains on the integration roadmap.</p></div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {CONNECTIONS.map((item) => <div key={item.name} className="rounded-card border border-hairline bg-white p-4 shadow-seat"><div className="flex items-start justify-between gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-[9px] text-[12px] font-semibold text-white ${item.color}`}>{item.initial}</span><span className={`rounded-[5px] px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[0.07em] ${item.state.includes("available") ? "bg-ok-soft text-ok" : "bg-paper-inset text-ink-faint"}`}>{item.state}</span></div><div className="mt-4 text-[13px] font-semibold text-ink">{item.name}</div><div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.07em] text-cobalt">{item.role}</div><p className="mt-2 text-[11px] leading-5 text-ink-muted">{item.detail}</p></div>)}
      </section>

      <section className="mt-4 overflow-hidden rounded-card border border-hairline bg-white shadow-seat">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4"><div><h2 className="text-[14px] font-semibold text-ink">Sourced recovery policy catalog</h2><p className="mt-1 text-[11px] text-ink-muted">Provider codes inform policy selection; they are not presented as a standalone moat.</p></div><span className="rounded-[6px] bg-paper-inset px-2 py-1 font-mono text-[9.5px] text-ink-muted">{CODE_TABLE.length} policies · v0.2</span></div>
        <div className="hidden grid-cols-[.8fr_.9fr_.8fr_1.2fr_.6fr] gap-4 border-b border-hairline bg-paper-baseline px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint md:grid"><span>Provider</span><span>Signal</span><span>Decision</span><span>Recovery</span><span>Source</span></div>
        {CODE_TABLE.map((policy) => <div key={`${policy.provider}-${policy.code}`} className="grid gap-2 border-b border-hairline px-5 py-3.5 last:border-0 md:grid-cols-[.8fr_.9fr_.8fr_1.2fr_.6fr] md:items-center md:gap-4"><span className="text-[11px] font-medium capitalize text-ink">{policy.provider}</span><span className="w-fit rounded-[5px] bg-paper-inset px-2 py-1 font-mono text-[9.5px] text-ink-muted">{policy.code}</span><span className={`w-fit rounded-[5px] px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[0.07em] ${policy.verdict === "dead" ? "bg-fail-soft text-fail" : policy.verdict === "transient" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>{policy.verdict}</span><div><div className="text-[10.5px] font-medium text-ink">{policy.title}</div><div className="mt-0.5 text-[10px] text-ink-faint">{policy.remediation}</div></div><a href={policy.source} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-cobalt hover:underline">Official docs ↗</a></div>)}
      </section>
    </div>
  );
}
