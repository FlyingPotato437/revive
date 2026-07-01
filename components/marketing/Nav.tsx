"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 18));

  return <motion.header className="sticky top-0 z-50 bg-[#0d1118]/88 px-3 py-2 backdrop-blur-xl sm:px-5">
    <div className={`marketing-nav-rail mx-auto flex h-12 max-w-[1380px] items-center rounded-[14px] px-2.5 transition-shadow sm:px-3 ${scrolled ? "shadow-[0_18px_48px_-30px_rgba(0,0,0,.95)]" : ""}`}>
      <Link href="/" aria-label="Revive home" className="group flex min-w-0 items-center gap-2.5">
        <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
        <span className="text-[15px] font-semibold tracking-[-.03em] text-[#eef0ed]">Revive</span>
        <span className="hidden h-4 w-px bg-white/10 lg:block" />
        <span className="hidden font-mono text-[8px] uppercase tracking-[.1em] text-[#697386] lg:block">Recovery control plane</span>
      </Link>

      <nav className="marketing-nav-switch ml-auto hidden items-center rounded-[10px] p-1 md:flex" aria-label="Primary navigation">
        {LINKS.map((link) => {
          const active = !link.href.includes("#") && pathname === link.href;
          return <Link key={link.href} href={link.href} className={`relative flex h-7 items-center rounded-[7px] px-3 text-[10.5px] font-medium transition ${active ? "text-[#eef0ed]" : "text-[#87909f] hover:text-[#d9dcda]"}`}>{active && <motion.span layoutId={reduceMotion ? undefined : "marketing-nav-active"} className="absolute inset-0 rounded-[7px] border border-white/10 bg-white/[.07] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]" />}<span className="relative">{link.label}</span></Link>;
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5 md:ml-3">
        <Link href="/login" className="hidden h-8 items-center rounded-[8px] px-3 text-[10.5px] font-medium text-[#818b9a] transition hover:bg-white/[.04] hover:text-white sm:inline-flex">Log in</Link>
        <Link href="/app" className="inline-flex h-8 items-center rounded-[8px] bg-[#6f83ff] px-3 text-[10.5px] font-semibold text-[#0d1118] transition hover:bg-[#8294ff] active:translate-y-px"><span className="sm:hidden">Open lab</span><span className="hidden sm:inline">Open recovery lab</span></Link>
        <button onClick={() => setOpen((value) => !value)} className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/12 bg-white/[.035] md:hidden" aria-label="Toggle navigation" aria-expanded={open}><span className="relative h-3.5 w-4"><motion.span animate={{ rotate: reduceMotion ? 0 : open ? 45 : 0, y: reduceMotion ? 0 : open ? 5 : 0 }} className="absolute left-0 top-0 h-px w-4 bg-white" /><motion.span animate={{ opacity: open ? 0 : 1 }} className="absolute left-0 top-[6px] h-px w-4 bg-white" /><motion.span animate={{ rotate: reduceMotion ? 0 : open ? -45 : 0, y: reduceMotion ? 0 : open ? -5 : 0 }} className="absolute bottom-0 left-0 h-px w-4 bg-white" /></span></button>
      </div>
    </div>

    <AnimatePresence>{open && <motion.nav initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="marketing-nav-rail mx-auto mt-2 max-w-[1380px] overflow-hidden rounded-[14px] p-1.5 md:hidden">{LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block rounded-[9px] px-4 py-3 text-[12px] text-[#a9b0ba] transition hover:bg-white/[.05] hover:text-white">{link.label}</Link>)}</motion.nav>}</AnimatePresence>
    <ScrollProgress />
  </motion.header>;
}
