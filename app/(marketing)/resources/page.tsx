import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Resources | Revive",
  description: "Read Revive's recovery correctness whitepaper and integration documentation.",
};

const resources = [
  {
    href: "/resources/documentation",
    label: "Documentation",
    title: "Integrate the recovery loop.",
    body: "Install detection at an existing failure boundary, protect uncertain writes, and resume the original run after a human resolves the blocker.",
    action: "Open documentation",
  },
  {
    href: "/resources/whitepaper",
    label: "Whitepaper",
    title: "Inspect what Revive actually proves.",
    body: "Read the methodology, executable invariants, live-provider result, raw artifacts, and the claims the evidence does not support yet.",
    action: "Read the whitepaper",
  },
];

export default function ResourcesPage() {
  return <article className="min-h-[calc(100dvh-62px)] bg-[#f4f5f1] text-[#151922]">
    <header className="border-b border-[#151922]">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#4967f2]">RESOURCES</p>
        <h1 className="mt-6 max-w-[820px] text-[clamp(42px,6vw,76px)] font-semibold leading-[0.96] tracking-[-0.06em]">Build from the contract. Verify the claims.</h1>
        <p className="mt-7 max-w-[650px] text-[15px] leading-7 text-[#5f6876]">The integration guide explains how to ship Revive. The whitepaper shows exactly what its recovery guarantees cover.</p>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1240px] gap-px border-x border-b border-[#151922] bg-[#151922] md:grid-cols-[1.08fr_.92fr]">
      {resources.map((resource, index) => <Link key={resource.href} href={resource.href} className={`group flex min-h-[360px] flex-col justify-between p-7 transition-colors sm:p-10 ${index === 0 ? "bg-[#edf0ff] hover:bg-[#e2e7ff]" : "bg-[#fbfcf8] hover:bg-white"}`}>
        <div><span className="font-mono text-[9px] font-semibold tracking-[0.1em] text-[#596273]">{resource.label.toUpperCase()}</span><h2 className="mt-8 max-w-[460px] text-[clamp(30px,4vw,48px)] font-semibold leading-[1] tracking-[-0.05em]">{resource.title}</h2><p className="mt-6 max-w-[500px] text-[13px] leading-6 text-[#687180]">{resource.body}</p></div>
        <span className="mt-12 flex items-center justify-between border-t border-[#aeb5bd] pt-5 text-[11px] font-semibold text-[#2e49c8]"><span>{resource.action}</span><span aria-hidden className="transition-transform group-hover:translate-x-1">→</span></span>
      </Link>)}
    </div>
  </article>;
}
