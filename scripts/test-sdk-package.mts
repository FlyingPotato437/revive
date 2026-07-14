import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdk = join(root, "sdk", "typescript");
const temporary = mkdtempSync(join(tmpdir(), "revive-sdk-package-"));

function npm(args: string[], cwd: string): string {
  return execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  });
}

try {
  let installTarget = process.env.REVIVE_SDK_PACKAGE;
  if (!installTarget) {
    npm(["run", "build"], sdk);
    const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", temporary], sdk)) as Array<{ filename: string }>;
    assert.equal(packed.length, 1, "npm pack must produce one archive");
    installTarget = join(temporary, packed[0].filename);
  }
  writeFileSync(join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
  npm(["install", "--ignore-scripts", installTarget], temporary);

  const installedPackage = JSON.parse(readFileSync(join(temporary, "node_modules", "revive-sdk", "package.json"), "utf8")) as { version: string };
  assert.equal(installedPackage.version, "0.2.0");
  const revive = await import(pathToFileURL(join(temporary, "node_modules", "revive-sdk", "dist", "index.js")).href);
  for (const name of [
    "ReviveClient",
    "createLangGraphInterruptHandler",
    "createTemporalFailureSignal",
    "createMcpElicitationHandler",
    "createResumeWebhookHandler",
    "verifyReviveWebhookSignature",
  ]) assert.equal(typeof revive[name], "function", `${name} must be exported by the packed SDK`);

  let detectedPath = "";
  const client = new revive.ReviveClient({
    baseUrl: "https://control.example/api",
    apiKey: "rv_live_package_test",
    transport: undefined,
  });
  // Exercise the actual HTTP transport without opening a network port.
  const transport = new revive.HttpReviveTransport({
    baseUrl: "https://control.example/api",
    apiKey: "rv_live_package_test",
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      detectedPath = new URL(String(input)).pathname;
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer rv_live_package_test");
      return new Response(JSON.stringify({ run: {
        id: "dr_package", runId: "run_package", generation: 1, runtime: "langgraph",
        category: "missing_input", confidence: 1, recoverable: true,
        suggestedActionType: "clarification", suggestedRecipientRole: "run owner",
        suggestedQuestion: "Provide the missing value", inputTokens: 0, outputTokens: 0,
        estimatedCostUsd: 0, status: "detected",
      } }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });
  const httpClient = new revive.ReviveClient({ transport });
  await httpClient.detectDeadRun({
    runId: "run_package", checkpointId: "cp_package", generation: 1,
    idempotencyKey: "failure_package", runtime: "langgraph", failureMessage: "missing input",
  });
  assert.equal(detectedPath, "/api/v1/dead-runs");
  assert.ok(client, "hosted client constructor remains installable");

  const secret = "package-test-secret-at-least-32-bytes";
  let resumeCalls = 0;
  const handler = revive.createResumeWebhookHandler({
    secret,
    resume: async (data: Record<string, unknown>, context: { eventType: string }) => {
      resumeCalls += 1;
      assert.equal(context.eventType, "action_request.completed");
      assert.deepEqual(data.response, { billing_contact_email: "billing@example.com" });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    },
  });
  const event = {
    id: "action_resume_package_g1",
    type: "action_request.completed",
    createdAt: new Date().toISOString(),
    data: {
      actionRequestId: "uar_package", workspaceId: "ws_package", runId: "run_package",
      checkpointId: "cp_package", generation: 1,
      response: { billing_contact_email: "billing@example.com" },
    },
  };
  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `v1,${createHmac("sha256", secret).update(`${event.id}.${timestamp}.${rawBody}`).digest("hex")}`;
  const request = {
    headers: {
      "webhook-id": event.id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    },
    rawBody,
  };
  const [first, concurrent] = await Promise.all([handler(request), handler(request)]);
  const replay = await handler(request);
  for (const response of [first, concurrent, replay]) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      ok: true, resumed: true, runId: "run_package", checkpointId: "cp_package", generation: 1,
    });
  }
  assert.equal(resumeCalls, 1, "concurrent and later retries must share one successful receipt");

  const rejected = await handler({ ...request, headers: { ...request.headers, "webhook-signature": "v1,bad" } });
  assert.equal(rejected.status, 401);
  console.log(`revive-sdk clean install (${process.env.REVIVE_SDK_PACKAGE || "local package archive"}): PASS`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
