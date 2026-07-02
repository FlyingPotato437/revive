// Control-plane integration tests. Run against a dev server:
//   npm run dev   (separate terminal)
//   npm run test:api
// Covers: key auth/expiration creation, action dedupe, idempotency conflicts,
// state-machine completion edges, stale versions, and SDK-level execute-skip.
import { ReviveClient } from "../sdk/typescript/src/index";
import { createSession, SESSION_COOKIE } from "../lib/auth";
import { createServer } from "node:http";
import { getCase, openCase, transition } from "../lib/control-plane";
import { deliverRuntimeResumeJob, verifyWebhook } from "../lib/webhooks";

const BASE = process.env.REVIVE_BASE_URL || "http://localhost:3000";
let failures = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok      ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL    ${name}`, detail ?? "");
  }
}

async function main() {
  // bootstrap: demo session → workspace API key
  const login = await fetch(`${BASE}/api/auth/demo`, { method: "POST" });
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const keyResponse = await fetch(`${BASE}/api/workspaces/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: `itest-${Date.now()}` }),
  });
  const { key } = await keyResponse.json() as { key: string };
  check("bootstrap: api key minted", typeof key === "string" && key.startsWith("rv_"));
  const expiringKeyResponse = await fetch(`${BASE}/api/workspaces/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: `expiring-${Date.now()}`, expiresInDays: 30 }),
  });
  const expiringKey = await expiringKeyResponse.json() as { record?: { expiresAt?: number } };
  check(
    "keys: expiration can be selected",
    expiringKeyResponse.status === 201 && typeof expiringKey.record?.expiresAt === "number" && expiringKey.record.expiresAt > Date.now(),
    expiringKey,
  );

  // Hosted membership must affect actual workspace discovery, not only the UI.
  const memberEmail = `viewer-${Date.now()}@revive.test`;
  const addedMember = await fetch(`${BASE}/api/workspaces/members`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ email: memberEmail, role: "viewer" }),
  });
  check("rbac: owner can add a viewer", addedMember.status === 200, await addedMember.text());
  const memberCookie = `${SESSION_COOKIE}=${createSession(memberEmail)}`;
  const memberWorkspaces = await fetch(`${BASE}/api/workspaces`, { headers: { cookie: memberCookie } });
  const memberPayload = await memberWorkspaces.json() as { workspaces?: { id: string }[] };
  check("rbac: invited viewer discovers hosted workspace", memberWorkspaces.status === 200 && memberPayload.workspaces?.some((item) => item.id === "ws_revive_local"), memberPayload);
  const viewerKeyAttempt = await fetch(`${BASE}/api/workspaces/api-keys`, {
    method: "POST", headers: { "content-type": "application/json", cookie: memberCookie },
    body: JSON.stringify({ name: "viewer-must-not-create" }),
  });
  check("rbac: viewer cannot mint API keys", viewerKeyAttempt.status === 403, await viewerKeyAttempt.text());
  await fetch(`${BASE}/api/workspaces/members`, {
    method: "DELETE", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ email: memberEmail }),
  });

  const headers = { "content-type": "application/json", authorization: `Bearer ${key}` };
  const run = `itest-${Date.now()}`;
  // Persistent test databases keep credential generations between runs. A
  // unique connection makes every suite execution independent and repeatable.
  const connection = `conn-${run}`;

  // 1. auth
  const unauthorized = await fetch(`${BASE}/v1/actions`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer rv_live_bogus" }, body: "{}" });
  check("auth: bogus key → 401", unauthorized.status === 401);

  // 2. action dedupe (P0)
  const first = await (await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: run, connectionId: connection, actionKey: "sendMail", idempotencyKey: "k1" }) })).json();
  check("actions: first registration is new", first.state === "new", first);
  const replayPrepared = await (await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: run, connectionId: connection, actionKey: "sendMail", idempotencyKey: "k1" }) })).json();
  check("actions: replay of prepared (never executed) is still new", replayPrepared.state === "new", replayPrepared);
  await fetch(`${BASE}/v1/actions/${first.id}/started`, { method: "POST", headers, body: "{}" });
  const replayUncertain = await (await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: run, connectionId: connection, actionKey: "sendMail", idempotencyKey: "k1" }) })).json();
  check("actions: replay of started is uncertain", replayUncertain.state === "uncertain", replayUncertain);
  await fetch(`${BASE}/v1/actions/${first.id}/complete`, { method: "POST", headers, body: JSON.stringify({ result: { messageId: "m-1" } }) });
  const replayCompleted = await (await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: run, connectionId: connection, actionKey: "sendMail", idempotencyKey: "k1" }) })).json();
  check("actions: replay of completed returns completed + resultRef", replayCompleted.state === "completed" && typeof replayCompleted.resultRef === "string", replayCompleted);
  const conflictingConnection = await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: run, connectionId: "different-conn", actionKey: "sendMail", idempotencyKey: "k1" }) });
  check("actions: reused idempotency key with different connection → 409", conflictingConnection.status === 409);

  // 3. SDK-level dedupe: execute must run exactly once for one idempotency key
  const client = new ReviveClient({ baseUrl: BASE, apiKey: key });
  let executions = 0;
  const doAction = () => client.protectAction({
    runId: run, connectionId: connection, actionKey: "createTicket", idempotencyKey: "k2",
    credential: () => ({ connectionId: connection, provider: "microsoft", generation: 1, credential: "tok" }),
    execute: async () => { executions += 1; return { ticket: "T-1" }; },
  });
  const firstResult = await doAction();
  const secondResult = await doAction();
  check("sdk: first call executed", firstResult.status === "completed" && executions === 1);
  check("sdk: second call deduplicated, execute NOT rerun", secondResult.status === "completed" && executions === 1 && (secondResult as { deduplicated?: boolean }).deduplicated === true, { executions, secondResult });

  // 3b. credential failure parks WITHOUT ambiguity: retry executes normally
  let lateExecutions = 0;
  const flaky = (fail: boolean) => client.protectAction({
    runId: run, connectionId: connection, actionKey: "lateCredential", idempotencyKey: "k4",
    credential: () => {
      if (fail) { const e: any = new Error("invalid_grant"); e.code = "AADSTS700082"; throw e; }
      return { connectionId: connection, provider: "microsoft", generation: 1, credential: "tok" };
    },
    execute: async () => { lateExecutions += 1; return "done"; },
    classifyError: (e: any) => e?.code?.startsWith("AADSTS") ? { code: e.code, reason: "dead grant", policy: "interactive_reauth" } : null,
  });
  const parkedAttempt = await flaky(true);
  check("sdk: credential failure parks", parkedAttempt.status === "parked" && lateExecutions === 0);
  const retryAttempt = await flaky(false);
  check("sdk: retry after credential-park executes (no false ambiguity)", retryAttempt.status === "completed" && lateExecutions === 1, { retryAttempt, lateExecutions });

  // 4. state machine: parked case cannot jump to completed
  const opened = await (await fetch(`${BASE}/v1/recovery-cases`, { method: "POST", headers, body: JSON.stringify({ runId: run, connectionId: connection, actionKey: "sendMail", idempotencyKey: "k1", policy: "interactive_reauth", reason: "AADSTS700082 itest" }) })).json();
  check("cases: opens parked", opened.state === "parked", opened);
  check("cases: recovery URL is a signed capability", typeof opened.url === "string" && opened.url.startsWith("/reauthorize/v1."), opened.url);
  const recoveryDetails = await fetch(`${BASE}${opened.url.replace("/reauthorize/", "/api/reconsent/")}`);
  const recoveryPayload = await recoveryDetails.json();
  check("cases: signed recovery capability resolves", recoveryDetails.status === 200 && recoveryPayload.ticket?.runId === run, recoveryPayload);
  const falseComplete = await fetch(`${BASE}/v1/recovery-cases/${opened.id}/transition`, { method: "POST", headers, body: JSON.stringify({ to: "completed", expectedVersion: opened.version }) });
  check("cases: parked → completed rejected", falseComplete.status === 409);
  const escape = await fetch(`${BASE}/v1/recovery-cases/${opened.id}/transition`, { method: "POST", headers, body: JSON.stringify({ to: "escalated", expectedVersion: opened.version }) });
  check("cases: parked → escalated (escape terminal) allowed", escape.status === 200);

  // 5. legal completion path on a fresh case
  const second = await (await fetch(`${BASE}/v1/recovery-cases`, { method: "POST", headers, body: JSON.stringify({ runId: `${run}-b`, connectionId: connection, actionKey: "sendMail", idempotencyKey: "k3", policy: "interactive_reauth", reason: "AADSTS50173 itest" }) })).json();
  let version = second.version;
  for (const to of ["awaiting_authorization", "identity_verified", "resumed", "completed"]) {
    const response = await fetch(`${BASE}/v1/recovery-cases/${second.id}/transition`, { method: "POST", headers, body: JSON.stringify({ to, expectedVersion: version }) });
    const payload = await response.json();
    if (response.status !== 200) { check(`cases: legal walk ${to}`, false, payload); break; }
    version = payload.version;
    if (to === "completed") check("cases: resumed → completed allowed", payload.state === "completed");
  }

  // 6. stale version rejected
  const stale = await fetch(`${BASE}/v1/recovery-cases/${second.id}/transition`, { method: "POST", headers, body: JSON.stringify({ to: "escalated", expectedVersion: 1 }) });
  check("cases: stale version → 409", stale.status === 409);

  // 7. hosted generation fencing
  const fenceConn = `conn-fence-${Date.now()}`;
  const fenceRegister = await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: `${run}-f`, connectionId: fenceConn, actionKey: "a", idempotencyKey: "kf1", leaseGeneration: 1 }) });
  check("fence: generation 1 accepted on fresh lease", fenceRegister.status === 200);
  const fenceCase = await (await fetch(`${BASE}/v1/recovery-cases`, { method: "POST", headers, body: JSON.stringify({ runId: `${run}-f`, connectionId: fenceConn, actionKey: "a", idempotencyKey: "kf1", policy: "interactive_reauth", reason: "fence itest", leaseGeneration: 1 }) })).json();
  let fenceVersion = fenceCase.version;
  let rotated: number | undefined;
  for (const to of ["awaiting_authorization", "identity_verified"]) {
    const response = await (await fetch(`${BASE}/v1/recovery-cases/${fenceCase.id}/transition`, { method: "POST", headers, body: JSON.stringify({ to, expectedVersion: fenceVersion }) })).json();
    fenceVersion = response.version;
    if (to === "identity_verified") rotated = response.rotatedGeneration;
  }
  check("fence: identity_verified rotates lease to generation 2", rotated === 2, { rotated });
  const staleWorker = await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: `${run}-f2`, connectionId: fenceConn, actionKey: "b", idempotencyKey: "kf2", leaseGeneration: 1 }) });
  check("fence: stale worker (generation 1) rejected after rotation", staleWorker.status === 409);
  const freshWorker = await fetch(`${BASE}/v1/actions`, { method: "POST", headers, body: JSON.stringify({ runId: `${run}-f2`, connectionId: fenceConn, actionKey: "b", idempotencyKey: "kf3", leaseGeneration: 2 }) });
  check("fence: rotated worker (generation 2) accepted", freshWorker.status === 200);

  // 8. A runtime resume is accepted only after a signed, matching checkpoint acknowledgement.
  const resumeSecret = `runtime-test-${Date.now()}`;
  process.env.REVIVE_RUNTIME_RESUME_SECRET = resumeSecret;
  const runtimeRun = `${run}-runtime`;
  const checkpointId = `checkpoint-${Date.now()}`;
  let runtimeCase = await openCase("ws_revive_local", {
    runId: runtimeRun, checkpointId, connectionId: connection,
    actionKey: "createDraft", idempotencyKey: `runtime-${Date.now()}`,
    provider: "microsoft", reason: "runtime acknowledgement test", actor: "integration-test",
  });
  for (const to of ["classified", "parked", "awaiting_authorization", "identity_verified"] as const) {
    runtimeCase = await transition(runtimeCase.workspaceId, runtimeCase.id, {
      to, expectedVersion: runtimeCase.version, actor: "integration-test",
    });
  }
  let signatureVerified = false;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      signatureVerified = verifyWebhook(
        resumeSecret,
        String(request.headers["webhook-signature"] || ""),
        String(request.headers["webhook-id"] || ""),
        String(request.headers["webhook-timestamp"] || ""),
        body,
      );
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, resumed: true, runId: runtimeRun, checkpointId }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await deliverRuntimeResumeJob({
      id: `runtime-job-${Date.now()}`,
      kind: "runtime.resume",
      attempts: 1,
      maxAttempts: 8,
      payload: {
        endpoint: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
        workspaceId: runtimeCase.workspaceId,
        caseId: runtimeCase.id,
        runId: runtimeRun,
        checkpointId,
        connectionId: connection,
        actionKey: runtimeCase.actionKey,
        idempotencyKey: runtimeCase.idempotencyKey,
        generation: 2,
      },
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  const resumedCase = await getCase(runtimeCase.workspaceId, runtimeCase.id);
  check("runtime: callback signature verifies", signatureVerified);
  check("runtime: matching checkpoint acknowledgement marks resumed", resumedCase?.state === "resumed", resumedCase);

  console.log(failures ? `\n${failures} FAILURES` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
