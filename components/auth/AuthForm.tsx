"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : mode === "signup" ? "/app/quickstart" : "/app/overview";
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

  // Swap links keep method=password so a user who explicitly chose the
  // password form is not bounced back to the hosted Clerk page.
  const swapHref = `${mode === "login" ? "/signup" : "/login"}?method=password&next=${encodeURIComponent(next)}`;

  return (
    <main className="min-h-[100dvh] bg-[#f4f5f1] text-[#151922]">
      <header className="border-b border-[#e0e3dd] bg-[#f7f8f6]">
        <div className="mx-auto flex h-[63px] max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Revive home" className="group flex items-center gap-3">
            <span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span>
            <span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[420px] px-4 py-14 sm:py-20">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-.03em]">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[#66707e]">
          {mode === "login" ? "Access your Revive workspace." : "Set up a workspace for user actions, continuations, keys, and integrations."}
        </p>

        <form onSubmit={submit} className="mt-8 border border-[#d9ddd6] bg-[#fbfcf8] p-6 sm:p-7">
          <div className="grid gap-4">
            {mode === "signup" && <Field label="Name" value={name} onChange={setName} placeholder="Your name" type="text" autoComplete="name" />}
            <Field label="Work email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" autoComplete="email" required />
            <Field label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </div>

          {error && <div role="alert" className="mt-4 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[12px] leading-5 text-[#8b3e38]">{error}</div>}

          <button type="submit" disabled={busy} className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[7px] bg-[#151922] px-5 text-[13px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-60">
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-5 text-center text-[13px] text-[#66707e]">
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <Link href={swapHref} className="font-semibold text-[#151922] underline decoration-[#c7ccd2] underline-offset-4 transition hover:decoration-[#151922]">
            {mode === "login" ? "Create one" : "Sign in"}
          </Link>
        </div>

        <div className="mt-3 text-center text-[13px] text-[#66707e]">
          Just looking?{" "}
          <button type="button" onClick={demo} disabled={busy} className="font-semibold text-[#151922] underline decoration-[#c7ccd2] underline-offset-4 transition hover:decoration-[#151922] disabled:opacity-60">
            Open the sandbox
          </button>
        </div>

        <p className="mt-10 text-center text-[11px] leading-5 text-[#9aa1aa]">
          Passwords are scrypt-hashed. Provider credentials are never used for console sign-in.
        </p>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type, required, autoComplete }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type: string; required?: boolean; autoComplete: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[#4f5866]">{label}</span>
      <input type={type} value={value} required={required} autoComplete={autoComplete} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-[7px] border border-[#c9cec7] bg-white px-3.5 text-[13px] text-[#151922] outline-none transition placeholder:text-[#9aa1aa] focus:border-[#151922]" />
    </label>
  );
}
