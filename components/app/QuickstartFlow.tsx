"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, LinkSimple, Package, TerminalWindow } from "@phosphor-icons/react";
import { useState } from "react";

type SetupPath = "mcp" | "sdk" | "api";

const PATHS: Record<SetupPath, {
  label: string;
  title: string;
  description: string;
  detail: string;
  icon: typeof LinkSimple;
  filename: string;
  code: string;
}> = {
  mcp: {
    label: "MCP gateway",
    title: "Wrap a server you already use",
    description: "The fastest way to protect tools in Claude, Cursor, or any MCP host.",
    detail: "Revive sits before the downstream server and records every tool call before it runs.",
    icon: LinkSimple,
    filename: "claude_desktop_config.json",
    code: `{
  "mcpServers": {
    "server-via-revive": {
      "command": "npx",
      "args": ["revive-mcp-gateway", "--", "npx", "-y", "@your/mcp-server"],
      "env": { "REVIVE_API_KEY": "rv_live_..." }
    }
  }
}`,
  },
  sdk: {
    label: "SDK",
    title: "Keep control in your runtime",
    description: "Use the SDK when your worker owns execution, retries, and checkpoints.",
    detail: "Pass your vault lease and provider write. The SDK records started and complete around it.",
    icon: Package,
    filename: "agent.ts",
    code: `// Install once: npm install revive-sdk

import { ReviveClient, type CredentialLease } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

async function sendFollowup(input: {
  runId: string;
  lease: () => Promise<CredentialLease<string>>;
  send: (request: { credential: string; idempotencyKey: string }) => Promise<unknown>;
}) {
  return revive.protectAction({
    runId: input.runId,
    connectionId: "agent-account",
    actionKey: "send_followup_email",
    credential: input.lease,
    execute: ({ credential, idempotencyKey }) =>
      input.send({ credential, idempotencyKey }),
  });
}`,
  },
  api: {
    label: "REST API",
    title: "Register from a custom executor",
    description: "Use the API when your agent runtime cannot install the gateway or SDK.",
    detail: "Register, wait for any required approval, mark started, run the provider write, then mark complete.",
    icon: TerminalWindow,
    filename: "custom-executor.mjs",
    code: `const baseUrl = "https://revivelabs.app/api";
const headers = {
  authorization: \`Bearer \${process.env.REVIVE_API_KEY}\`,
  "content-type": "application/json",
};

async function revive(path, body) {
  const response = await fetch(\`\${baseUrl}\${path}\`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function runWrite({ runId, send }) {
  const action = await revive("/v1/actions", {
    runId, connectionId: "agent-account",
    actionKey: "send_followup_email",
    idempotencyKey: \`\${runId}:send_followup_email\`,
    approvalMode: "auto",
  });
  if (
    action.replayVerdict !== "safe_to_execute" ||
    (action.approval && action.approval.status !== "approved")
  ) return action; // poll or retry after approval

  await revive(\`/v1/actions/\${action.id}/started\`, {});
  const result = await send({ idempotencyKey: action.idempotencyKey });
  await revive(\`/v1/actions/\${action.id}/complete\`, { result });
  return result;
}`,
  },
};

const NEXT_STEPS = [
  { href: "/app/api-keys", label: "Create an API key", detail: "Give the integration a workspace-scoped credential." },
  { href: "/app/action-contracts", label: "Define one outcome", detail: "Name the final provider state that means the work is done." },
  { href: "/app/transactions", label: "Watch it settle", detail: "See every step verify, recover, compensate, or escalate." },
];

