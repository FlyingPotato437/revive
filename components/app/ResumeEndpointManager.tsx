"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle, Copy, PaperPlaneTilt, Trash, WarningCircle } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/app/ConsolePrimitives";

interface EndpointState {
  configured: boolean;
  verified: boolean;
  verifiedAt?: number;
  url?: string;
}

type Phase = "idle" | "saving" | "clearing" | "testing";

type TestResult = { ok: true; verified: true; status: number; eventId: string; queued?: { recoveryCases: number; actionRequests: number } } | { ok: false; status: number; error: string };

export function ResumeEndpointManager({ onVerified }: { onVerified?: () => void } = {}) {
  const [state, setState] = useState<EndpointState | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workspaces/resume-endpoint");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Could not load the resume endpoint"); return; }
    setState({ configured: Boolean(payload.configured), verified: Boolean(payload.verified), verifiedAt: payload.verifiedAt, url: payload.url });
    setUrl(payload.url || "");
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save() {
    setError(null); setNotice(null); setTest(null); setPhase("saving");
    try {
      const response = await fetch("/api/workspaces/resume-endpoint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), secret }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "Could not save the resume endpoint"); return; }
      setSecret("");
      setNotice("Endpoint saved. Send the signed test before Revive enables automatic resume.");
      await refresh();
    } finally {
      setPhase("idle");
    }
  }

  async function clear() {
    setError(null); setNotice(null); setTest(null); setPhase("clearing");
    try {
      const response = await fetch("/api/workspaces/resume-endpoint", { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "Could not clear the resume endpoint"); return; }
      setUrl(""); setSecret("");
      setNotice("Resume endpoint cleared. Recovery cases will pause at identity_verified.");
      await refresh();
    } finally {
      setPhase("idle");
    }
  }

  async function sendTest() {
    setError(null); setNotice(null); setTest(null); setPhase("testing");
    try {
      const response = await fetch("/api/workspaces/resume-endpoint/test", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) { setError(payload.error || "No resume endpoint is registered yet."); return; }
      setTest(payload as TestResult);
      if (response.ok && payload.ok) {
        await refresh();
        onVerified?.();
      }
    } catch {
      setError("Test delivery failed to start");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const configured = state?.configured ?? false;
  const verified = state?.verified ?? false;
  // A save needs both fields; a configured endpoint keeps its stored secret, so
  // re-saving the same URL still requires re-entering the secret (write-only).
  const canSave = url.trim().length > 0 && secret.length > 0 && !busy;

  function generateSecret() {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    setSecret(Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""));
    setCopied(false);
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[56ch] text-[10.5px] leading-5 text-[#687180]">
          Where your runtime receives signed <span className="font-mono text-[10px] text-[#4f5866]">recovery.resume_requested</span> and{" "}
          <span className="font-mono text-[10px] text-[#4f5866]">action_request.completed</span> callbacks. Revive enables delivery only after this endpoint proves it can verify a signed test.
        </p>
        <StatusBadge tone={state === null ? "neutral" : verified ? "ok" : "warn"}>
          {state === null ? "loading" : verified ? "verified" : configured ? "test required" : "not set"}
        </StatusBadge>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3 text-[11px] leading-5 text-[#8b3e38]">
          <WarningCircle size={15} className="mt-px shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 flex items-start gap-2 border-l-[3px] border-[#18724e] bg-[#edf8f2] px-4 py-3 text-[11px] leading-5 text-[#18724e]">
          <CheckCircle size={15} className="mt-px shrink-0" /> {notice}
        </div>
      )}

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5">
          <span className="font-mono text-[8.5px] uppercase tracking-[.1em] text-[#7b8491]">Callback URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={busy}
            placeholder="https://runtime.example.com/hooks/revive"
            spellCheck={false}
            className="h-10 border border-[#d5d8d2] bg-white px-3 font-mono text-[11px] text-[#151922] outline-none transition focus:border-[#4967f2] disabled:opacity-60"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-[8.5px] uppercase tracking-[.1em] text-[#7b8491]">Shared secret</span>
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            disabled={busy}
            placeholder={configured ? "•••••••••••• stored. Enter a new secret to replace" : "16–256 characters, used to sign callbacks"}
            spellCheck={false}
            autoComplete="off"
            className="h-10 border border-[#d5d8d2] bg-white px-3 font-mono text-[11px] text-[#151922] outline-none transition focus:border-[#4967f2] disabled:opacity-60"
          />
          <span className="font-mono text-[8.5px] text-[#9aa1aa]">Write-only. {configured ? "The stored secret stays active until you submit a replacement." : "Generate one here, copy it into your receiver, then register the endpoint."}</span>
        </label>
        <div className="-mt-2 flex flex-wrap gap-2"><button type="button" onClick={generateSecret} disabled={busy} className="h-8 border border-[#c8cdd2] bg-white px-3 text-[9px] font-semibold text-[#596273] transition hover:border-[#151922]">Generate secure secret</button><button type="button" onClick={() => void copySecret()} disabled={!secret || busy} className="inline-flex h-8 items-center gap-1.5 border border-transparent px-2 text-[9px] font-semibold text-[#2e49c8] disabled:opacity-40">{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? "Copied" : "Copy secret"}</button></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={!canSave}
          className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
        >
          {phase === "saving" ? "Saving…" : configured ? "Update endpoint" : "Register endpoint"}
        </button>
        <button
          onClick={sendTest}
          disabled={!configured || busy}
          className="inline-flex h-9 items-center gap-2 border border-[#c8cdd2] bg-white px-4 text-[10.5px] font-semibold text-[#3a424e] transition hover:border-[#4967f2] hover:text-[#2e49c8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
        >
          <PaperPlaneTilt size={13} weight="bold" /> {phase === "testing" ? "Sending test…" : "Send test event"}
        </button>
        <button
          onClick={clear}
          disabled={!configured || busy}
          className="inline-flex h-9 items-center gap-2 border border-transparent px-3 text-[10.5px] font-semibold text-[#a84139] transition hover:border-[#edceca] hover:bg-[#fff0ee] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash size={13} weight="bold" /> {phase === "clearing" ? "Clearing…" : "Clear"}
        </button>
      </div>

      {test && (
        <div
          className={`mt-5 border-l-[3px] px-4 py-3 text-[10.5px] leading-5 ${test.ok ? "border-[#18724e] bg-[#edf8f2] text-[#18724e]" : "border-[#c2413a] bg-[#fcedeb] text-[#8b3e38]"}`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {test.ok ? <CheckCircle size={15} /> : <WarningCircle size={15} />}
            {test.ok ? `Verified. Endpoint replied ${test.status}` : `Test failed${test.status ? `: HTTP ${test.status}` : ""}`}
          </div>
          <div className="mt-1 font-mono text-[9px] text-[#7b8491]">
            {test.ok ? `signed recovery.resume_test · ${test.eventId}${test.queued ? ` · queued ${test.queued.recoveryCases + test.queued.actionRequests} waiting continuation(s)` : ""}` : test.error}
          </div>
        </div>
      )}
    </div>
  );
}
