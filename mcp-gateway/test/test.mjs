// Gateway integration test: fake Revive API + fake MCP server + real gateway.
// Asserts exactly-once (duplicate served from ledger, child called once),
// approval gating (pending → approved → executes; denied → blocked), and
// passthrough of non-tool traffic.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));

// ---------- fake Revive API ----------
const actions = new Map(); // idempotencyKey → record
let actionSeq = 0;
let approvalPolls = 0;

const apiServer = createServer(async (req, res) => {
  const body = await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
  const send = (status, payload) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  const url = req.url || "";

  if (req.method === "POST" && url === "/api/v1/actions") {
    let record = actions.get(body.idempotencyKey);
    if (!record) {
      record = {
        id: `act_${++actionSeq}`, state: "prepared", attempts: 1, resultRef: undefined,
        actionKey: body.actionKey,
        approval: undefined,
      };
      // mirror server policy: high-risk pattern + approvalMode auto → pending
      if (body.approvalMode === "auto" && /email|delete/.test(body.actionKey)) {
        record.approval = { status: body.actionKey.includes("delete") ? "denied" : "pending", requestedAt: 1, decidedBy: body.actionKey.includes("delete") ? "ops@test" : undefined };
      }
      actions.set(body.idempotencyKey, record);
      return send(200, { id: record.id, state: "new", replayVerdict: "safe_to_execute", attempts: 1, approval: record.approval });
    }
    record.attempts += 1;
    const verdict = record.state === "completed" ? "already_committed" : record.state === "started" ? "reconcile_first" : "safe_to_execute";
    return send(200, { id: record.id, state: record.state, replayVerdict: verdict, attempts: record.attempts, resultRef: record.resultRef, approval: record.approval });
  }
  const started = url.match(/^\/api\/v1\/actions\/(act_\d+)\/started$/);
  if (req.method === "POST" && started) {
    for (const record of actions.values()) if (record.id === started[1]) record.state = "started";
    return send(200, { ok: true });
  }
  const complete = url.match(/^\/api\/v1\/actions\/(act_\d+)\/complete$/);
  if (req.method === "POST" && complete) {
    for (const record of actions.values()) {
      if (record.id === complete[1]) {
        record.state = "completed";
        record.resultRef = JSON.stringify(body.result);
      }
    }
    return send(200, { ok: true });
  }
  const get = url.match(/^\/api\/v1\/actions\/(act_\d+)$/);
  if (req.method === "GET" && get) {
    for (const record of actions.values()) {
      if (record.id === get[1]) {
        if (record.approval?.status === "pending") {
          approvalPolls += 1;
          if (approvalPolls >= 1) record.approval = { status: "approved", decidedBy: "ops@test", requestedAt: 1 };
        }
        return send(200, { id: record.id, state: record.state, attempts: record.attempts, resultRef: record.resultRef, approval: record.approval });
      }
    }
    return send(404, { error: "not found" });
  }
  send(404, { error: `unhandled ${req.method} ${url}` });
});
await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
const apiPort = apiServer.address().port;

// ---------- gateway under test ----------
const gateway = spawn(process.execPath, [
  join(here, "..", "bin", "gateway.mjs"),
  "--api-key", "rv_test_key",
  "--api-url", `http://127.0.0.1:${apiPort}/api`,
  "--run-id", "test-run",
  "--approval-timeout", "20",
  "--", process.execPath, join(here, "fake-server.mjs"),
], { stdio: ["pipe", "pipe", "pipe"] });
gateway.stderr.on("data", (chunk) => process.stderr.write(`  ${chunk}`));

const responses = new Map();
let stdoutBuffer = "";
gateway.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let index;
  while ((index = stdoutBuffer.indexOf("\n")) !== -1) {
    const line = stdoutBuffer.slice(0, index).trim();
    stdoutBuffer = stdoutBuffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && responses.has(message.id)) {
      responses.get(message.id)(message);
      responses.delete(message.id);
    }
  }
});

let nextId = 0;
function request(method, params, timeoutMs = 15_000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for response to ${method} (id ${id})`)), timeoutMs);
    responses.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    gateway.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function text(message) {
  return message.result?.content?.map((item) => item.text).join("") ?? "";
}

try {
  // 1. initialize passes through and captures the server name
  const init = await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  assert.equal(init.result.serverInfo.name, "fake-server");

  // 2. first tools/call executes downstream
  const first = await request("tools/call", { name: "echo_tool", arguments: { b: 2, a: 1 } });
  assert.match(text(first), /^echo#1:echo_tool:/, `unexpected first result: ${text(first)}`);

  // 3. identical call (different key order) is served from the ledger — the
  //    fake server must NOT see a second call
  const duplicate = await request("tools/call", { name: "echo_tool", arguments: { a: 1, b: 2 } });
  assert.match(text(duplicate), /^echo#1:echo_tool:/, `duplicate was re-executed: ${text(duplicate)}`);
  assert.equal(duplicate.result.isError, undefined);

  // 4. high-risk tool pauses for approval, then executes after approval
  const approved = await request("tools/call", { name: "send_email", arguments: { to: "x@y.z" } });
  assert.match(text(approved), /^echo#2:send_email:/, `approved call did not execute: ${text(approved)}`);
  assert.ok(approvalPolls >= 1, "approval was never polled");

  // 5. denied tool never reaches the server
  const denied = await request("tools/call", { name: "delete_everything", arguments: {} });
  assert.equal(denied.result.isError, true);
  assert.match(text(denied), /denied/);

  console.log("mcp-gateway: 5/5 assertions passed");
  process.exitCode = 0;
} catch (error) {
  console.error(`mcp-gateway test FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  gateway.kill();
  apiServer.close();
}
