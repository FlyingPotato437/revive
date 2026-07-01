"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/app", label: "Recovery lab", icon: "pulse", group: "Operate" },
  { href: "/app/runs", label: "Recovery cases", icon: "runs", group: "Operate" },
  { href: "/app/providers", label: "Connections", icon: "link", group: "Configure" },
  { href: "/app/settings", label: "Workspace", icon: "settings", group: "Configure" },
] as const;

const TITLES: Record<string, string> = { "/app": "Recovery lab", "/app/runs": "Recovery cases", "/app/providers": "Connections", "/app/settings": "Workspace" };

export function AppChrome({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userMenu, setUserMenu] = useState(false);
  const [commands, setCommands] = useState(false);
  const reduceMotion = useReducedMotion();
  const initials = email.slice(0, 2).toUpperCase();
  const title = pathname.startsWith("/app/runs/") ? "Recovery case" : TITLES[pathname] || "Control plane";

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommands((value) => !value); }
      if (event.key === "Escape") { setCommands(false); setUserMenu(false); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }

  return <div className="app-console min-h-screen bg-[#f6f6f2] text-[#17191d]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] flex-col border-r border-white/[.08] bg-[#11141a] md:flex">
      <Link href="/app" className="flex h-[58px] items-center gap-2.5 border-b border-white/[.08] px-4 text-white"><span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#5065e8] text-[12px] font-bold">R</span><span className="text-[15px] font-semibold tracking-[-.025em]">Revive</span><span className="ml-auto font-mono text-[8px] uppercase tracking-[.12em] text-white/30">control</span></Link>
      <div className="border-b border-white/[.08] px-4 py-3"><div className="flex items-center justify-between"><div><div className="text-[10px] font-medium text-white/70">revive-local</div><div className="mt-0.5 text-[9px] text-white/30">Developer workspace</div></div><span className="h-1.5 w-1.5 rounded-full bg-[#3cb87d] shadow-[0_0_0_3px_rgba(60,184,125,.12)]" /></div></div>
      <nav className="flex-1 px-2 py-4" aria-label="Console navigation">{["Operate", "Configure"].map((group) => <div key={group} className="mb-5"><div className="px-2 pb-1.5 text-[8px] font-semibold uppercase tracking-[.16em] text-[#737b88]">{group}</div>{NAV.filter((item) => item.group === group).map((item) => { const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={`relative flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[11.5px] transition ${active ? "bg-white/[.075] text-white" : "text-[#b7bdc8] hover:bg-white/[.04] hover:text-white"}`}>{active && <motion.span layoutId="app-nav" className="absolute -left-2 h-5 w-[2px] rounded-r bg-[#7386ff]" />}<NavIcon name={item.icon} />{item.label}</Link>; })}</div>)}</nav>
      <div className="border-t border-white/[.08] px-3 py-3"><div className="mb-2 space-y-1 px-1.5 text-[9px]"><Health label="Event store" value="online" /><Health label="Delivery queue" value="idle" /><Health label="Policy" value="v0.2" /></div><div className="relative"><button onClick={() => setUserMenu((v) => !v)} className="flex w-full items-center gap-2.5 rounded-[7px] p-1.5 text-left hover:bg-white/[.05]"><span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-white/[.08] text-[9px] font-semibold text-white">{initials}</span><span className="min-w-0 flex-1 truncate text-[10.5px] text-white/65">{email}</span><span className="text-[11px] text-white/25">•••</span></button>{userMenu && <div className="absolute bottom-10 left-0 right-0 rounded-[7px] border border-white/10 bg-[#1c2028] p-1 shadow-2xl"><Link href="/" className="block rounded-[5px] px-2.5 py-2 text-[10px] text-white/55 hover:bg-white/[.05]">Marketing site</Link><button onClick={logout} className="block w-full rounded-[5px] px-2.5 py-2 text-left text-[10px] text-[#ff9b94] hover:bg-white/[.05]">Sign out</button></div>}</div></div>
    </aside>

    <div className="md:pl-[228px]"><header className="sticky top-0 z-30 border-b border-[#dedfda] bg-[#fbfbf8]/92 backdrop-blur-xl"><div className="flex h-[52px] items-center gap-3 px-4 sm:px-6 lg:px-8"><Link href="/app" className="flex items-center gap-2 text-[13px] font-semibold md:hidden"><span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#5065e8] text-[11px] text-white">R</span>Revive</Link><div className="hidden min-w-0 items-center gap-2 text-[10.5px] md:flex"><span className="text-[#999ca0]">Control plane</span><span className="text-[#c1c3bf]">/</span><span className="truncate font-medium text-[#393c41]">{title}</span></div><div className="ml-auto flex items-center gap-2"><button onClick={() => setCommands(true)} className="hidden h-8 min-w-[210px] items-center gap-2 rounded-[6px] border border-[#dddeda] bg-white px-2.5 text-left text-[10px] text-[#92959a] shadow-[0_1px_1px_rgba(20,24,32,.03)] sm:flex"><SearchIcon /><span className="flex-1">Search or jump to…</span><kbd className="rounded border border-[#e2e3df] bg-[#f5f5f1] px-1.5 py-0.5 font-mono text-[8px] text-[#888b90]">⌘K</kbd></button><span className="hidden items-center gap-1.5 border-l border-[#dddeda] pl-3 text-[9px] font-medium uppercase tracking-[.09em] text-[#71757b] lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#22845a]" />sandbox</span><Link href="/app" className="inline-flex h-8 items-center rounded-[6px] bg-[#171a20] px-3 text-[10px] font-semibold text-white hover:bg-[#292d35]">New drill</Link></div></div><nav className="flex overflow-x-auto border-t border-[#e6e7e3] px-2 md:hidden" aria-label="Mobile navigation">{NAV.map((item) => { const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={`shrink-0 border-b-2 px-3 py-2 text-[10.5px] ${active ? "border-[#5065e8] text-[#202329]" : "border-transparent text-[#85898f]"}`}>{item.label}</Link>; })}</nav></header><main>{children}</main></div>

    <AnimatePresence>{commands && <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-start justify-center bg-[#11141a]/35 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={() => setCommands(false)}><motion.div initial={reduceMotion ? false : { opacity: 0, y: -8, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-[520px] overflow-hidden rounded-[10px] border border-[#d9dad6] bg-white shadow-[0_30px_80px_-20px_rgba(17,20,26,.38)]"><div className="flex h-12 items-center gap-3 border-b border-[#e4e5e1] px-4"><SearchIcon /><input autoFocus placeholder="Jump to a page" className="h-full flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#a1a4a8]" /><kbd className="font-mono text-[9px] text-[#9a9da1]">ESC</kbd></div><div className="p-2"><div className="px-2 pb-1 pt-1 text-[8px] font-semibold uppercase tracking-[.14em] text-[#9a9da1]">Navigation</div>{NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setCommands(false)} className="flex items-center gap-3 rounded-[6px] px-2.5 py-2.5 text-[11px] text-[#4d5158] hover:bg-[#f4f4f0] hover:text-[#17191d]"><NavIcon name={item.icon} />{item.label}<span className="ml-auto font-mono text-[8px] text-[#a5a8ac]">↵</span></Link>)}</div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}

function Health({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between text-white/52"><span>{label}</span><span className="font-mono text-white/72">{value}</span></div>; }
function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M12.4 12.4L16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function NavIcon({ name }: { name: (typeof NAV)[number]["icon"] }) { const common = { width: 15, height: 15, viewBox: "0 0 20 20", fill: "none" }; if (name === "pulse") return <svg {...common}><path d="M2.5 10h3l1.8-4.5 3.1 9 2.1-5.5 1.4 1H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>; if (name === "runs") return <svg {...common}><path d="M5 4.5h11M5 10h11M5 15.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="2.8" cy="4.5" r=".8" fill="currentColor"/><circle cx="2.8" cy="10" r=".8" fill="currentColor"/><circle cx="2.8" cy="15.5" r=".8" fill="currentColor"/></svg>; if (name === "link") return <svg {...common}><path d="M7.5 12.5l5-5M7 14H5a3.5 3.5 0 010-7h2.5m5.5 0h2a3.5 3.5 0 010 7h-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; return <svg {...common}><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M16 10l1.3-1-1.4-2.4-1.7.4c-.4-.3-.8-.5-1.2-.7L12.5 4h-5L7 6.3c-.4.2-.8.4-1.2.7l-1.7-.4L2.7 9 4 10l-1.3 1 1.4 2.4 1.7-.4c.4.3.8.5 1.2.7l.5 2.3h5l.5-2.3c.4-.2.8-.4 1.2-.7l1.7.4 1.4-2.4L16 10z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>; }
