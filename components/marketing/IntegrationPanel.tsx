"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Highlight, themes, type Language } from "prism-react-renderer";
import { siAuth0, siTemporal, siTypescript } from "simple-icons";
import Image, { type StaticImageData } from "next/image";
import langGraphLogo from "@lobehub/icons-static-svg/icons/langgraph.svg";
import { useState } from "react";

const integrations = [
  {
    id: "typescript", label: "TypeScript SDK", icon: siTypescript, asset: null, color: "#3178C6", language: "tsx" as Language,
    note: "Protect one mutating action",
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
  },
  {
    id: "langgraph", label: "LangGraph", icon: null, asset: langGraphLogo, color: "#1C3C3C", language: "python" as Language,
    note: "Use the runtime's native interrupt",
    code: `from revive.adapters.langgraph import revive_refresh

def files_node(state):
    token = revive_refresh(
        provider,
        state["refresh_token"],
        scopes=SCOPES,
    )
    state["access_token"] = token.access_token
    return state`,
  },
  {
    id: "temporal", label: "Temporal", icon: siTemporal, asset: null, color: "#151922", language: "python" as Language,
    note: "Signal the existing workflow",
    code: `signal = ReauthorizationSignal(
    recovery_case_id="rcv_01",
    connection_id="conn_microsoft_ops",
    lease_generation=2,
    provider="microsoft",
)

await revive.resume(
    workflow_id="nightly-briefing",
    signal=signal,
)`,
  },
  {
    id: "auth0", label: "Auth0 Token Vault", icon: siAuth0, asset: null, color: "#EB5424", language: "tsx" as Language,
    note: "Keep token exchange server-side",
    code: `const token = await exchangeAuth0Token({
  subjectToken: encryptedRefreshToken,
  subjectTokenType: "refresh_token",
  connection: "microsoft-graph",
  loginHint: recoveryCase.accountId,
});

await leases.rotate({
  connectionId: recoveryCase.connectionId,
  generation: recoveryCase.generation + 1,
});`,
  },
] as const;

export function IntegrationPanel() {
  const [active, setActive] = useState<(typeof integrations)[number]["id"]>("typescript");
  const reduceMotion = useReducedMotion();
  const selected = integrations.find((item) => item.id === active)!;
  return <div className="integration-console grid border border-[#151922] bg-[#fbfcf8] lg:grid-cols-[300px_1fr]">
    <div className="border-b border-[#151922] bg-[#eef0eb] p-3 lg:border-b-0 lg:border-r">
      {integrations.map((item) => { const current = item.id === active; return <button key={item.id} onClick={() => setActive(item.id)} className={`relative mb-1 flex w-full items-center gap-3 border px-3 py-3 text-left transition last:mb-0 ${current ? "border-[#4967f2] bg-[#fbfcf8] text-[#151922]" : "border-transparent text-[#596273] hover:border-[#c8cdd2] hover:bg-[#fbfcf8]"}`}>{current && <motion.span layoutId="integration-active" className="absolute -left-[4px] top-2 h-[calc(100%-16px)] w-[3px] bg-[#4967f2]" />}<span className="flex h-8 w-8 items-center justify-center border border-[#bfc5cc] bg-white"><BrandIcon icon={item.icon} asset={item.asset} title={item.label} color={item.color} /></span><span><span className="block text-[11px] font-semibold">{item.label}</span><span className="mt-1 block text-[8.5px] text-[#7b8491]">{item.note}</span></span></button>; })}
    </div>
    <div className="min-w-0">
      <div className="flex min-h-16 items-center gap-3 border-b border-[#151922] px-5"><BrandIcon icon={selected.icon} asset={selected.asset} title={selected.label} color={selected.color} size={18} /><div><div className="text-[12px] font-semibold">{selected.label}</div><div className="mt-1 text-[9px] text-[#7b8491]">{selected.note}</div></div></div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={selected.id} initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: .18 }}>
        <Highlight theme={themes.vsLight} code={selected.code.trim()} language={selected.language}>{({ tokens, getLineProps, getTokenProps }) => <pre className="min-h-[370px] overflow-x-auto bg-[#fbfcf8] p-5 font-mono text-[10px] leading-6 sm:p-7"><code>{tokens.map((line, index) => <div key={index} {...getLineProps({ line })}><span className="mr-5 inline-block w-4 select-none text-right text-[#b0b6bf]">{index + 1}</span>{line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />)}</div>)}</code></pre>}</Highlight>
      </motion.div></AnimatePresence>
    </div>
  </div>;
}

function BrandIcon({ icon, asset, title, color, size = 15 }: { icon: typeof siTypescript | null; asset: StaticImageData | null; title: string; color: string; size?: number }) {
  if (asset) return <Image src={asset} alt={title} width={size} height={size} />;
  if (!icon) return null;
  return <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" width={size} height={size} fill={color}><path d={icon.path} /></svg>;
}
