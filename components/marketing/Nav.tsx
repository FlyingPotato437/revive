"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ScrollProgress } from "./Motion";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#security", label: "Security" },
  { href: "/compare", label: "Why Revive" },
  { href: "/benchmarks", label: "Evidence" },
  { href: "/pricing", label: "Pricing" },
];

const REPO_URL = "https://github.com/FlyingPotato437/revive";

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 18));

  return (
    <motion.header className={`sticky top-0 z-50 border-b bg-[#f7f8f6]/90 backdrop-blur-md transition-colors ${scrolled ? "border-[#dfe2dc] shadow-[0_1px_0_rgba(21,25,34,0.03)]" : "border-[#e6e8e2]"}`}>
      <div className="mx-auto flex h-[62px] max-w-[1380px] items-center px-5 sm:px-8">
        <Link href="/" aria-label="Revive home" className="group flex items-center gap-3">
          <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
          <span className="text-[15px] font-semibold tracking-[-.035em] text-[#151922]">Revive</span>
          <span className="hidden font-mono text-[8px] tracking-[.1em] text-[#828a96] lg:inline">RECOVERY CONTROL PLANE</span>
        </Link>

        <nav className="ml-auto hidden h-full items-center md:flex" aria-label="Primary navigation">
          {LINKS.map((link) => {
            const active = !link.href.includes("#") && pathname === link.href;
            return <Link key={link.href} href={link.href} className={`relative flex h-full items-center border-l border-[#d6dadf] px-4 text-[11px] font-medium transition-colors last:border-r ${active ? "text-[#2e49c8]" : "text-[#66707e] hover:bg-white/70 hover:text-[#151922]"}`}>{active && <motion.span layoutId={reduceMotion ? undefined : "marketing-nav-active"} className="absolute inset-x-0 bottom-0 h-[3px] bg-[#4967f2]" />}<span>{link.label}</span></Link>;
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-5">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 px-2 text-[11px] font-medium text-[#66707e] transition-colors hover:text-[#151922] sm:inline-flex" aria-label="Revive on GitHub">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
            GitHub
          </a>
          <Link href="/login" className="hidden px-2 text-[11px] font-medium text-[#66707e] transition-colors hover:text-[#151922] sm:inline-flex">Log in</Link>
          <Link href="/app" className="inline-flex h-9 items-center rounded-[7px] bg-[#151922] px-4 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px"><span className="sm:hidden">Open lab</span><span className="hidden sm:inline">Open recovery lab</span></Link>
          <button onClick={() => setOpen((value) => !value)} className="ml-1 flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#d9ddd6] bg-transparent md:hidden" aria-label="Toggle navigation" aria-expanded={open}><span className="relative h-3.5 w-4"><motion.span animate={{ rotate: reduceMotion ? 0 : open ? 45 : 0, y: reduceMotion ? 0 : open ? 5 : 0 }} className="absolute left-0 top-0 h-px w-4 bg-[#151922]" /><motion.span animate={{ opacity: open ? 0 : 1 }} className="absolute left-0 top-[6px] h-px w-4 bg-[#151922]" /><motion.span animate={{ rotate: reduceMotion ? 0 : open ? -45 : 0, y: reduceMotion ? 0 : open ? -5 : 0 }} className="absolute bottom-0 left-0 h-px w-4 bg-[#151922]" /></span></button>
        </div>
      </div>

      <AnimatePresence>{open && <motion.nav initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="border-t border-[#cfd4da] bg-[#fbfcf8] px-5 py-2 md:hidden">{LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block border-b border-[#e1e4e7] py-3 text-[12px] font-medium text-[#4f5866] last:border-0">{link.label}</Link>)}<a href={REPO_URL} target="_blank" rel="noreferrer" className="block border-b border-[#e1e4e7] py-3 text-[12px] font-medium text-[#4f5866] last:border-0">GitHub</a></motion.nav>}</AnimatePresence>
      <ScrollProgress />
    </motion.header>
  );
}
