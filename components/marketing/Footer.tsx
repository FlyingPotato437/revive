import Link from "next/link";

const links = [
  { label: "Product", href: "/#product" },
  { label: "Why Revive", href: "/compare" },
  { label: "Evidence", href: "/benchmarks" },
  { label: "Team", href: "/team" },
  { label: "Recovery lab", href: "/app" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

export function Footer() {
  return <footer className="border-t border-[#151922] bg-[#eef0eb] text-[#151922]"><div className="mx-auto max-w-[1380px] px-5 py-12 sm:px-8"><div className="grid gap-10 md:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-3"><span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span><span className="text-[15px] font-semibold tracking-[-.03em]">Revive</span></div><p className="mt-4 max-w-[430px] text-[11.5px] leading-5 text-[#687180]">Credential recovery infrastructure for durable agent workflows. Reauthorize safely and continue the original run.</p></div><nav className="grid grid-cols-2 gap-x-10 gap-y-3 sm:flex sm:gap-7">{links.map((link) => <Link key={link.href} href={link.href} className="text-[11px] text-[#66707e] transition hover:text-[#2e49c8]">{link.label}</Link>)}</nav></div><div className="mt-10 flex flex-col gap-3 border-t border-[#cbd0d5] pt-5 font-mono text-[8.5px] tracking-[.08em] text-[#7b8491] sm:flex-row sm:items-center sm:justify-between"><span>© 2026 REVIVE LABS</span><span>LOCAL SANDBOX OPERATIONAL</span></div></div></footer>;
}
