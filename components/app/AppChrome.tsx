"use client";

import Link from "next/link";
import {
  ArrowSquareOut, Buildings, CaretDown, Check, Command, Flask,
  FolderSimple, Gauge, Key, LinkSimple, ListBullets, MagnifyingGlass,
  RocketLaunch, UserCircle, UsersThree, Wallet,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type WorkspaceOption = { id: string; name: string; organization: string };

const OPERATIONS = [
  { href: "/app/overview", label: "Overview", icon: Gauge },
  { href: "/app/quickstart", label: "Quickstart", icon: RocketLaunch },
  { href: "/app", label: "Recovery lab", icon: Flask },
  { href: "/app/runs", label: "Recovery cases", icon: ListBullets },
  { href: "/app/providers", label: "Connections", icon: LinkSimple },
] as const;

const ACCOUNT = [
  { href: "/app/account", label: "Account", icon: UserCircle },
  { href: "/app/organization", label: "Organization", icon: Buildings },
  { href: "/app/projects", label: "Projects", icon: FolderSimple },
  { href: "/app/api-keys", label: "API keys", icon: Key },
  { href: "/app/usage", label: "Usage", icon: Wallet },
] as const;

const NAV = [...OPERATIONS, ...ACCOUNT] as const;
const TITLES: Record<string, string> = Object.fromEntries(NAV.map((item) => [item.href, item.label]));

export function AppChrome({
  email, workspaces, currentWorkspace, children,
}: {
  email: string;
  workspaces: WorkspaceOption[];
  currentWorkspace: WorkspaceOption;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userMenu, setUserMenu] = useState(false);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [commands, setCommands] = useState(false);
  const [switching, setSwitching] = useState(false);
  const reduceMotion = useReducedMotion();
  const initials = email.slice(0, 2).toUpperCase();
  const title = pathname.startsWith("/app/runs/") ? "Recovery case" : TITLES[pathname] || "Control plane";

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommands((value) => !value);
      }
      if (event.key === "Escape") {
        setCommands(false);
        setUserMenu(false);
        setWorkspaceMenu(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === currentWorkspace.id) {
      setWorkspaceMenu(false);
      return;
    }
    setSwitching(true);
    const response = await fetch("/api/workspaces/select", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }),
    });
    setSwitching(false);
    if (response.ok) {
      setWorkspaceMenu(false);
      router.refresh();
    }
  }

  return <div className="app-console min-h-[100dvh] text-[#151922]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#151922] bg-[#eef0eb] md:flex">
      <Link href="/app/overview" className="flex h-[63px] items-center gap-3 border-b border-[#151922] px-4">
        <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
        <span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span>
        <span className="ml-auto font-mono text-[8px] tracking-[.1em] text-[#7b8491]">LAB</span>
      </Link>

      <div className="relative border-b border-[#151922] p-2.5">
        <button
          onClick={() => setWorkspaceMenu((value) => !value)}
          aria-expanded={workspaceMenu}
          className="flex w-full items-center gap-3 border border-[#bfc5cc] bg-[#fbfcf8] px-3 py-2.5 text-left transition hover:border-[#151922]"
        >
          <span className="flex h-7 w-7 items-center justify-center border border-[#bfc5cc] bg-[#edf0ff] text-[#2e49c8]"><UsersThree size={14} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[10.5px] font-semibold">{currentWorkspace.name}</span><span className="mt-0.5 block truncate font-mono text-[7.5px] text-[#7b8491]">{currentWorkspace.organization}</span></span>
          <CaretDown size={11} className={`transition ${workspaceMenu ? "rotate-180" : ""}`} />
        </button>
        {workspaceMenu && <div className="absolute left-2.5 right-2.5 top-[62px] z-20 border border-[#151922] bg-[#fbfcf8] p-1 shadow-[7px_7px_0_#d9ddd6]">
          <div className="px-2 py-2 font-mono text-[7.5px] tracking-[.1em] text-[#8a929d]">WORKSPACES</div>
          {workspaces.map((workspace) => <button key={workspace.id} disabled={switching} onClick={() => switchWorkspace(workspace.id)} className="flex w-full items-center gap-2 px-2 py-2 text-left text-[10px] hover:bg-[#eef0eb] disabled:opacity-50"><span className="min-w-0 flex-1 truncate">{workspace.name}</span>{workspace.id === currentWorkspace.id && <Check size={12} className="text-[#2e49c8]" />}</button>)}
          <Link href="/app/organization" onClick={() => setWorkspaceMenu(false)} className="mt-1 flex items-center justify-between border-t border-[#d8dde3] px-2 py-2 text-[9.5px] text-[#596273] hover:bg-[#eef0eb]">Manage workspaces <ArrowSquareOut size={11} /></Link>
        </div>}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-2 py-3" aria-label="Console navigation">
        <NavGroup label="Operations" items={OPERATIONS} pathname={pathname} />
        <NavGroup label="Account" items={ACCOUNT} pathname={pathname} />
      </nav>

      <div className="border-t border-[#151922] p-3">
        <div className="relative">
          <button onClick={() => setUserMenu((value) => !value)} className="flex w-full items-center gap-2.5 border border-transparent p-1 text-left transition hover:border-[#c7ccd2] hover:bg-[#f8f9f5]">
            <span className="flex h-8 w-8 items-center justify-center border border-[#151922] bg-[#fbfcf8] font-mono text-[9px] font-semibold">{initials}</span>
            <span className="min-w-0 flex-1 truncate text-[10.5px] text-[#596273]">{email}</span>
            <span className="font-mono text-[10px] text-[#8a929d]">•••</span>
          </button>
          {userMenu && <div className="absolute bottom-12 left-0 right-0 border border-[#151922] bg-[#fbfcf8] p-1 shadow-[7px_7px_0_#d9ddd6]"><Link href="/" className="flex items-center justify-between px-3 py-2 text-[10px] text-[#596273] hover:bg-[#eef0eb]">Marketing site <ArrowSquareOut size={12} /></Link><button onClick={logout} className="block w-full px-3 py-2 text-left text-[10px] text-[#c2413a] hover:bg-[#fcedeb]">Sign out</button></div>}
        </div>
      </div>
    </aside>

    <div className="md:pl-[248px]">
      <header className="sticky top-0 z-30 border-b border-[#151922] bg-[#f4f5f1]/95 backdrop-blur-md">
        <div className="flex h-[63px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/app/overview" className="flex items-center gap-2.5 text-[14px] font-semibold md:hidden"><span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>Revive</Link>
          <div className="hidden min-w-0 items-center gap-2 text-[10.5px] md:flex"><span className="font-mono text-[8px] tracking-[.1em] text-[#8a929d]">{currentWorkspace.name.toUpperCase()}</span><span className="text-[#b2b8bf]">/</span><span className="truncate font-semibold text-[#333943]">{title}</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setCommands(true)} className="hidden h-9 min-w-[230px] items-center gap-2 border border-[#c8cdd2] bg-[#fbfcf8] px-3 text-left text-[10px] text-[#818a96] transition hover:border-[#151922] sm:flex"><MagnifyingGlass size={13} /><span className="flex-1">Search or jump to</span><kbd className="flex items-center gap-0.5 border border-[#d1d6db] bg-[#eef0eb] px-1.5 py-0.5 font-mono text-[8px]"><Command size={9} />K</kbd></button>
            <span className="hidden border-l border-[#cbd0d5] pl-3 font-mono text-[8px] tracking-[.09em] text-[#67717f] lg:flex">LOCAL SANDBOX</span>
            <Link href="/app" className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">New drill</Link>
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-[#cfd4da] px-2 md:hidden" aria-label="Mobile navigation">{NAV.map((item) => { const active = isActive(item.href, pathname); return <Link key={item.href} href={item.href} className={`shrink-0 border-b-[3px] px-3 py-2.5 text-[10.5px] ${active ? "border-[#4967f2] text-[#2e49c8]" : "border-transparent text-[#737c89]"}`}>{item.label}</Link>; })}</nav>
      </header>
      <main>{children}</main>
    </div>

    <AnimatePresence>{commands && <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-start justify-center bg-[#151922]/30 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={() => setCommands(false)}><motion.div initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-[520px] border border-[#151922] bg-[#fbfcf8] shadow-[12px_12px_0_#d9ddd6]"><div className="flex items-center gap-3 border-b border-[#151922] px-4 py-3"><MagnifyingGlass size={15} /><input autoFocus placeholder="Jump to a page" className="h-full flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#939ba6]" /><kbd className="font-mono text-[9px] text-[#818a96]">ESC</kbd></div><div className="max-h-[60vh] overflow-y-auto p-2">{NAV.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setCommands(false)} className="flex items-center gap-3 border border-transparent px-3 py-2.5 text-[11px] text-[#4f5866] hover:border-[#c8cdd2] hover:bg-[#eef0eb] hover:text-[#151922]"><Icon size={15} />{item.label}<span className="ml-auto font-mono text-[8px] text-[#9ba2ab]">↵</span></Link>; })}</div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}

function NavGroup({ label, items, pathname }: { label: string; items: readonly { href: string; label: string; icon: React.ComponentType<{ size?: number }> }[]; pathname: string }) {
  return <div className="mb-3 last:mb-0"><div className="px-2 pb-1.5 pt-1 font-mono text-[7.5px] tracking-[.12em] text-[#8a929d]">{label.toUpperCase()}</div>{items.map((item) => { const active = isActive(item.href, pathname); const Icon = item.icon; return <Link key={item.href} href={item.href} className={`relative mb-0.5 flex h-8 items-center gap-2.5 border px-2.5 text-[10.5px] font-medium transition-colors ${active ? "border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]" : "border-transparent text-[#596273] hover:border-[#c8cdd2] hover:bg-[#f8f9f5] hover:text-[#151922]"}`}>{active && <motion.span layoutId="app-nav" className="absolute -left-[3px] top-[6px] h-5 w-[3px] bg-[#4967f2]" />}<Icon size={14} />{item.label}</Link>; })}</div>;
}

function isActive(href: string, pathname: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
