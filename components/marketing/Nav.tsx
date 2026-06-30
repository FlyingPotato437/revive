"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { ScrollProgress } from "./Motion";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#architecture", label: "Architecture" },
  { href: "/compare", label: "Why Revive" },
  { href: "/security", label: "Security" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 18));
  return (
    <motion.header className={`sticky top-0 z-50 border-b transition-colors duration-300 ${scrolled ? "border-hairline bg-white/90 shadow-[0_1px_12px_rgba(20,25,34,.04)] backdrop-blur-xl" : "border-transparent bg-paper-base/70 backdrop-blur-md"}`}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5 sm:px-7">
        <Link href="/" aria-label="Revive home" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-ink text-[13px] font-semibold text-white shadow-sm">R</span>
          <span className="text-[15px] font-semibold tracking-[-.025em] text-ink">Revive</span>
          <span className="rounded-[5px] border border-hairline bg-white px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[.12em] text-ink-faint">Preview</span>
        </Link>
        <nav className="ml-12 hidden items-center gap-7 md:flex" aria-label="Primary navigation">
          {LINKS.map((link) => <Link key={link.href} href={link.href} className="text-[12px] font-medium text-ink-muted transition hover:text-ink">{link.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="hidden h-9 items-center rounded-[8px] px-3 text-[12px] font-medium text-ink-muted transition hover:bg-white hover:text-ink sm:inline-flex">Log in</Link>
          <Link href="/app" className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-ink px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#292f3a]">Open recovery lab <span aria-hidden>→</span></Link>
          <button onClick={() => setOpen((value) => !value)} className="ml-1 flex h-9 w-9 items-center justify-center rounded-[8px] border border-hairline bg-white md:hidden" aria-label="Toggle navigation" aria-expanded={open}>
            <span className="relative h-3.5 w-4"><motion.span animate={{ rotate: open ? 45 : 0, y: open ? 5 : 0 }} className="absolute left-0 top-0 h-px w-4 bg-ink" /><motion.span animate={{ opacity: open ? 0 : 1 }} className="absolute left-0 top-[6px] h-px w-4 bg-ink" /><motion.span animate={{ rotate: open ? -45 : 0, y: open ? -5 : 0 }} className="absolute bottom-0 left-0 h-px w-4 bg-ink" /></span>
          </button>
        </div>
      </div>
      <AnimatePresence>{open && <motion.nav initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-hairline bg-white md:hidden">{LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block border-b border-hairline px-6 py-3.5 text-[13px] text-ink-muted last:border-0">{link.label}</Link>)}</motion.nav>}</AnimatePresence>
      <ScrollProgress />
    </motion.header>
  );
}
