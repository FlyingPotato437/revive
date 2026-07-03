"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ClockCountdown,
  Fingerprint,
  LockKey,
  ShieldCheck,
  Warning,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Nango from "@nangohq/frontend";
import { use, useEffect, useState } from "react";
import type { ClassifierResult, ReconsentTicket } from "@/lib/types";

type Phase = "loading" | "ready" | "approving" | "done" | "error";

type RecoveryData = {
  ticket: ReconsentTicket;
  classifier?: ClassifierResult;
  authorization: { mode: "entra_pkce" | "nango_connect" | "sandbox" | "unavailable"; url: string | null };
};

type CompletionData = { resumeQueued: boolean; state: string };

const SCOPE_PERMS: Record<string, string> = {
  offline_access: "Keep access after this browser session",
  "Mail.ReadWrite": "Read and update mail",
  "Mail.Send": "Send mail for protected workflow actions",
  "Calendars.Read": "Read calendar events",
  "Files.Read.All": "Read files this account can access",
};

const CONTROLS = [
  {
    icon: Fingerprint,
    title: "Account binding",
    detail: "The Microsoft account must match the identity already bound to this run.",
  },
  {
    icon: LockKey,
    title: "Credential rotation",
    detail: "The old credential generation is fenced before the new grant becomes active.",
  },
  {
    icon: ShieldCheck,
    title: "Run continuity",
    detail: "Revive resumes the existing checkpoint with its original idempotency key.",
  },
] as const;

