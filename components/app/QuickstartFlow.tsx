"use client";

import { ArrowRight, BracketsCurly, CheckCircle, Key, Package, TestTube } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Highlight, themes, type Language } from "prism-react-renderer";
import { useState } from "react";

type Snippet = { code: string; language: Language; filename: string };

const stages: Array<{
  id: string; label: string; icon: typeof Package; title: string; body: string; result: string;
  ts: Snippet; py: Snippet;
}> = [
  {
    id: "install", label: "Install", icon: Package,
    title: "Add the SDK",
    body: "Install in the worker that executes your agent's real-world actions.",
    result: "Your workflow can now register protected actions and open recovery cases.",
    ts: { language: "bash", filename: "terminal", code: `npm install revive-sdk` },
    py: { language: "bash", filename: "terminal", code: `pip install revive-sdk` },
  },
  {
    id: "protect", label: "Protect", icon: BracketsCurly,
    title: "Wrap one mutating action",
    body: "Start with the action where a blind retry would create a duplicate.",
    result: "Executed exactly once; a retry returns the stored result, never re-runs.",
    ts: {
      language: "tsx", filename: "integration.ts",
      code: `import { ReviveClient } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app",
  apiKey: process.env.REVIVE_API_KEY, // rv_live_…
});

const result = await revive.protectAction({
  runId: workflow.runId,
  connectionId: "conn_microsoft_ops",
  actionKey: "send_followup_email",
  credential: () => vault.lease("conn_microsoft_ops"),
  execute: () => graph.sendMail(message),
});`,
    },
    py: {
      language: "python", filename: "integration.py",
      code: `from revive import ReviveClient, ReviveParkedError

revive = ReviveClient("https://revivelabs.app", api_key=REVIVE_API_KEY)

try:
    result = revive.protect_action(
        run_id=workflow.run_id,
        connection_id="conn_microsoft_ops",
        action_key="send_followup_email",
        execute=lambda: graph_send_mail(message),
    )
except ReviveParkedError as parked:
    notify(parked.parked.recovery_url)  # dead credential`,
    },
  },
  {
    id: "route", label: "Route", icon: Key,
    title: "Send reauthorization to the account owner",
    body: "Your vault keeps token custody. Revive routes the single-use recovery link.",
    result: "The run parks until the original provider identity reconnects.",
    ts: {
      language: "tsx", filename: "integration.ts",
      code: `const result = await revive.protectAction({
  // …action fields…
  onRecoveryRequired: async ({ id, url }) => {
    // email/Slack the account owner the single-use link
    await notifyAccountOwner({ recoveryCaseId: id, url });
  },
});

if (result.status === "parked") {
  console.log(result.recoveryCase.url);
}`,
    },
    py: {
      language: "python", filename: "integration.py",
      code: `# Adapters wire this into your agent framework:
from revive.adapters.openai_agents import revive_tool

@revive_tool(revive, connection_id="conn_microsoft_ops")
def send_followup_email(run_id: str, to: str, subject: str) -> dict:
    ...

# or Anthropic tool use:
from revive.adapters.anthropic_tools import ReviveToolGuard
guard = ReviveToolGuard(revive, connection_id="conn_microsoft_ops",
                        protected={"send_email"})`,
    },
  },
  {
    id: "verify", label: "Verify", icon: TestTube,
    title: "Prove it against production",
    body: "Exactly-once execution and safe parking, live — no local repo required.",
    result: "Two calls, one execution; a dead credential parks instead of double-firing.",
    ts: {
      language: "bash", filename: "terminal",
      code: `# node revive-live-test.mjs  → 5 green checks on prod
#   ✅ minted prod API key
#   ✅ first call executed once
#   ✅ second call DEDUPLICATED, no re-execute
#   ✅ dead credential PARKED, side effect NOT run`,
    },
    py: {
      language: "python", filename: "verify.py",
      code: `calls = {"n": 0}
run = "verify-1"
def send(): calls["n"] += 1; return {"ok": True}

revive.protect_action(run_id=run, connection_id="c", action_key="a",
                      idem_key="k", execute=send)
revive.protect_action(run_id=run, connection_id="c", action_key="a",
                      idem_key="k", execute=send)
assert calls["n"] == 1  # executed exactly once`,
    },
  },
];

