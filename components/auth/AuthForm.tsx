"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Database, Fingerprint, Key, ShieldCheck } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";

const boundary = [
  { icon: Fingerprint, label: "Identity", detail: "Correct account and tenant" },
  { icon: Database, label: "Checkpoint", detail: "Original durable run" },
  { icon: Key, label: "Lease", detail: "Next credential generation" },
] as const;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const reduceMotion = useReducedMotion();
  const next = params.get("next") || "/app";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      router.push(next);
      router.refresh();
      return;
    }
    setError(data.error || "Sign-in failed. Check your details and try again.");
    setBusy(false);
  }

  async function demo() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/demo", { method: "POST" });
    if (!response.ok) {
      setError("Demo access is temporarily unavailable.");
      setBusy(false);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f4f5f1] text-[#151922]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,rgba(21,25,34,.035)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_bottom,#000,transparent_78%)]" />

      <header className="relative border-b border-[#151922] bg-[#f4f5f1]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[63px] max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Revive home" className="group flex items-center gap-3">
            <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
            <span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span>
          </Link>
          <div className="ml-auto flex items-center gap-2 border border-[#bfc5cc] bg-[#fbfcf8] px-3 py-2 font-mono text-[8px] tracking-[.08em] text-[#596273]">
            <ShieldCheck size={13} weight="bold" className="text-[#2e49c8]" />
            CONTROL PLANE ACCESS
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-12 lg:min-h-[calc(100dvh-63px)] lg:grid-cols-[minmax(0,1fr)_minmax(360px,.72fr)] lg:items-stretch lg:px-8 lg:py-16">
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="border border-[#151922] bg-[#fbfcf8] p-5 shadow-[10px_10px_0_#d9ddd6] sm:p-8 lg:flex lg:flex-col lg:justify-between lg:p-12"
        >
          <div>
            <div className="font-mono text-[9px] tracking-[.12em] text-[#2e49c8]">{mode === "login" ? "CONSOLE SIGN IN" : "WORKSPACE SETUP"}</div>
            <h1 className="mt-4 max-w-[620px] text-[clamp(2.4rem,6vw,5.2rem)] font-semibold leading-[.94] tracking-[-.062em]">
              {mode === "login" ? "Return to the recovery boundary." : "Create your recovery workspace."}
            </h1>
            <p className="mt-5 max-w-[50ch] text-[13px] leading-6 text-[#66707e]">
              {mode === "login" ? "Inspect parked runs, credential generations, and side-effect evidence." : "Start with an isolated workspace for recovery cases, keys, and runtime integrations."}
            </p>
          </div>

          <form onSubmit={submit} className="mt-10 max-w-[520px]">
            <div className="grid gap-4">
              {mode === "signup" && <Field label="Name" value={name} onChange={setName} placeholder="Your name" type="text" autoComplete="name" />}
              <Field label="Work email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" autoComplete="email" required />
              <Field label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
            </div>

            {error && <div role="alert" className="mt-4 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[11px] leading-5 text-[#8b3e38]">{error}</div>}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={busy} className="inline-flex h-11 flex-1 items-center justify-center gap-2 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-60">
                {busy ? "Working" : mode === "login" ? "Sign in" : "Create workspace"}
                {!busy && <ArrowRight size={14} weight="bold" />}
              </button>
              <button type="button" onClick={demo} disabled={busy} className="h-11 border border-[#bfc5cc] bg-[#eef0eb] px-5 text-[10.5px] font-semibold text-[#4f5866] transition hover:border-[#151922] hover:bg-[#fbfcf8] active:translate-y-px disabled:opacity-60">
                Open sandbox
              </button>
            </div>
          </form>

          <div className="mt-8 flex flex-col gap-3 border-t border-[#c7ccd2] pt-5 text-[10.5px] text-[#687180] sm:flex-row sm:items-center sm:justify-between">
            <span>{mode === "login" ? "Need a workspace?" : "Already have a workspace?"}</span>
            <Link href={mode === "login" ? "/signup" : "/login"} className="inline-flex items-center gap-2 font-semibold text-[#2e49c8]">
              {mode === "login" ? "Create one" : "Sign in"} <ArrowRight size={12} weight="bold" />
            </Link>
          </div>
        </motion.section>

        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="mt-7 border border-[#151922] bg-[#eef0eb] lg:mb-10 lg:mt-10 lg:border-l-0"
        >
          <div className="border-b border-[#151922] bg-[#e9ecff] p-6 lg:p-8">
            <div className="font-mono text-[8px] tracking-[.11em] text-[#596273]">RECOVERY CONTRACT</div>
            <h2 className="mt-4 max-w-[320px] text-[25px] font-semibold leading-[1.04] tracking-[-.04em]">Access changes. The original run does not.</h2>
          </div>
          <div className="p-6 lg:p-8">
            <div className="relative">
              <span className="absolute bottom-4 left-[17px] top-4 w-px bg-[#aeb5bd]" aria-hidden />
              {boundary.map(({ icon: Icon, label, detail }, index) => (
                <motion.div key={label} initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.08 }} className="relative grid grid-cols-[36px_1fr] gap-4 pb-7 last:pb-0">
                  <span className="relative flex h-9 w-9 items-center justify-center border border-[#bfc5cc] bg-[#fbfcf8] text-[#2e49c8]"><Icon size={15} weight="bold" /></span>
                  <div><div className="text-[11px] font-semibold">{label}</div><div className="mt-1 text-[10px] leading-5 text-[#737c89]">{detail}</div></div>
                </motion.div>
              ))}
            </div>
            <div className="mt-8 border border-[#4967f2] bg-[#fbfcf8] p-4">
              <div className="flex items-center gap-2 text-[10.5px] font-semibold text-[#2e49c8]"><Check size={14} weight="bold" /> Same logical execution</div>
              <p className="mt-2 text-[9.5px] leading-5 text-[#687180]">Revive binds the account, checkpoint, connection, and idempotency key before release.</p>
            </div>
          </div>
          <div className="border-t border-[#151922] px-6 py-4 font-mono text-[8px] leading-4 text-[#7b8491] lg:px-8">
            Passwords are scrypt-hashed. Provider credentials are not used for console sign-in.
          </div>
        </motion.aside>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type, required, autoComplete }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type: string; required?: boolean; autoComplete: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[8px] tracking-[.11em] text-[#7b8491]">{label.toUpperCase()}</span>
      <input type={type} value={value} required={required} autoComplete={autoComplete} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-12 w-full border border-[#bfc5cc] bg-[#f4f5f1] px-3.5 text-[13px] text-[#151922] outline-none transition placeholder:text-[#9aa1aa] focus:border-[#4967f2] focus:bg-[#fbfcf8] focus:ring-[3px] focus:ring-[#dfe4ff]" />
    </label>
  );
}
