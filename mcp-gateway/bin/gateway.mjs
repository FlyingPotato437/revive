#!/usr/bin/env node
// revive-mcp-gateway — wrap any stdio MCP server with the Revive action ledger.
//
// Sits between an MCP client (Claude Desktop, Cursor, any MCP host) and a
// downstream MCP server. Every tools/call is registered with Revive first:
//
//   safe_to_execute    → forward to the server, then record the result
//   already_committed  → return the stored result; the tool NEVER runs twice
//   reconcile_first    → outcome of a previous attempt is unknown; blocked by
//                        default (REVIVE_ON_UNCERTAIN=execute to override)
//   approval pending   → high-risk tools (payments, email, deletes) pause
//                        until a human approves in the Revive console
//
// Usage (Claude Desktop / any MCP host config):
//   {
//     "command": "npx",
//     "args": ["revive-mcp-gateway", "--", "npx", "-y", "@some/mcp-server"],
//     "env": { "REVIVE_API_KEY": "rv_live_..." }
//   }
//
// Flags (env fallbacks in parens):
//   --api-key <key>        (REVIVE_API_KEY)   required
//   --api-url <url>        (REVIVE_API_URL)   default https://revivelabs.app/api
//   --connection-id <id>   (REVIVE_CONNECTION_ID) default "mcp"
//   --run-id <id>          (REVIVE_RUN_ID)    default "mcp-session" — stable id
//                          means duplicate calls are caught across restarts
//   --approvals <auto|off> (REVIVE_APPROVALS) default auto
//   --on-uncertain <block|execute> (REVIVE_ON_UNCERTAIN) default block
//   --approval-timeout <seconds>   (REVIVE_APPROVAL_TIMEOUT) default 600
//
// Zero dependencies. Everything that is not a tools/call passes through
// untouched, both directions, including server→client requests.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";

// ---------- config ----------
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep === -1 || sep === argv.length - 1) {
  process.stderr.write("revive-mcp-gateway: no downstream server. Usage: revive-mcp-gateway [flags] -- <command> [args...]\n");
  process.exit(2);
}
const flags = argv.slice(0, sep);
const childCmd = argv[sep + 1];
const childArgs = argv.slice(sep + 2);

function flag(name, envName, fallback) {
  const index = flags.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < flags.length) return flags[index + 1];
  return process.env[envName] || fallback;
}

const API_KEY = flag("api-key", "REVIVE_API_KEY", "");
const API_URL = flag("api-url", "REVIVE_API_URL", "https://revivelabs.app/api").replace(/\/$/, "");
const CONNECTION_ID = flag("connection-id", "REVIVE_CONNECTION_ID", "mcp");
const RUN_ID = flag("run-id", "REVIVE_RUN_ID", "mcp-session");
const APPROVALS = flag("approvals", "REVIVE_APPROVALS", "auto");
const ON_UNCERTAIN = flag("on-uncertain", "REVIVE_ON_UNCERTAIN", "block");
const APPROVAL_TIMEOUT_MS = Number(flag("approval-timeout", "REVIVE_APPROVAL_TIMEOUT", "600")) * 1000;

if (!API_KEY) {
  process.stderr.write("revive-mcp-gateway: REVIVE_API_KEY (or --api-key) is required\n");
  process.exit(2);
}

const log = (message) => process.stderr.write(`[revive-gateway] ${message}\n`);

// ---------- Revive API ----------
async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Revive API ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

// Deterministic JSON so identical arguments hash identically regardless of key order.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- action contracts ----------
// Infer a tiny, non-sensitive policy context from conventional MCP tool names
// and argument shapes. Raw arguments remain in the downstream server only.
// The context sent to Revive is deliberately limited to booleans and a count.
function valuesAtRecipientKeys(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return 0;
  if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean).length || 1;
  if (Array.isArray(value)) return value.reduce((total, item) => total + valuesAtRecipientKeys(item, depth + 1), 0);
  if (typeof value !== "object") return 0;
  const record = value;
  // Microsoft Graph recipient shape: { emailAddress: { address: "..." } }.
  // Count the recipient object, never retain its address.
  if (Object.keys(record).some((key) => /^(address|email|emailaddress|id)$/i.test(key))) return 1;
  return Object.entries(record).reduce((total, [key, nested]) => {
    if (/^(to|cc|bcc|recipient|recipients|emailaddresses|users|invitees)$/i.test(key)) {
      return total + valuesAtRecipientKeys(nested, depth + 1);
    }
    return total;
  }, 0);
}

function deriveRiskContext(toolName, args) {
  const name = String(toolName || "").toLowerCase();
  const argumentText = stable(args || {}).toLowerCase();
  const outbound = /(send|email|mail|message|invite|notify|post|publish)/.test(name);
  const monetary = /(payment|charge|refund|transfer|invoice|payout|purchase)/.test(name);
  const destructive = /(delete|remove|archive|revoke|cancel|terminate|purge|wipe)/.test(name);
  const production = /(deploy|release|publish)/.test(name) && /(?:production|prod)/.test(`${name} ${argumentText}`);
  const recipientCount = outbound ? Math.min(100000, valuesAtRecipientKeys(args)) : 0;
  const operation = monetary ? "money_movement" : destructive ? "destructive_change" : production ? "production_change" : outbound ? "outbound_message" : "unknown";
  const context = { operation };
  if (recipientCount) context.recipientCount = recipientCount;
  if (monetary) context.monetary = true;
  if (destructive) context.destructive = true;
  if (production) context.production = true;
  return context;
}

// ---------- child process ----------
const child = spawn(childCmd, childArgs, { stdio: ["pipe", "pipe", "inherit"] });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