export default function Reauthorize({ params }: { params: Promise<{ ticket: string }> }) {
  const { ticket } = use(params);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<RecoveryData | null>(null);
  const [completion, setCompletion] = useState<CompletionData | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("completed") === "1") {
      setPhase("done");
      return;
    }
    if (query.get("error") === "1") {
      setPhase("error");
      return;
    }

    const controller = new AbortController();
    fetch(`/api/reconsent/${ticket}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("inactive recovery ticket"))))
      .then((value: RecoveryData & { recovered?: boolean }) => {
        setData(value);
        // A single-use ticket that was already approved is a success, not an
        // error — the run already recovered.
        setPhase(value.recovered ? "done" : "ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPhase("error");
      });

    return () => controller.abort();
  }, [ticket]);

  async function approve() {
    if (data?.authorization.mode === "entra_pkce" && data.authorization.url) {
      setPhase("approving");
      window.location.assign(data.authorization.url);
      return;
    }

    if (data?.authorization.mode === "nango_connect") {
      setPhase("approving");
      try {
        const sessionResponse = await fetch(`/api/reconsent/${ticket}/nango-session`, { method: "POST" });
        const session = await sessionResponse.json() as {
          token?: string;
          error?: string;
        };
        if (!sessionResponse.ok || !session.token) throw new Error(session.error || "Could not start Nango authorization");
        const nango = new Nango({ connectSessionToken: session.token });
        let completed = false;
        let connect: ReturnType<Nango["openConnectUI"]>;
        connect = nango.openConnectUI({
          detectClosedAuthWindow: true,
          themeOverride: "light",
          onEvent: async (event) => {
            if (event.type === "error") {
              connect.close();
              setPhase("error");
              return;
            }
            if (event.type === "close" && !completed) {
              setPhase("ready");
              return;
            }
            if (event.type !== "connect") return;
            completed = true;
            const completion = await fetch(`/api/reconsent/${ticket}/nango-complete`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                connectionId: event.payload.connectionId,
                integrationId: event.payload.providerConfigKey,
              }),
            });
            const result = await completion.json().catch(() => ({})) as Partial<CompletionData>;
            connect.close();
            if (completion.ok) {
              setCompletion({ resumeQueued: Boolean(result.resumeQueued), state: String(result.state || "identity_verified") });
              setPhase("done");
            } else {
              setPhase("error");
            }
          },
        });
      } catch {
        setPhase("error");
      }
      return;
    }

    if (data?.authorization.mode === "unavailable") {
      setPhase("error");
      return;
    }

    setPhase("approving");
    const response = await fetch(`/api/reconsent/${ticket}`, { method: "POST" });
    setPhase(response.ok ? "done" : "error");
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f4f5f1] text-[#151922]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,rgba(21,25,34,.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(21,25,34,.035)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_bottom,#000,transparent_72%)]" />

      <header className="relative border-b border-[#151922] bg-[#f4f5f1]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[63px] max-w-[1240px] items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Revive home" className="group flex items-center gap-3">
            <span className="revive-mark" aria-hidden>
              <span className="revive-mark-ring" />
              <span className="revive-mark-core" />
            </span>
            <span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[8px] tracking-[.12em] text-[#7b8491] sm:inline">
              RECOVERY AUTHORIZATION
            </span>
            <span className="flex h-8 items-center gap-2 border border-[#bfc5cc] bg-[#fbfcf8] px-2.5 font-mono text-[8px] text-[#4f5866]">
              <ShieldCheck size={13} className="text-[#2e49c8]" weight="bold" />
              TLS PROTECTED
            </span>
          </div>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <section className="border border-[#151922] bg-[#fbfcf8] shadow-[10px_10px_0_#d9ddd6]">
          <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#151922] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <Image src="/logos/microsoft.png" alt="Microsoft" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
              <span className="font-mono text-[9px] font-medium tracking-[.11em] text-[#596273]">
                MICROSOFT ENTRA / CREDENTIAL RECOVERY
              </span>
            </div>
            <span className="ml-auto font-mono text-[8px] text-[#8a929d]">
              ONE-TIME REQUEST
            </span>
          </div>

          <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(270px,.75fr)]">
            <div className="min-h-[470px] p-5 sm:p-8 md:border-r md:border-[#151922] xl:p-12">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={phase}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  {phase === "loading" && <LoadingState />}
                  {phase === "error" && <ErrorState />}
                  {(phase === "ready" || phase === "approving") && data && (
                    <ReadyState data={data} approving={phase === "approving"} approve={approve} />
                  )}
                  {phase === "done" && <DoneState reduceMotion={Boolean(reduceMotion)} completion={completion} />}
                </motion.div>
              </AnimatePresence>
            </div>

            <aside className="border-t border-[#151922] bg-[#eef0eb] md:border-t-0">
              <div className="p-5 sm:p-7 lg:p-8">
                <h2 className="text-[15px] font-semibold tracking-[-.025em]">Recovery controls</h2>
                <p className="mt-2 max-w-[36ch] text-[11px] leading-[1.65] text-[#66707e]">
                  Authorization changes credential access only. Workflow history and completed side effects stay intact.
                </p>
              </div>
              <div className="border-t border-[#bfc5cc]">
                {CONTROLS.map(({ icon: Icon, title, detail }) => (
                  <div key={title} className="grid grid-cols-[32px_1fr] gap-3 border-b border-[#c7ccd2] px-5 py-4 last:border-b-0 sm:px-7 lg:px-8">
                    <span className="flex h-8 w-8 items-center justify-center border border-[#bfc5cc] bg-[#fbfcf8] text-[#2e49c8]">
                      <Icon size={15} weight="bold" />
                    </span>
                    <div>
                      <div className="text-[10.5px] font-semibold">{title}</div>
                      <p className="mt-1 text-[9.5px] leading-[1.55] text-[#737c89]">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#151922] bg-[#edf0ff] px-5 py-4 sm:px-7 lg:px-8">
                <div className="flex items-center gap-2 font-mono text-[8px] tracking-[.08em] text-[#2e49c8]">
                  <ClockCountdown size={13} weight="bold" />
                  15 MINUTE EXPIRY
                </div>
                <p className="mt-1.5 text-[9.5px] leading-[1.55] text-[#5d6680]">
                  Link becomes unusable after approval, expiry, or case closure.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <footer className="mt-5 flex flex-col gap-2 font-mono text-[8px] tracking-[.07em] text-[#818a96] sm:flex-row sm:items-center sm:justify-between">
          <span>REVIVE RECOVERY CONTROL PLANE</span>
          <span>RAW PROVIDER TOKENS ARE NEVER DISPLAYED</span>
        </footer>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[370px] flex-col justify-center" aria-live="polite" aria-busy="true">
      <span className="flex h-12 w-12 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]">
        <ShieldCheck size={22} weight="bold" />
      </span>
      <div className="mt-8 h-3 w-28 animate-pulse bg-[#d9ddd6]" />
      <div className="mt-4 h-8 w-full max-w-[460px] animate-pulse bg-[#e4e7e1]" />
      <div className="mt-3 h-8 w-3/4 max-w-[340px] animate-pulse bg-[#e4e7e1]" />
      <p className="mt-7 font-mono text-[9px] tracking-[.08em] text-[#7b8491]">VALIDATING RECOVERY REQUEST</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex min-h-[370px] flex-col justify-center">
      <span className="flex h-12 w-12 items-center justify-center border border-[#c2413a] bg-[#fcedeb] text-[#c2413a]">
        <X size={21} weight="bold" />
      </span>
      <div className="mt-8 font-mono text-[9px] tracking-[.12em] text-[#9a3b36]">REQUEST INACTIVE</div>
      <h1 className="mt-3 max-w-[620px] text-[clamp(2rem,5vw,4.2rem)] font-semibold leading-[.98] tracking-[-.055em]">
        This recovery link is closed.
      </h1>
      <p className="mt-5 max-w-[52ch] text-[13px] leading-[1.7] text-[#66707e]">
        It was already used, expired after 15 minutes, or its recovery case was closed. No credential changes were made from this request.
      </p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Link href="/app/runs" className="inline-flex h-11 items-center justify-center gap-2 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">
          Open recovery cases <ArrowRight size={14} weight="bold" />
        </Link>
        <Link href="/" className="inline-flex h-11 items-center justify-center border border-[#bfc5cc] bg-[#fbfcf8] px-5 text-[11px] font-semibold text-[#4f5866] transition hover:border-[#151922] hover:text-[#151922] active:translate-y-px">
          Return home
        </Link>
      </div>
    </div>
  );
}

function ReadyState({ data, approving, approve }: { data: RecoveryData; approving: boolean; approve: () => void }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[.12em] text-[#2e49c8]">AUTHORIZATION REQUIRED</div>
      <h1 className="mt-3 max-w-[680px] text-[clamp(2.1rem,3.9vw,4rem)] font-semibold leading-[1.01] tracking-[-.04em]">
        <span className="block">Restore access.</span>
        <span className="block">Resume the same run.</span>
      </h1>
      <p className="mt-5 max-w-[58ch] text-[13px] leading-[1.7] text-[#66707e]">
        Microsoft Graph rejected the current grant. Reauthorize the bound account to rotate its credential generation and release the parked workflow.
      </p>

      <div className="mt-8 grid border border-[#151922] sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#bfc5cc] bg-white">
            <Image src="/logos/microsoft.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold">Microsoft Graph</div>
            <div className="mt-1 truncate font-mono text-[9px] text-[#737c89]">{data.ticket.account}</div>
          </div>
        </div>
        <div className="border-t border-[#151922] bg-[#eef0eb] px-4 py-3 sm:min-w-[150px] sm:border-l sm:border-t-0">
          <div className="font-mono text-[7.5px] tracking-[.1em] text-[#8a929d]">IDENTITY CHECK</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] font-semibold text-[#2e49c8]">
            <Fingerprint size={13} weight="bold" /> Required
          </div>
        </div>
      </div>

      {data.classifier && (
        <div className="mt-3 flex items-start gap-3 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-4 py-3">
          <Warning size={16} className="mt-0.5 shrink-0 text-[#c2413a]" weight="fill" />
          <div>
            <div className="font-mono text-[8.5px] text-[#9a3b36]">{data.classifier.code}</div>
            <div className="mt-1 text-[10px] leading-[1.5] text-[#724743]">{data.classifier.title}</div>
          </div>
        </div>
      )}

      <div className="mt-7">
        <h2 className="font-mono text-[8px] tracking-[.11em] text-[#7b8491]">REQUESTED ACCESS</h2>
        <div className="mt-3 grid gap-px border border-[#c7ccd2] bg-[#c7ccd2] sm:grid-cols-2">
          {data.ticket.scopes.map((scope, index) => (
            <div
              key={scope}
              className={`bg-[#fbfcf8] px-3.5 py-3 ${index === data.ticket.scopes.length - 1 && data.ticket.scopes.length % 2 === 1 ? "sm:col-span-2" : ""}`}
            >
              <div className="font-mono text-[9px] font-medium text-[#303743]">{scope}</div>
              <div className="mt-1 text-[9px] leading-[1.45] text-[#7b8491]">{SCOPE_PERMS[scope] ?? "Scoped provider access"}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={approve}
        disabled={approving}
        className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-65 sm:w-auto sm:min-w-[250px]"
      >
        {approving
          ? "Opening Microsoft authorization"
          : data.authorization.mode === "entra_pkce"
            ? "Continue with Microsoft"
            : data.authorization.mode === "nango_connect"
              ? "Reconnect Microsoft account"
              : data.authorization.mode === "unavailable"
                ? "Authorization unavailable"
                : "Authorize and resume"}
        {!approving && <ArrowRight size={14} weight="bold" />}
      </button>
    </div>
  );
}

