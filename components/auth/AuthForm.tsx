"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/marketing/Wordmark";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push(next);
      router.refresh();
    } else {
      setError(data.error || "Something went wrong.");
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    await fetch("/api/auth/demo", { method: "POST" });
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <Link href="/" className="mb-8">
        <Wordmark size={26} />
      </Link>

      <div className="w-full max-w-[400px] rounded-card border border-hairline bg-paper-panel p-8 shadow-seat">
        <h1 className="display text-[24px] text-ink" style={{ fontWeight: 560 }}>
          {mode === "login" ? "Welcome back" : "Create your workspace"}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {mode === "login"
            ? "Sign in to your Revive console."
            : "Set it up in a few minutes."}
        </p>

        <button
          onClick={demo}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-chip border border-cobalt/30 bg-cobalt-soft py-2.5 text-[13.5px] font-medium text-cobalt transition hover:bg-cobalt-soft/70 disabled:opacity-60"
        >
          Skip to the live demo
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-hairline" />
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            or with email
          </span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Ada Lovelace"
              type="text"
            />
          )}
          <Field
            label="Work email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            type="email"
            required
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            type="password"
            required
          />

          {error && (
            <div className="rounded-chip border border-fail/25 bg-fail-soft px-3 py-2 text-[12.5px] text-fail">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-chip bg-cobalt py-2.5 text-[14px] font-medium text-paper-panel transition hover:bg-cobalt-hover disabled:opacity-60"
          >
            {busy
              ? "…"
              : mode === "login"
                ? "Sign in"
                : "Create workspace"}
          </button>
        </form>

        <p className="mt-5 text-center text-[12.5px] text-ink-muted">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link href="/signup" className="text-cobalt underline-offset-2 hover:underline">
                Create a workspace
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-cobalt underline-offset-2 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>

      <p className="mono mt-6 max-w-[360px] text-center text-[10.5px] leading-relaxed text-ink-faint">
        Demo auth · accounts live in memory and reset when the server restarts.
        No real credentials are stored.
      </p>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mono mb-1 block text-[10px] uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-chip border border-hairline bg-paper-inset px-3 py-2.5 text-[14px] text-ink shadow-inset outline-none transition placeholder:text-ink-faint focus:border-cobalt focus:ring-[3px] focus:ring-cobalt-soft"
      />
    </label>
  );
}
