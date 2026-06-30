import Link from "next/link";

const links = [
  { label: "Product", href: "/#product" },
  { label: "Architecture", href: "/#architecture" },
  { label: "Why Revive", href: "/compare" },
  { label: "Security", href: "/security" },
  { label: "Recovery lab", href: "/app" },
];

export function Footer() {
  return <footer className="border-t border-white/10 bg-[#10131a] text-white"><div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-7"><div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-cobalt text-[13px] font-semibold">R</span><span className="text-[15px] font-semibold tracking-[-.02em]">Revive</span></div><p className="mt-4 max-w-[430px] text-[12px] leading-5 text-white/45">Credential recovery infrastructure for durable agent workflows. Bind identity failures to affected runs, reauthorize safely, and replay the failed action once.</p></div><nav className="grid grid-cols-2 gap-x-10 gap-y-3 sm:flex sm:gap-7">{links.map((link) => <Link key={link.href} href={link.href} className="text-[11px] text-white/45 transition hover:text-white">{link.label}</Link>)}</nav></div><div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-[9.5px] uppercase tracking-[.1em] text-white/25 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 Revive Labs · Developer preview</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#42d392]" />Local sandbox operational</span></div></div></footer>;
}