let serverName = "mcp";
// tools/call ids we are tracking: id → { actionId } (completion recorded on response)
const tracked = new Map();
// ids of initialize requests so the server name can be captured from the result
const initIds = new Set();

function lineReader(stream, onLine) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      if (line.trim()) onLine(line);
    }
  });
}

const toClient = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const toServer = (message) => child.stdin.write(JSON.stringify(message) + "\n");

function toolError(id, text) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
}

// ---------- client → server ----------
lineReader(process.stdin, (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    child.stdin.write(line + "\n"); // not ours to fix
    return;
  }
  if (message.method === "initialize" && message.id !== undefined) initIds.add(message.id);
  if (message.method === "tools/call" && message.id !== undefined) {
    void interceptToolCall(message).catch((error) => {
      log(`ledger error: ${error.message} — failing closed`);
      toClient(toolError(message.id, `Revive gateway could not verify this call is safe to run (${error.message}). The tool was not executed.`));
    });
    return;
  }
  toServer(message);
});

// ---------- server → client ----------
lineReader(child.stdout, (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(line + "\n");
    return;
  }
  if (message.id !== undefined && initIds.has(message.id)) {
    initIds.delete(message.id);
    const name = message.result?.serverInfo?.name;
    if (typeof name === "string" && name.trim()) serverName = name.trim().replace(/\s+/g, "-").toLowerCase();
  }
  if (message.id !== undefined && tracked.has(message.id)) {
    const { actionId } = tracked.get(message.id);
    tracked.delete(message.id);
    const failed = Boolean(message.error) || Boolean(message.result?.isError);
    if (!failed) {
      // Record the outcome so any replay of this exact call returns this
      // result instead of running the tool again.
      void api(`/v1/actions/${actionId}/complete`, { body: { result: message.result } })
        .catch((error) => log(`complete failed for ${actionId}: ${error.message}`));
    } else {
      // Leave the action in "started": the next identical call gets
      // reconcile_first, which is the honest verdict after a failed attempt.
      log(`tool call failed; ${actionId} left as uncertain for reconciliation`);
    }
  }
  toClient(message);
});

// ---------- the interception ----------
async function interceptToolCall(message) {
  const toolName = message.params?.name || "unknown-tool";
  const args = message.params?.arguments ?? {};
  const actionKey = `${serverName}.${toolName}`;
  const idempotencyKey = createHash("sha256").update(`${RUN_ID}|${actionKey}|${stable(args)}`).digest("hex");
  const riskContext = deriveRiskContext(toolName, args);

  const registration = await api("/v1/actions", {
    body: {
      runId: RUN_ID,
      connectionId: CONNECTION_ID,
      actionKey,
      idempotencyKey,
      riskContext,
      ...(APPROVALS === "auto" ? { approvalMode: "auto" } : {}),
    },
  });

  // 1. Duplicate: return the recorded result. The side effect never re-runs.
  if (registration.replayVerdict === "already_committed") {
    log(`duplicate blocked: ${actionKey}`);
    let stored = null;
    try {
      stored = registration.resultRef ? JSON.parse(registration.resultRef) : null;
    } catch {
      stored = null;
    }
    if (stored && typeof stored === "object" && Array.isArray(stored.content)) {
      toClient({ jsonrpc: "2.0", id: message.id, result: stored });
    } else {
      toClient({
        jsonrpc: "2.0", id: message.id,
        result: { content: [{ type: "text", text: `Revive: this exact call already ran (${registration.attempts - 1} previous attempt${registration.attempts === 2 ? "" : "s"}). The side effect was not repeated.` }] },
      });
    }
    return;
  }

  // 2. Unknown outcome from a previous attempt: fail closed unless overridden.
  if (registration.replayVerdict === "reconcile_first" && ON_UNCERTAIN !== "execute") {
    log(`uncertain outcome blocked: ${actionKey}`);
    toClient(toolError(message.id, `Revive: a previous attempt of this exact call may have gone through, so it was blocked instead of risking a duplicate. Resolve it in the Revive console (action ${registration.id}), or set REVIVE_ON_UNCERTAIN=execute to override.`));
    return;
  }

  // 3. Approval gate: poll until a human decides.
  if (registration.approval && registration.approval.status !== "approved") {
    if (registration.approval.status === "denied") {
      toClient(toolError(message.id, `Revive: this action was denied by ${registration.approval.decidedBy || "an operator"}. The tool was not executed.`));
      return;
    }
    log(`approval pending for ${actionKey} (action ${registration.id})`);
    const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
    for (;;) {
      if (Date.now() > deadline) {
        toClient(toolError(message.id, `Revive: approval for ${actionKey} timed out after ${Math.round(APPROVAL_TIMEOUT_MS / 1000)}s. The tool was not executed. Approve it in the Revive console and ask the agent to retry.`));
        return;
      }
      await sleep(2500);
      const current = await api(`/v1/actions/${registration.id}`);
      const status = current.approval?.status;
      if (status === "approved") {
        log(`approved by ${current.approval.decidedBy || "operator"}: ${actionKey}`);
        break;
      }
      if (status === "denied") {
        toClient(toolError(message.id, `Revive: this action was denied by ${current.approval.decidedBy || "an operator"}${current.approval.reason ? ` — ${current.approval.reason}` : ""}. The tool was not executed.`));
        return;
      }
    }
  }

  // 4. Execute exactly once: mark started, forward, record completion on reply.
  await api(`/v1/actions/${registration.id}/started`, { body: {} });
  tracked.set(message.id, { actionId: registration.id });
  toServer(message);
}
