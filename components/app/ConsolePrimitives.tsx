import type { ReactNode } from "react";
import Link from "next/link";

/** Relative "12m ago". Server + client safe (no locale). */
export function ago(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type Tone = "ink" | "ok" | "warn" | "fail" | "cobalt";
const VALUE_COLOR: Record<Tone, string> = {
  ink: "text-[#151922]", ok: "text-[#18724e]", warn: "text-[#9a5c15]", fail: "text-[#af4039]", cobalt: "text-[#2e49c8]",
};
const ACCENT: Record<Tone, string> = {
  ink: "border-l-[#151922]", ok: "border-l-[#18724e]", warn: "border-l-[#9a5c15]", fail: "border-l-[#af4039]", cobalt: "border-l-[#4967f2]",
};

/** The four-guarantee masthead. Each tile links to its detail; tone colors the
 *  value only when the number is live (>0), so a fresh workspace reads calm. */
export function GuaranteeStrip({ items }: {
  items: Array<{ label: string; value: string; detail: string; href: string; accent: Tone; live: boolean }>;
}) {
  return (
    <section className="instrument-panel relative grid overflow-hidden border-[#151922] sm:grid-cols-2 lg:grid-cols-4">
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#18724e] motion-safe:animate-pulse" />
        <span className="font-mono text-[7.5px] tracking-[.14em] text-[#7b8491]">LIVE</span>
      </div>
      {items.map((item, index) => (
        <Link
          key={item.label}
          href={item.href}
          className={`relative min-w-0 border-l-[3px] px-4 py-4 transition hover:bg-[#f5f6f2] sm:px-5 ${ACCENT[item.accent]} ${index ? "border-t border-t-[#cdd2d7] sm:border-t-0" : ""}`}
        >
          <div className="font-mono text-[8px] tracking-[.1em] text-[#7b8491]">{item.label.toUpperCase()}</div>
          <div className={`mt-2 truncate text-[22px] font-semibold tabular-nums tracking-[-.04em] ${item.live ? VALUE_COLOR[item.accent] : VALUE_COLOR.ink}`}>{item.value}</div>
          <div className="mt-1 truncate font-mono text-[8.5px] text-[#828b97]">{item.detail}</div>
        </Link>
      ))}
    </section>
  );
}

/** Ledger action-state → tone + label. */
export function VerdictBadge({ state }: { state: string }) {
  const map: Record<string, "ok" | "warn" | "cobalt" | "neutral"> = { completed: "ok", reconciled: "ok", prepared: "cobalt", started: "warn", uncertain: "warn" };
  return <StatusBadge tone={map[state] ?? "neutral"}>{state}</StatusBadge>;
}

/** Recovery-case state → tone. Parked / awaiting reauth read cobalt
 *  (actionable, not failing); terminal-failure states read fail. */
export function CaseStateBadge({ state }: { state: string }) {
  const fail = new Set(["rejected", "expired", "escalated", "manual_review"]);
  const ok = new Set(["resumed", "reconciled", "completed"]);
  const cobalt = new Set(["parked", "awaiting_authorization", "identity_verified"]);
  const tone = fail.has(state) ? "fail" : ok.has(state) ? "ok" : cobalt.has(state) ? "cobalt" : "warn";
  return <StatusBadge tone={tone}>{state.replaceAll("_", " ")}</StatusBadge>;
}

/** Task-scoped outcome state. Verified/compensated are settled outcomes;
 * recovering and needs-human remain operational work, not generic errors. */
export function TransactionStateBadge({ state }: { state: string }) {
  const ok = new Set(["verified", "compensated"]);
  const fail = new Set(["cancelled"]);
  const warn = new Set(["recovering", "needs_human", "awaiting_approval"]);
  const tone = ok.has(state) ? "ok" : fail.has(state) ? "fail" : warn.has(state) ? "warn" : "cobalt";
  return <StatusBadge tone={tone}>{state.replaceAll("_", " ")}</StatusBadge>;
}

/** A meter: cobalt fill, warn at ≥80%, fail at 100%. limit null = unlimited. */
export function MetricMeter({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null) {
    return <div className="font-mono text-[9px] text-[#828b97]">{used} used · unlimited</div>;
  }
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const color = pct >= 100 ? "bg-[#af4039]" : pct >= 80 ? "bg-[#9a5c15]" : "bg-[#4967f2]";
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[9px] text-[#828b97]"><span>{used} / {limit}</span><span>{pct}%</span></div>
      <div className="mt-1 h-1 w-full bg-[#e1e5ea]"><div className={`h-1 ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="relative flex flex-col gap-5 border-b border-[#151922] pb-7 lg:flex-row lg:items-end lg:justify-between"><div className="relative border-l-[4px] border-[#4967f2] pl-4"><div className="text-[10px] font-semibold text-[#2e49c8]">{eyebrow}</div><h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.045em] text-[#151922] sm:text-[36px]">{title}</h1>{description && <p className="mt-2 max-w-[760px] text-[13px] leading-5 text-[#626c79]">{description}</p>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</header>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "fail" | "cobalt" }) {
  const tones = { neutral: "border-[#dfe0dc] bg-[#f1f2ee] text-[#62666d]", ok: "border-[#cbe3d7] bg-[#edf8f2] text-[#18724e]", warn: "border-[#ead9ba] bg-[#fff7e8] text-[#9a5c15]", fail: "border-[#edceca] bg-[#fff0ee] text-[#af4039]", cobalt: "border-[#d4d9fa] bg-[#f0f2ff] text-[#465bd5]" };
  return <span className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.07em] ${tones[tone]}`}>{children}</span>;
}

export function SummaryStrip({ items }: { items: Array<{ label: string; value: string; detail?: string; tone?: "ok" | "warn" | "fail" | "cobalt" }> }) {
  const columns = items.length === 2 ? "lg:grid-cols-2" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return <section className={`instrument-panel grid overflow-hidden border-[#151922] sm:grid-cols-2 ${columns}`}>{items.map((item, index) => <div key={item.label} className={`relative min-w-0 px-4 py-4 sm:px-5 ${index ? "border-t border-[#cdd2d7] sm:border-l sm:border-t-0" : ""}`}><div className="font-mono text-[8px] tracking-[.1em] text-[#7b8491]">{item.label.toUpperCase()}</div><div className={`mt-2 truncate text-[19px] font-semibold tracking-[-.035em] ${item.tone === "ok" ? "text-[#18724e]" : item.tone === "warn" ? "text-[#9a5c15]" : item.tone === "fail" ? "text-[#af4039]" : item.tone === "cobalt" ? "text-[#2e49c8]" : "text-[#151922]"}`}>{item.value}</div>{item.detail && <div className="mt-1 truncate font-mono text-[8.5px] text-[#828b97]">{item.detail}</div>}</div>)}</section>;
}

export function SectionHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5"><div className="flex min-w-0 items-baseline gap-2"><h2 className="truncate text-[12px] font-semibold text-[#25282d]">{title}</h2>{meta && <span className="hidden font-mono text-[9px] text-[#96999e] sm:inline">{meta}</span>}</div>{action}</div>;
}
