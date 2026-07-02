"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const phases = [
  { key: "detect", owner: "IDENTITY", title: "Grant rejected", note: "AADSTS700082", color: "#C2413A" },
  { key: "recover", owner: "ACCOUNT OWNER", title: "Access restored", note: "one secure action", color: "#4967F2" },
  { key: "rotate", owner: "REVIVE", title: "Lease advanced", note: "generation 01 to 02", color: "#4967F2" },
  { key: "resume", owner: "RUNTIME", title: "Run resumed", note: "checkpoint 05", color: "#148060" },
] as const;

export function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(reduceMotion ? phases.length - 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(phases.length - 1);
      return;
    }
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % phases.length), 1750);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const current = phases[phase];

  return (
    <motion.figure
      initial={reduceMotion ? false : { opacity: 0, y: 20, rotate: 0.8 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="recovery-record relative mx-auto w-full max-w-[620px] lg:mr-0"
      aria-label="Revive recovery incident record"
    >
      <div className="record-binding" aria-hidden="true" />
      <div className="relative border border-[#bfc5ce] bg-[#fbfcf8] shadow-[0_24px_55px_-42px_rgba(24,31,44,.65)]">
        <header className="grid grid-cols-[1fr_auto] border-b border-[#151922]">
          <div className="p-5 sm:p-6">
            <p className="font-mono text-[9px] font-medium tracking-[.12em] text-[#596273]">ILLUSTRATIVE RECOVERY TRACE</p>
            <p className="mt-2 text-[13px] font-semibold tracking-[-.02em] text-[#151922]">Nightly executive briefing</p>
          </div>
          <div className="flex min-w-[108px] flex-col justify-center border-l border-[#151922] bg-[#edf0ff] px-4 text-right">
            <span className="font-mono text-[8px] text-[#697386]">CASE</span>
            <span className="mt-1 font-mono text-[12px] font-semibold text-[#2e49c8]">RV-0248</span>
          </div>
        </header>

        <div className="grid sm:grid-cols-[.8fr_1.2fr]">
          <div className="border-b border-[#cfd4da] p-5 sm:border-b-0 sm:border-r sm:p-6">
            <p className="font-mono text-[8px] tracking-[.1em] text-[#747d8b]">EXECUTION</p>
            <p className="mt-3 font-mono text-[20px] font-medium tracking-[-.04em] text-[#151922]">run_7f2</p>
            <dl className="mt-7 space-y-4 text-[10px]">
              <div><dt className="text-[#8a94a3]">Checkpoint</dt><dd className="mt-1 font-mono text-[#303744]">05 / prepare brief</dd></div>
              <div><dt className="text-[#8a94a3]">Action key</dt><dd className="mt-1 font-mono text-[#303744]">send_exec_05</dd></div>
              <div><dt className="text-[#8a94a3]">Duplicate effects</dt><dd className="mt-1 font-mono font-semibold text-[#148060]">0 observed</dd></div>
            </dl>
          </div>

          <div className="flex min-h-[282px] flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[8px] tracking-[.1em] text-[#747d8b]">LIVE TRANSITION</span>
              <span className="font-mono text-[9px] text-[#747d8b]">{String(phase + 1).padStart(2, "0")} / 04</span>
            </div>

            <div className="flex flex-1 items-center py-8">
              <AnimatePresence mode="wait">
                <motion.div key={current.key} initial={reduceMotion ? false : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? {} : { opacity: 0, y: -7 }} transition={{ duration: 0.28 }}>
                  <p className="font-mono text-[8px] font-semibold tracking-[.12em]" style={{ color: current.color }}>{current.owner}</p>
                  <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-.045em] text-[#151922]">{current.title}</p>
                  <p className="mt-3 font-mono text-[10px] text-[#737c8a]">{current.note}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <ol className="grid grid-cols-4 gap-2" aria-hidden="true">
              {phases.map((item, index) => (
                <li key={item.key}>
                  <div className="h-[3px] bg-[#dde1e5]"><motion.div className="h-full origin-left" style={{ backgroundColor: item.color }} animate={{ scaleX: index <= phase ? 1 : 0 }} transition={{ duration: 0.35 }} /></div>
                  <span className={`mt-2 block font-mono text-[7px] ${index <= phase ? "text-[#49515e]" : "text-[#a5acb5]"}`}>{item.owner.split(" ")[0]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-[#151922] bg-[#f0f2ed] px-5 py-3 font-mono text-[8px] text-[#66707e] sm:px-6">
          <span>SAME LOGICAL RUN</span>
          <span className="font-semibold text-[#2e49c8]">CREDENTIAL GENERATION {phase >= 2 ? "02" : "01"}</span>
        </footer>
      </div>
      <figcaption className="sr-only">The provider rejects a credential, the account owner restores access, Revive advances the lease, and the original run resumes at its checkpoint.</figcaption>
    </motion.figure>
  );
}
