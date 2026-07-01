import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="relative flex flex-col gap-5 border-b border-[#d6d8d2] pb-6 lg:flex-row lg:items-end lg:justify-between"><div className="relative pl-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[2px] before:bg-[#5065e8]"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.16em] text-[#5065e8]"><span className="font-mono text-[8px] text-[#a0a3a8]">R/01</span>{eyebrow}</div><h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-.04em] text-[#17191d] sm:text-[32px]">{title}</h1>{description && <p className="mt-2 max-w-[720px] text-[13px] leading-5 text-[#686d75]">{description}</p>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}<div className="coordinate-rule absolute -bottom-[5px] left-0 w-32" /></header>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "fail" | "cobalt" }) {
  const tones = { neutral: "border-[#dfe0dc] bg-[#f1f2ee] text-[#62666d]", ok: "border-[#cbe3d7] bg-[#edf8f2] text-[#18724e]", warn: "border-[#ead9ba] bg-[#fff7e8] text-[#9a5c15]", fail: "border-[#edceca] bg-[#fff0ee] text-[#af4039]", cobalt: "border-[#d4d9fa] bg-[#f0f2ff] text-[#465bd5]" };
  return <span className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${tones[tone]}`}>{children}</span>;
}

export function SummaryStrip({ items }: { items: Array<{ label: string; value: string; detail?: string; tone?: "ok" | "warn" | "fail" | "cobalt" }> }) {
  return <section className="instrument-panel evidence-plate grid overflow-hidden rounded-[8px] sm:grid-cols-2 lg:grid-cols-4">{items.map((item, index) => <div key={item.label} className={`relative min-w-0 px-4 py-4 sm:px-5 ${index ? "border-t border-[#e2e3de] sm:border-l sm:border-t-0" : ""}`}><span className="absolute right-2 top-2 font-mono text-[7px] text-[#c0c2bd]">0{index + 1}</span><div className="text-[8.5px] font-semibold uppercase tracking-[.13em] text-[#85898e]">{item.label}</div><div className={`mt-2 truncate text-[18px] font-semibold tracking-[-.025em] ${item.tone === "ok" ? "text-[#18724e]" : item.tone === "warn" ? "text-[#9a5c15]" : item.tone === "fail" ? "text-[#af4039]" : item.tone === "cobalt" ? "text-[#465bd5]" : "text-[#17191d]"}`}>{item.value}</div>{item.detail && <div className="mt-1 truncate font-mono text-[9px] text-[#92969b]">{item.detail}</div>}</div>)}</section>;
}

export function SectionHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5"><div className="flex min-w-0 items-baseline gap-2"><h2 className="truncate text-[12px] font-semibold text-[#25282d]">{title}</h2>{meta && <span className="hidden font-mono text-[9px] text-[#96999e] sm:inline">{meta}</span>}</div>{action}</div>;
}