function DoneState({ reduceMotion, completion }: { reduceMotion: boolean; completion: CompletionData | null }) {
  const runtimePending = completion?.state === "identity_verified";
  return (
    <div className="flex min-h-[370px] flex-col justify-center" aria-live="polite">
      <motion.span
        initial={reduceMotion ? false : { scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 16 }}
        className="flex h-12 w-12 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"
      >
        <Check size={22} weight="bold" />
      </motion.span>
      <div className="mt-8 font-mono text-[9px] tracking-[.12em] text-[#2e49c8]">RECOVERY ACCEPTED</div>
      <h1 className="mt-3 max-w-[620px] text-[clamp(2.1rem,5vw,4.2rem)] font-semibold leading-[.98] tracking-[-.055em]">
        {runtimePending ? "Authorization verified." : "Workflow resumed."}
      </h1>
      <p className="mt-5 max-w-[54ch] text-[13px] leading-[1.7] text-[#66707e]">
        {runtimePending
          ? completion?.resumeQueued
            ? "Credential generation advanced. A signed resume request is queued; this case changes to resumed only after the runtime acknowledges the original checkpoint."
            : "Credential generation advanced. This workspace has no runtime resume endpoint configured, so the run remains parked for an operator or adapter to resume."
          : "Credential generation advanced. The durable worker can now continue from its saved checkpoint using the original idempotency key."}
      </p>
      <Link href="/app/runs" className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px sm:w-auto">
        View recovery case <ArrowRight size={14} weight="bold" />
      </Link>
    </div>
  );
}