export function QuickstartFlow() {
  const [active, setActive] = useState<SetupPath>("mcp");
  const [copied, setCopied] = useState(false);
  const option = PATHS[active];
  const Icon = option.icon;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(option.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="instrument-panel overflow-hidden border-[#151922]">
      <div className="grid border-b border-[#151922] lg:grid-cols-[.84fr_1.16fr]">
        <div className="p-5 sm:p-6">
          <span className="font-mono text-[8px] tracking-[.12em] text-[#4967f2]">CHOOSE A PATH</span>
          <h2 className="mt-3 max-w-[360px] text-[22px] font-semibold leading-tight tracking-[-.04em] text-[#151922]">Protect one write. Then settle the whole outcome.</h2>
          <p className="mt-2 max-w-[410px] text-[11px] leading-5 text-[#687180]">MCP is the fastest route for actions. SDK and REST also group multi-system work into verified transactions.</p>
        </div>
        <div className="grid border-t border-[#e1e2de] sm:grid-cols-3 lg:border-l lg:border-t-0">
          {(Object.keys(PATHS) as SetupPath[]).map((key) => {
            const item = PATHS[key];
            const PathIcon = item.icon;
            const selected = key === active;
            return <button key={key} onClick={() => { setActive(key); setCopied(false); }} className={`border-b border-[#e1e2de] p-4 text-left last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${selected ? "bg-[#edf0ff]" : "bg-[#fbfcf8] hover:bg-[#f7f8f5]"}`}>
              <span className={`flex h-7 w-7 items-center justify-center border ${selected ? "border-[#4967f2] text-[#2e49c8]" : "border-[#cbd1d8] text-[#687180]"}`}><PathIcon size={14} /></span>
              <span className="mt-3 block text-[10.5px] font-semibold text-[#151922]">{item.label}</span>
              <span className="mt-1 block text-[9.5px] leading-4 text-[#687180]">{key === "mcp" ? "Recommended" : key === "sdk" ? "Runtime-native" : "Custom runtime"}</span>
            </button>;
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[.78fr_1.22fr]">
        <div className="border-b border-[#151922] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <span className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><Icon size={18} /></span>
          <h3 className="mt-5 text-[20px] font-semibold leading-tight tracking-[-.035em] text-[#151922]">{option.title}</h3>
          <p className="mt-3 text-[11px] leading-5 text-[#596273]">{option.description}</p>
          <p className="mt-4 border-l-[3px] border-[#4967f2] pl-3 text-[10px] leading-5 text-[#687180]">{option.detail}</p>
        </div>
        <div className="min-w-0 bg-[#f7f8f5]">
          <div className="flex items-center justify-between border-b border-[#d8dde3] px-4 py-3 sm:px-5"><span className="font-mono text-[8.5px] text-[#7b8491]">{option.filename}</span><button onClick={() => void copy()} className="inline-flex h-7 items-center gap-1.5 border border-[#cbd1d8] bg-white px-2.5 text-[9px] font-semibold text-[#596273] transition hover:border-[#151922]">{copied ? <Check size={11} className="text-[#18724e]" /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button></div>
          <pre className="min-h-[270px] overflow-x-auto p-5 font-mono text-[10px] leading-5 text-[#252b35] sm:p-6"><code>{option.code}</code></pre>
        </div>
      </div>

      <div className="border-t border-[#151922] bg-[#fbfcf8]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[#e1e2de] px-5 py-3 sm:px-6">
          <h3 className="text-[11px] font-semibold text-[#151922]">After you install</h3>
          <p className="font-mono text-[8.5px] text-[#8a929d]">three steps to proof</p>
        </div>
        <div className="grid sm:grid-cols-3">
          {NEXT_STEPS.map((step, index) => <Link key={step.href} href={step.href} className={`group flex min-h-[88px] flex-col justify-between border-b border-[#e1e2de] px-5 py-4 transition last:border-b-0 hover:bg-[#f7f8f5] sm:border-b-0 sm:px-6 ${index ? "sm:border-l sm:border-l-[#e1e2de]" : ""}`}><span><span className="text-[10.5px] font-semibold text-[#151922]">{step.label}</span><span className="mt-1 block text-[9.5px] leading-4 text-[#687180]">{step.detail}</span></span><ArrowRight size={12} className="mt-3 text-[#4967f2] transition group-hover:translate-x-0.5" /></Link>)}
        </div>
      </div>
    </section>
  );
}
