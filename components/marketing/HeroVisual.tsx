"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const phases = [
  {
    key: "failure",
    system: "Identity",
    title: "Grant rejected",
    body: "The provider returns a terminal credential error.",
  },
  {
    key: "human",
    system: "Account owner",
    title: "Access reconnected",
    body: "A person securely restores access once.",
  },
  {
    key: "lease",
    system: "Revive",
    title: "Lease rotated",
    body: "Stale workers are fenced from generation 2.",
  },
  {
    key: "resume",
    system: "Runtime",
    title: "Run continues",
    body: "The same execution resumes at checkpoint 05.",
  },
] as const;

export function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(reduceMotion ? phases.length - 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(phases.length - 1);
      return;
    }
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % phases.length), 1650);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const current = phases[phase];

  return <motion.div initial={reduceMotion ? false : { opacity: 0, x: 26, scale: .985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: .9, delay: .12, ease: [0.22, 1, 0.36, 1] }} className="relative lg:translate-x-8">
    <div className="home-glass-orb home-glass-orb-one" />
    <div className="home-glass-orb home-glass-orb-two" />

    <section className="home-liquid-shell relative overflow-hidden rounded-[18px] p-3 sm:p-4" aria-label="Animated recovery handoff">
      <div className="home-liquid-highlight pointer-events-none absolute inset-x-8 top-0 h-px" />
      <header className="flex items-center justify-between px-2 pb-3 pt-1">
        <div><div className="font-mono text-[8px] uppercase tracking-[.15em] text-[#9ca8c8]">Recovery handoff</div><div className="mt-1 text-[11px] font-medium text-[#e9ece9]">Nightly executive briefing</div></div>
        <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.1em] text-[#8390a7]"><span className="h-1.5 w-1.5 rounded-full bg-[#6f83ff]" />live sequence</div>
      </header>

      <div className="home-liquid-panel relative overflow-hidden rounded-[14px] p-4 sm:p-5">
        <div className="home-coordinate-field pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative grid gap-4 sm:grid-cols-[.8fr_1.2fr]">
          <div className="hidden rounded-[12px] border border-white/10 bg-[#0c111a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:block">
            <div className="font-mono text-[8px] uppercase tracking-[.12em] text-[#d1726d]">Access interruption</div>
            <div className="mt-3 font-mono text-[13px] text-[#f1f2ef]">AADSTS700082</div>
            <p className="mt-2 text-[10px] leading-4 text-[#8f98a7]">Refresh token expired. The run is parked before the next remote action.</p>
            <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#8294ff]/40 bg-[#8294ff]/10 text-[9px] font-semibold text-[#b9c2ff]">AO</div>
              <div className="min-w-0"><div className="text-[10px] font-medium text-[#e4e7e4]">Account owner</div><div className="mt-0.5 text-[8px] text-[#7f8998]">one secure action</div></div>
              <motion.span animate={{ opacity: phase === 1 ? [0.35, 1, 0.35] : 0.35 }} transition={{ duration: 1.2, repeat: phase === 1 && !reduceMotion ? Infinity : 0 }} className="ml-auto h-2 w-2 rounded-full bg-[#6f83ff]" />
            </div>
          </div>

          <div className="flex min-h-[188px] flex-col rounded-[12px] border border-white/10 bg-white/[.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-xl">
            <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[.11em] text-[#778193]"><span>Current transition</span><span>{phase + 1} / {phases.length}</span></div>
            <div className="flex flex-1 items-center">
              <motion.div key={current.key} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
                <div className="font-mono text-[8px] uppercase tracking-[.12em] text-[#91a0ff]">{current.system}</div>
                <div className="mt-2 text-[22px] font-semibold tracking-[-.04em] text-[#f0f2ef]">{current.title}</div>
                <p className="mt-2 max-w-[280px] text-[10px] leading-4 text-[#9099a8]">{current.body}</p>
              </motion.div>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[8px] text-[#7c8695]"><span>run_7f2</span><span className="font-mono">generation {phase >= 2 ? "2" : "1"}</span></div>
          </div>
        </div>

        <ol className="relative mt-5 grid grid-cols-4 gap-2" aria-hidden="true">
          <div className="absolute left-[10%] right-[10%] top-[9px] h-px bg-white/10" />
          <motion.div className="absolute left-[10%] right-[10%] top-[9px] h-px origin-left bg-[#6f83ff]" animate={{ scaleX: phase / (phases.length - 1) }} transition={{ type: "spring", stiffness: 95, damping: 20 }} />
          {phases.map((item, index) => {
            const reached = index <= phase;
            const active = index === phase;
            return <li key={item.key} className="relative text-center">
              <motion.span animate={{ scale: active && !reduceMotion ? 1.16 : 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className={`mx-auto block h-[18px] w-[18px] rounded-full border-[4px] border-[#141a25] shadow-[0_0_0_1px_currentColor] ${reached ? index === 0 ? "bg-[#c95f59] text-[#c95f59]" : index === phases.length - 1 ? "bg-[#65bb91] text-[#65bb91]" : "bg-[#6f83ff] text-[#6f83ff]" : "bg-[#141a25] text-[#4d5666]"}`} />
              <span className={`mt-2 block text-[8px] font-medium ${reached ? "text-[#b8bec8]" : "text-[#596273]"}`}>{item.system}</span>
            </li>;
          })}
        </ol>
      </div>

      <footer className="grid grid-cols-3 gap-2 px-2 pt-3 font-mono text-[8px] text-[#778193]"><span>same run</span><span className="text-center">human in control</span><span className="text-right">duplicate effects: 0</span></footer>
      <p className="sr-only">A four-part recovery sequence: the credential grant is rejected, the account owner restores access, Revive rotates the credential lease, and the durable runtime resumes the same run at its checkpoint.</p>
    </section>
  </motion.div>;
}
