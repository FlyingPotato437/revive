"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/app", label: "Recovery lab", icon: "pulse" },
  { href: "/app/runs", label: "Recovery cases", icon: "runs" },
  { href: "/app/providers", label: "Connections", icon: "link" },
  { href: "/app/settings", label: "Workspace", icon: "settings" },
] as const;

export function AppChrome({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const initials = email.slice(0, 2).toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-console min-h-screen bg-[#f5f7fa] text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] flex-col border-r border-white/10 bg-[#10131a] px-3 py-4 md:flex">
        <Link href="/app" className="flex h-10 items-center gap-2.5 px-2 text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-cobalt text-[13px] font-semibold shadow-[0_0_0_1px_rgba(255,255,255,.12)]">
            R
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Revive</span>
          <span className="ml-auto rounded-[5px] border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/50">
            Beta
          </span>
        </Link>

        <div className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.045] p-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
            Workspace
          </div>
          <div className="mt-1 flex items-center gap-2 text-[13px] font-medium text-white/90">
            <span className="h-2 w-2 rounded-full bg-[#42d392] shadow-[0_0_0_3px_rgba(66,211,146,.12)]" />
            Local sandbox
          </div>
          <div className="mt-1 text-[11px] text-white/35">Durable state enabled</div>
        </div>

        <nav className="mt-5 space-y-1" aria-label="Console navigation">
          {NAV.map((item) => {
            const active =
              item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-[8px] px-3 text-[13px] transition ${
                  active
                    ? "bg-white/[0.09] font-medium text-white shadow-[inset_2px_0_0_#5874ff]"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white/85"
                }`}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="mb-3 rounded-[10px] border border-white/10 bg-white/[0.035] px-3 py-2.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-white/35">
              <span>Environment</span>
              <span className="text-[#42d392]">healthy</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/55">
              <span>Policy catalog</span>
              <span className="font-mono text-white/75">v0.2</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-white/55">
              <span>Event store</span>
              <span className="font-mono text-white/75">local</span>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenu((value) => !value)}
              className="flex w-full items-center gap-2.5 rounded-[9px] p-2 text-left transition hover:bg-white/[0.05]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/10 text-[11px] font-semibold text-white">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-white/85">{email}</span>
                <span className="block text-[10px] text-white/35">Developer workspace</span>
              </span>
              <span className="text-white/35">•••</span>
            </button>
            {menu && (
              <div className="absolute bottom-12 left-0 right-0 overflow-hidden rounded-[9px] border border-white/10 bg-[#1a1e27] p-1 shadow-2xl">
                <Link href="/" className="block rounded-[6px] px-3 py-2 text-[12px] text-white/65 hover:bg-white/[0.06] hover:text-white">
                  Marketing site
                </Link>
                <button onClick={logout} className="block w-full rounded-[6px] px-3 py-2 text-left text-[12px] text-[#ff8b85] hover:bg-white/[0.06]">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="md:pl-[244px]">
        <header className="sticky top-0 z-30 border-b border-hairline bg-white/90 backdrop-blur-xl">
          <div className="flex h-14 items-center px-4 sm:px-6 lg:px-8">
            <Link href="/app" className="flex items-center gap-2 text-[14px] font-semibold md:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-cobalt text-[12px] text-white">R</span>
              Revive
            </Link>
            <div className="hidden items-center gap-2 text-[12px] text-ink-faint md:flex">
              <span>Control plane</span>
              <span>/</span>
              <span className="text-ink-muted">revive-local</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-[6px] border border-hairline bg-paper-inset px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" /> sandbox
              </span>
              <span className="font-mono text-[11px] text-ink-faint">us-west-local</span>
            </div>
          </div>
          <nav className="flex overflow-x-auto border-t border-hairline px-3 md:hidden" aria-label="Mobile navigation">
            {NAV.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={`shrink-0 border-b-2 px-3 py-2.5 text-[12px] ${active ? "border-cobalt text-ink" : "border-transparent text-ink-faint"}`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function NavIcon({ name }: { name: (typeof NAV)[number]["icon"] }) {
  const common = { width: 17, height: 17, viewBox: "0 0 20 20", fill: "none" };
  if (name === "pulse") return <svg {...common}><path d="M3 10h3l1.5-4 3 8 2-5 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === "runs") return <svg {...common}><path d="M5 4.5h10M5 10h10M5 15.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="3" cy="4.5" r=".75" fill="currentColor"/><circle cx="3" cy="10" r=".75" fill="currentColor"/><circle cx="3" cy="15.5" r=".75" fill="currentColor"/></svg>;
  if (name === "link") return <svg {...common}><path d="M8 12l4-4M7 14H5.5a3.5 3.5 0 010-7H8m4 0h2.5a3.5 3.5 0 010 7H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  return <svg {...common}><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.5"/><path d="M16 10l1.5-1-1.5-2.6-1.8.4a6 6 0 00-1.2-.7L12.5 4h-3l-.5 2.1a6 6 0 00-1.2.7L6 6.4 4.5 9 6 10l-1.5 1L6 13.6l1.8-.4c.4.3.8.5 1.2.7l.5 2.1h3l.5-2.1c.4-.2.8-.4 1.2-.7l1.8.4 1.5-2.6L16 10z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>;
}
