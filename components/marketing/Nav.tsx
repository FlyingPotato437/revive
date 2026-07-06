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
        </Link>

        <nav className="ml-auto hidden h-full items-center md:flex" aria-label="Primary navigation">
          {LINKS.map((link) => {
            const active = !link.href.includes("#") && pathname === link.href;
            return <Link key={link.href} href={link.href} className={`relative flex h-full items-center border-l border-[#d6dadf] px-4 text-[11px] font-medium transition-colors last:border-r ${active ? "text-[#2e49c8]" : "text-[#66707e] hover:bg-white/70 hover:text-[#151922]"}`}>{active && <motion.span layoutId={reduceMotion ? undefined : "marketing-nav-active"} className="absolute inset-x-0 bottom-0 h-[3px] bg-[#4967f2]" />}<span>{link.label}</span></Link>;
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-5">
          <Link href="/login" className="hidden px-2 text-[11px] font-medium text-[#66707e] transition-colors hover:text-[#151922] sm:inline-flex">Log in</Link>
          <Link href="/app" className="inline-flex h-9 items-center rounded-[7px] bg-[#151922] px-4 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px"><span className="sm:hidden">Open lab</span><span className="hidden sm:inline">Open recovery lab</span></Link>
          <button onClick={() => setOpen((value) => !value)} className="ml-1 flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#d9ddd6] bg-transparent md:hidden" aria-label="Toggle navigation" aria-expanded={open}><span className="relative h-3.5 w-4"><motion.span animate={{ rotate: reduceMotion ? 0 : open ? 45 : 0, y: reduceMotion ? 0 : open ? 5 : 0 }} className="absolute left-0 top-0 h-px w-4 bg-[#151922]" /><motion.span animate={{ opacity: open ? 0 : 1 }} className="absolute left-0 top-[6px] h-px w-4 bg-[#151922]" /><motion.span animate={{ rotate: reduceMotion ? 0 : open ? -45 : 0, y: reduceMotion ? 0 : open ? -5 : 0 }} className="absolute bottom-0 left-0 h-px w-4 bg-[#151922]" /></span></button>
        </div>
      </div>

      <AnimatePresence>{open && <motion.nav initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="border-t border-[#cfd4da] bg-[#fbfcf8] px-5 py-2 md:hidden">{LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block border-b border-[#e1e4e7] py-3 text-[12px] font-medium text-[#4f5866] last:border-0">{link.label}</Link>)}</motion.nav>}</AnimatePresence>
      <ScrollProgress />
    </motion.header>
  );
}
