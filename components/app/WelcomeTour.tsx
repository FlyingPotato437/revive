"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react";

const STEPS = [
  {
    title: "One outcome across every action",
    body: "Revive groups the writes behind one agent task and keeps the operation open until the final provider state is proved.",
    labels: ["Transactions show what settled and what is still uncertain.", "Every status comes from execution evidence, not the agent's summary."],
  },
  {
    title: "Define what done means",
    body: "Outcome contracts name the preconditions, required final states, and recovery path for work like refunds, cancellations, and deployments.",
    labels: ["The agent chooses the path. Revive validates the result.", "State-bound approvals go stale when the underlying operation changes."],
  },
  {
    title: "Partial work cannot hide",
    body: "If one provider times out after another step commits, Revive checks what really happened before it retries, compensates, or asks a human.",
    labels: ["Exactly-once actions prevent duplicate side effects.", "The transaction records verified, compensated, or needs-human as distinct outcomes."],
  },
  {
    title: "Set up in five minutes",
    body: "Start with one protected action through MCP, the SDK, or REST. Add a transaction when a task spans multiple external changes.",
    labels: ["Quickstart has copy-paste configs for every path.", "Attach your LangSmith or OpenTelemetry trace without duplicating observability."],
  },
] as const;

function storageKey(email: string, workspaceId: string) {
  return `revive:onboarding:overview:v1:${email}:${workspaceId}`;
}

export function WelcomeTour({ email, workspaceId }: { email: string; workspaceId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const key = storageKey(email, workspaceId);

  const close = (value: "complete" | "dismissed") => {
    try { window.localStorage.setItem(key, value); } catch { /* storage can be disabled */ }
    setOpen(false);
  };

  useEffect(() => {
    if (pathname !== "/app/overview") {
      setOpen(false);
      return;
    }
    try {
      if (!window.localStorage.getItem(key)) {
        setStep(0);
        setOpen(true);
      }
    } catch {
      setStep(0);
      setOpen(true);
    }
  }, [key, pathname]);

  useEffect(() => {
    const replay = () => {
      try { window.localStorage.removeItem(key); } catch { /* storage can be disabled */ }
      setStep(0);
      if (pathname === "/app/overview") setOpen(true);
      else router.push("/app/overview");
    };
    window.addEventListener("revive:open-onboarding", replay);
    return () => window.removeEventListener("revive:open-onboarding", replay);
  }, [key, pathname, router]);

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close("dismissed");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, step]);

  if (!open || pathname !== "/app/overview") return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#151922]/35 px-4 py-6 backdrop-blur-[2px]">
      <section role="dialog" aria-modal="true" aria-labelledby="tour-title" className="w-full max-w-[560px] border border-[#151922] bg-[#fbfcf8] shadow-[12px_12px_0_#d9ddd6]">
        <div className="flex items-center justify-between border-b border-[#151922] px-5 py-4"><span className="font-mono text-[8px] tracking-[.12em] text-[#4967f2]">GETTING STARTED</span><button onClick={() => close("dismissed")} aria-label="Skip walkthrough" className="flex h-7 w-7 items-center justify-center border border-transparent text-[#687180] transition hover:border-[#c9cec7] hover:text-[#151922]"><X size={14} /></button></div>
        <div className="p-6 sm:p-7"><div className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><span className="font-mono text-[11px] font-semibold">{step + 1}</span></div><h2 id="tour-title" className="mt-5 text-[24px] font-semibold leading-tight tracking-[-.04em] text-[#151922]">{current.title}</h2><p className="mt-3 max-w-[450px] text-[12px] leading-6 text-[#596273]">{current.body}</p><ul className="mt-5 grid gap-2">{current.labels.map((label) => <li key={label} className="flex gap-2.5 border-l-[3px] border-[#cbd4f5] bg-[#f7f8f5] px-3 py-2.5 text-[10.5px] leading-5 text-[#4f5968]"><Check size={13} weight="bold" className="mt-0.5 shrink-0 text-[#4967f2]" />{label}</li>)}</ul></div>
        <div className="flex items-center justify-between border-t border-[#e1e2de] px-5 py-4"><span className="font-mono text-[8.5px] text-[#8a929d]">{step + 1} of {STEPS.length}</span><div className="flex items-center gap-2">{step > 0 && <button onClick={() => setStep((value) => value - 1)} className="inline-flex h-9 items-center gap-1.5 border border-[#c9cec7] bg-white px-3 text-[10px] font-semibold text-[#596273] transition hover:border-[#151922]"><ArrowLeft size={12} /> Back</button>}<button ref={nextRef} onClick={() => { if (last) { close("complete"); router.push("/app/quickstart"); } else setStep((value) => value + 1); }} className="inline-flex h-9 items-center gap-1.5 border border-[#151922] bg-[#151922] px-4 text-[10px] font-semibold text-white transition hover:bg-[#2b3340]">{last ? "Protect an action" : "Next"}<ArrowRight size={12} /></button></div></div>
      </section>
    </div>
  );
}
