"use client";

import { ArrowRight, BracketsCurly, CheckCircle, Key, Package, Plugs, TestTube } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Highlight, themes, type Language } from "prism-react-renderer";
import { useState } from "react";

const stages = [
  {
    id: "install", label: "Install", icon: Package, language: "bash" as Language,
    title: "Add the action SDK",
    body: "Install the package in the worker that executes provider actions.",
    code: `# not yet on npm; install from the repo:
npm install path/to/revive/sdk/typescript`,
    result: "Your workflow can now register actions and open recovery cases.",
  },
  {
    id: "protect", label: "Protect", icon: BracketsCurly, language: "tsx" as Language,
    title: "Wrap one mutating action",
    body: "Start with the action where a blind retry would create a duplicate.",
    code: `const result = await revive.protectAction({
  runId: workflow.runId,
  checkpointId: workflow.checkpointId,
  connectionId: "conn_microsoft_ops",
  actionKey: "send-briefing",
  credential: () => vault.lease("conn_microsoft_ops"),
  execute: ({ credential, idempotencyKey }) =>
    graph.sendMail(message, { credential, idempotencyKey }),
  reconcile: ({ idempotencyKey }) =>
    graph.findMailByIdempotencyKey(idempotencyKey),
});`,
    result: "Revive binds the run, checkpoint, connection and idempotency key.",
  },
  {
    id: "route", label: "Route", icon: Key, language: "tsx" as Language,
    title: "Send reauthorization to the account owner",
    body: "Your credential provider keeps token custody. Revive routes the recovery request.",
    code: `const revive = new ReviveClient({
  transport: hostedTransport,
});

await revive.protectAction({
  // action fields omitted
  onRecoveryRequired: async ({ id, url }) => {
    await notifyAccountOwner({ recoveryCaseId: id, url });
  },
});`,
    result: "The workflow parks until the original provider identity reconnects.",
  },
  {
    id: "verify", label: "Verify", icon: TestTube, language: "bash" as Language,
    title: "Run the failure suite",
    body: "Exercise the same-run resume, identity binding, generation fence and reconciliation paths.",
    code: `npm run bench:revive
python3 -m unittest discover -s sidecar/tests -v`,
    result: "The command writes a fresh JSON report and fails if an invariant breaks.",
  },
  {
    id: "proxy", label: "Proxy", icon: Plugs, language: "bash" as Language,
    title: "Optional: gateway mode",
    body: "Point provider calls at the Revive proxy. Mutations are ledgered, replays are blocked at the wire, and dead credentials open a recovery case. An alternative to the SDK for HTTP-only stacks.",
    code: `# was: https://graph.microsoft.com/v1.0/me/sendMail
curl -X POST "$REVIVE_URL/proxy/v1.0/me/sendMail" \\
  -H "Authorization: Bearer rv_live_…" \\
  -H "X-Revive-Connection-Id: $CONNECTION_ID" \\
  -H "X-Revive-Run-Id: $RUN_ID" \\
  -H "Content-Type: application/json" \\
  -d "$MESSAGE_JSON"

# reads pass straight through (no ledger entry):
#   GET  /proxy/v1.0/me
# optional headers:
#   X-Revive-Action-Key:       send_followup_email
#   X-Revive-Checkpoint-Id:    ckpt_4
#   X-Revive-Idempotency-Key:  your own key (else derived)
#   X-Revive-Lease-Generation: fences stale workers (409)
# responses:
#   x-revive-ledger: committed          side effect recorded
#   x-revive-replay: blocked            duplicate stopped, stored result returned
#   401 + recoveryUrl                   credential dead, case opened`,
    result: "Every mutating call is exactly-once without touching your agent code.",
  },
] as const;

export function QuickstartFlow() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const stage = stages[active];
  return <section className="border border-[#151922] bg-[#fbfcf8] shadow-[7px_7px_0_#d9ddd6]">
    <nav className="grid border-b border-[#151922] sm:grid-cols-5" aria-label="Quickstart steps">{stages.map((item, index) => { const Icon = item.icon; const current = index === active; const complete = index < active; return <button key={item.id} onClick={() => setActive(index)} className={`relative flex min-h-14 items-center gap-3 border-b border-[#d8dde3] px-4 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${current ? "bg-[#edf0ff] text-[#2e49c8]" : "text-[#687180] hover:bg-[#f4f5f1]"}`}>{current && <motion.span layoutId="quickstart-active" className="absolute inset-x-0 bottom-0 h-[3px] bg-[#4967f2]" />}<span className={`flex h-7 w-7 items-center justify-center border ${current ? "border-[#4967f2]" : "border-[#c8cdd2]"}`}>{complete ? <CheckCircle size={14} weight="fill" className="text-[#18724e]" /> : <Icon size={14} />}</span><span className="text-[10.5px] font-semibold">{item.label}</span></button>; })}</nav>

    <AnimatePresence mode="wait" initial={false}><motion.div key={stage.id} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: .2 }} className="grid min-h-[430px] lg:grid-cols-[.74fr_1.26fr]">
      <div className="flex flex-col justify-between border-b border-[#151922] p-6 sm:p-8 lg:border-b-0 lg:border-r">
        <div><div className="font-mono text-[8px] tracking-[.1em] text-[#8a929d]">{String(active + 1).padStart(2, "0")} OF {String(stages.length).padStart(2, "0")}</div><h2 className="mt-5 max-w-[360px] text-[28px] font-semibold leading-[1] tracking-[-.045em]">{stage.title}</h2><p className="mt-4 max-w-[380px] text-[12px] leading-6 text-[#687180]">{stage.body}</p></div>
        <div className="mt-12 border-l-[3px] border-[#4967f2] pl-4"><div className="text-[9px] font-semibold text-[#2e49c8]">After this step</div><p className="mt-2 text-[10.5px] leading-5 text-[#596273]">{stage.result}</p></div>
      </div>
      <div className="flex min-w-0 flex-col bg-[#f7f8f5]"><div className="flex h-12 items-center justify-between border-b border-[#d8dde3] px-5"><span className="font-mono text-[8px] text-[#7b8491]">{stage.language === "tsx" ? "integration.ts" : "terminal"}</span><button onClick={() => navigator.clipboard.writeText(stage.code)} className="text-[9px] font-semibold text-[#596273] hover:text-[#2e49c8]">Copy</button></div><Highlight theme={themes.vsLight} code={stage.code} language={stage.language}>{({ tokens, getLineProps, getTokenProps }) => <pre className="min-h-[300px] flex-1 overflow-x-auto bg-[#f7f8f5] p-5 font-mono text-[10px] leading-6 sm:p-7"><code>{tokens.map((line, index) => <div key={index} {...getLineProps({ line })}>{line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />)}</div>)}</code></pre>}</Highlight><div className="flex items-center justify-between border-t border-[#d8dde3] px-5 py-3"><span className="font-mono text-[8px] text-[#8a929d]">{stage.label.toUpperCase()}</span>{active < stages.length - 1 ? <button onClick={() => setActive((value) => value + 1)} className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#2e49c8]">Next <ArrowRight size={12} /></button> : <a href="/benchmarks" className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#2e49c8]">Open evidence <ArrowRight size={12} /></a>}</div></div>
    </motion.div></AnimatePresence>
  </section>;
}
