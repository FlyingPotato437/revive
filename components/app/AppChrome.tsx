"use client";

import Link from "next/link";
import { ArrowUpRight, Command, LinkSimple, ListBullets, MagnifyingGlass, Pulse, SlidersHorizontal } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/app", label: "Recovery lab", icon: Pulse, group: "Operate" },
  { href: "/app/runs", label: "Recovery cases", icon: ListBullets, group: "Operate" },
  { href: "/app/providers", label: "Connections", icon: LinkSimple, group: "Configure" },
  { href: "/app/settings", label: "Workspace", icon: SlidersHorizontal, group: "Configure" },
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

  return <div className="app-console min-h-[100dvh] text-[#151922]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-[#151922] bg-[#eef0eb] md:flex">
      <Link href="/app" className="flex h-[63px] items-center gap-3 border-b border-[#151922] px-4">
        <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
        <span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span>
        <span className="ml-auto font-mono text-[8px] tracking-[.1em] text-[#7b8491]">CONTROL</span>
      </Link>

      <div className="border-b border-[#cbd0d5] px-4 py-4">
        <div className="font-mono text-[8px] tracking-[.1em] text-[#7b8491]">WORKSPACE</div>
        <div className="mt-2 flex items-center justify-between"><div><div className="text-[11px] font-semibold text-[#272c34]">revive-local</div><div className="mt-0.5 text-[9px] text-[#7b8491]">Developer environment</div></div><span className="h-2 w-2 bg-[#148060]" aria-label="Workspace online" /></div>
      </div>

      <nav className="flex-1 px-2 py-5" aria-label="Console navigation">
        {["Operate", "Configure"].map((group) => <div key={group} className="mb-6"><div className="px-2 pb-2 font-mono text-[8px] tracking-[.12em] text-[#8a929d]">{group.toUpperCase()}</div>{NAV.filter((item) => item.group === group).map((item) => { const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href); const Icon = item.icon; return <Link key={item.href} href={item.href} className={`relative flex h-10 items-center gap-3 border px-3 text-[11.5px] font-medium transition-colors ${active ? "border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]" : "border-transparent text-[#596273] hover:border-[#c8cdd2] hover:bg-[#f8f9f5] hover:text-[#151922]"}`}>{active && <motion.span layoutId="app-nav" className="absolute -left-[3px] top-[8px] h-6 w-[3px] bg-[#4967f2]" />}<Icon size={15} weight="regular" />{item.label}</Link>; })}</div>)}
      </nav>

      <div className="border-t border-[#151922]">
        <div className="grid grid-cols-3 border-b border-[#cbd0d5] px-3 py-3 text-center"><Health label="STORE" value="ON" /><Health label="QUEUE" value="IDLE" /><Health label="POLICY" value="0.2" /></div>
        <div className="relative p-3"><button onClick={() => setUserMenu((value) => !value)} className="flex w-full items-center gap-2.5 border border-transparent p-1 text-left transition hover:border-[#c7ccd2] hover:bg-[#f8f9f5]"><span className="flex h-8 w-8 items-center justify-center border border-[#151922] bg-[#fbfcf8] font-mono text-[9px] font-semibold">{initials}</span><span className="min-w-0 flex-1 truncate text-[10.5px] text-[#596273]">{email}</span><span className="font-mono text-[10px] text-[#8a929d]">•••</span></button>{userMenu && <div className="absolute bottom-14 left-3 right-3 border border-[#151922] bg-[#fbfcf8] p-1 shadow-[8px_8px_0_#d9ddd6]"><Link href="/" className="flex items-center justify-between px-3 py-2 text-[10px] text-[#596273] hover:bg-[#eef0eb]">Marketing site <ArrowUpRight size={12} /></Link><button onClick={logout} className="block w-full px-3 py-2 text-left text-[10px] text-[#c2413a] hover:bg-[#fcedeb]">Sign out</button></div>}</div>
      </div>
    </aside>

    <div className="md:pl-[236px]">
      <header className="sticky top-0 z-30 border-b border-[#151922] bg-[#f4f5f1]/95 backdrop-blur-md">
        <div className="flex h-[63px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/app" className="flex items-center gap-2.5 text-[14px] font-semibold md:hidden"><span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>Revive</Link>
          <div className="hidden min-w-0 items-center gap-2 text-[10.5px] md:flex"><span className="font-mono text-[8px] tracking-[.1em] text-[#8a929d]">CONTROL PLANE</span><span className="text-[#b2b8bf]">/</span><span className="truncate font-semibold text-[#333943]">{title}</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setCommands(true)} className="hidden h-9 min-w-[230px] items-center gap-2 border border-[#c8cdd2] bg-[#fbfcf8] px-3 text-left text-[10px] text-[#818a96] transition hover:border-[#151922] sm:flex"><MagnifyingGlass size={13} /><span className="flex-1">Search or jump to</span><kbd className="flex items-center gap-0.5 border border-[#d1d6db] bg-[#eef0eb] px-1.5 py-0.5 font-mono text-[8px]"><Command size={9} />K</kbd></button>
            <span className="hidden items-center gap-2 border-l border-[#cbd0d5] pl-3 font-mono text-[8px] tracking-[.09em] text-[#67717f] lg:flex"><span className="h-2 w-2 bg-[#148060]" />SANDBOX</span>
            <Link href="/app" className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">New drill</Link>
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-[#cfd4da] px-2 md:hidden" aria-label="Mobile navigation">{NAV.map((item) => { const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={`shrink-0 border-b-[3px] px-3 py-2.5 text-[10.5px] ${active ? "border-[#4967f2] text-[#2e49c8]" : "border-transparent text-[#737c89]"}`}>{item.label}</Link>; })}</nav>
      </header>
      <main>{children}</main>
    </div>

    <AnimatePresence>{commands && <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-start justify-center bg-[#151922]/30 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={() => setCommands(false)}><motion.div initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-[520px] border border-[#151922] bg-[#fbfcf8] shadow-[12px_12px_0_#d9ddd6]"><div className="flex h-13 items-center gap-3 border-b border-[#151922] px-4 py-3"><MagnifyingGlass size={15} /><input autoFocus placeholder="Jump to a page" className="h-full flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#939ba6]" /><kbd className="font-mono text-[9px] text-[#818a96]">ESC</kbd></div><div className="p-2"><div className="px-2 pb-2 pt-1 font-mono text-[8px] tracking-[.12em] text-[#8a929d]">NAVIGATION</div>{NAV.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setCommands(false)} className="flex items-center gap-3 border border-transparent px-3 py-2.5 text-[11px] text-[#4f5866] hover:border-[#c8cdd2] hover:bg-[#eef0eb] hover:text-[#151922]"><Icon size={15} />{item.label}<span className="ml-auto font-mono text-[8px] text-[#9ba2ab]">↵</span></Link>; })}</div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}

function Health({ label, value }: { label: string; value: string }) { return <div className="border-r border-[#cbd0d5] px-1 last:border-0"><div className="font-mono text-[7px] text-[#8a929d]">{label}</div><div className="mt-1 font-mono text-[8px] font-semibold text-[#3f4854]">{value}</div></div>; }
