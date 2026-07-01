import type { ReactNode } from "react";

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