export function QuickstartFlow() {
  const [active, setActive] = useState(0);
  const [lang, setLang] = useState<"ts" | "py">("py");
  const reduceMotion = useReducedMotion();
  const stage = stages[active];
  const snippet = stage[lang];
  return <section className="border border-[#151922] bg-[#fbfcf8] shadow-[7px_7px_0_#d9ddd6]">
    <nav className="grid border-b border-[#151922] sm:grid-cols-4" aria-label="Quickstart steps">{stages.map((item, index) => { const Icon = item.icon; const current = index === active; const complete = index < active; return <button key={item.id} onClick={() => setActive(index)} className={`relative flex min-h-14 items-center gap-3 border-b border-[#d8dde3] px-4 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${current ? "bg-[#edf0ff] text-[#2e49c8]" : "text-[#687180] hover:bg-[#f4f5f1]"}`}>{current && <motion.span layoutId="quickstart-active" className="absolute inset-x-0 bottom-0 h-[3px] bg-[#4967f2]" />}<span className={`flex h-7 w-7 items-center justify-center border ${current ? "border-[#4967f2]" : "border-[#c8cdd2]"}`}>{complete ? <CheckCircle size={14} weight="fill" className="text-[#18724e]" /> : <Icon size={14} />}</span><span className="text-[10.5px] font-semibold">{item.label}</span></button>; })}</nav>

    <AnimatePresence mode="wait" initial={false}><motion.div key={stage.id} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: .2 }} className="grid min-h-[430px] lg:grid-cols-[.74fr_1.26fr]">
      <div className="flex flex-col justify-between border-b border-[#151922] p-6 sm:p-8 lg:border-b-0 lg:border-r">
        <div><div className="font-mono text-[8px] tracking-[.1em] text-[#8a929d]">{String(active + 1).padStart(2, "0")} OF {String(stages.length).padStart(2, "0")}</div><h2 className="mt-5 max-w-[360px] text-[28px] font-semibold leading-[1] tracking-[-.045em]">{stage.title}</h2><p className="mt-4 max-w-[380px] text-[12px] leading-6 text-[#687180]">{stage.body}</p></div>
        <div className="mt-12 border-l-[3px] border-[#4967f2] pl-4"><div className="text-[9px] font-semibold text-[#2e49c8]">After this step</div><p className="mt-2 text-[10.5px] leading-5 text-[#596273]">{stage.result}</p></div>
      </div>
      <div className="flex min-w-0 flex-col bg-[#f7f8f5]">
        <div className="flex h-12 items-center justify-between border-b border-[#d8dde3] px-5">
          <div className="flex items-center gap-1 border border-[#d8dde3] bg-[#fbfcf8] p-0.5">
            {(["py", "ts"] as const).map((option) => (
              <button key={option} onClick={() => setLang(option)} className={`px-2.5 py-1 font-mono text-[8px] font-semibold tracking-[.06em] transition ${lang === option ? "bg-[#151922] text-white" : "text-[#7b8491] hover:text-[#2e49c8]"}`}>
                {option === "py" ? "PYTHON" : "TYPESCRIPT"}
              </button>
            ))}
          </div>
          <button onClick={() => navigator.clipboard.writeText(snippet.code)} className="text-[9px] font-semibold text-[#596273] hover:text-[#2e49c8]">Copy</button>
        </div>
        <Highlight theme={themes.vsLight} code={snippet.code} language={snippet.language}>{({ tokens, getLineProps, getTokenProps }) => <pre className="min-h-[300px] flex-1 overflow-x-auto bg-[#f7f8f5] p-5 font-mono text-[10px] leading-6 sm:p-7"><code>{tokens.map((line, index) => <div key={index} {...getLineProps({ line })}>{line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />)}</div>)}</code></pre>}</Highlight>
        <div className="flex items-center justify-between border-t border-[#d8dde3] px-5 py-3"><span className="font-mono text-[8px] text-[#8a929d]">{snippet.filename}</span>{active < stages.length - 1 ? <button onClick={() => setActive((value) => value + 1)} className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#2e49c8]">Next <ArrowRight size={12} /></button> : <a href="/benchmarks" className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#2e49c8]">Open evidence <ArrowRight size={12} /></a>}</div>
      </div>
    </motion.div></AnimatePresence>
  </section>;
}
