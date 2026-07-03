#!/usr/bin/env node
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = Number(process.env.REVIVE_KILLER_PORT || 3100);
const callbackPort = Number(process.env.REVIVE_RUNTIME_CALLBACK_PORT || 8788);
const baseUrl = `http://127.0.0.1:${port}`;
const callbackSecret = crypto.randomBytes(32).toString("hex");
const required = ["NANGO_SECRET_KEY", "NANGO_CERT_CONNECTION_ID"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing ${missing.join(", ")} in .env.local.`);
  process.exit(2);
}

const sharedEnv = {
  ...process.env,
  REVIVE_BASE_URL: baseUrl,
  REVIVE_PUBLIC_URL: baseUrl,
  REVIVE_RUNTIME_RESUME_URL: `http://127.0.0.1:${callbackPort}/revive/resume`,
  REVIVE_RUNTIME_RESUME_SECRET: callbackSecret,
  REVIVE_RUNTIME_CALLBACK_HOST: "127.0.0.1",
  REVIVE_RUNTIME_CALLBACK_PORT: String(callbackPort),
};

const next = spawn("./node_modules/.bin/next", ["dev", "-p", String(port)], {
  cwd: process.cwd(),
  env: sharedEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

next.stdout.on("data", (chunk) => process.stdout.write(`[control-plane] ${chunk}`));
next.stderr.on("data", (chunk) => process.stderr.write(`[control-plane] ${chunk}`));

async function waitUntilReady() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (next.exitCode !== null) throw new Error(`control plane exited with ${next.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("control plane did not become ready within 45 seconds");
}

let demo;
let generatedKeyId;
let generatedKeyCookie;
let shuttingDown = false;
function stopProcesses() {
  demo?.kill("SIGTERM");
  next.kill("SIGTERM");
}

async function createTemporaryApiKey() {
  if (process.env.REVIVE_API_KEY) return process.env.REVIVE_API_KEY;
  const login = await fetch(`${baseUrl}/api/auth/demo`, { method: "POST" });
  if (!login.ok) throw new Error("could not open a local demo session");
  generatedKeyCookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const response = await fetch(`${baseUrl}/api/workspaces/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: generatedKeyCookie },
    body: JSON.stringify({ name: `killer-demo-${Date.now()}`, expiresInDays: 1 }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.key || !payload.record?.id) {
    throw new Error(payload.error || "could not mint the demo API key");
  }
  generatedKeyId = payload.record.id;
  return payload.key;
}

async function resolveRecipient() {
  if (process.env.REVIVE_DEMO_RECIPIENT) return process.env.REVIVE_DEMO_RECIPIENT;
  const response = await fetch("https://api.nango.dev/proxy/v1.0/me?$select=mail,userPrincipalName", {
    headers: {
      authorization: `Bearer ${process.env.NANGO_SECRET_KEY}`,
      "Provider-Config-Key": process.env.NANGO_CERT_INTEGRATION_ID || "microsoft-tenant-specific",
      "Connection-Id": process.env.NANGO_CERT_CONNECTION_ID,
    },
  });
  const profile = await response.json();
  const recipient = profile.mail || profile.userPrincipalName;
  if (!response.ok || !recipient) {
    throw new Error("could not resolve the connected Microsoft test mailbox");
  }
  return recipient;
}

async function revokeTemporaryApiKey() {
  if (!generatedKeyId || !generatedKeyCookie) return;
  let revoked = false;
  try {
    const response = await fetch(`${baseUrl}/api/workspaces/api-keys`, {
      method: "DELETE",
      headers: { "content-type": "application/json", cookie: generatedKeyCookie },
      body: JSON.stringify({ keyId: generatedKeyId }),
      signal: AbortSignal.timeout(3_000),
    });
    revoked = response.ok;
  } catch { /* the child web process can receive Ctrl+C at the same time */ }
  if (!revoked && process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL, {
      ssl: process.env.REVIVE_DATABASE_SSL === "disable" ? false : "require",
      max: 1,
    });
    try {
      await sql`update revive_api_keys set revoked_at = coalesce(revoked_at, now()) where id = ${generatedKeyId}`;
      revoked = true;
    } finally {
      await sql.end();
    }
  }
  if (!revoked) console.error(`Could not revoke temporary API key ${generatedKeyId}`);
  generatedKeyId = undefined;
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  demo?.kill("SIGTERM");
  await revokeTemporaryApiKey();
  next.kill("SIGTERM");
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { void shutdown(130); });
}

try {
  await waitUntilReady();
  const apiKey = await createTemporaryApiKey();
  const recipient = await resolveRecipient();
  demo = spawn(".venv/bin/python", ["sidecar/benchmarks/live_graph_killer_demo.py"], {
    cwd: process.cwd(),
    env: { ...sharedEnv, REVIVE_API_KEY: apiKey, REVIVE_DEMO_RECIPIENT: recipient },
    stdio: "inherit",
  });
  const code = await new Promise((resolve) => demo.once("exit", (value) => resolve(value ?? 1)));
  if (!shuttingDown) {
    await revokeTemporaryApiKey();
    stopProcesses();
    process.exit(code);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (!shuttingDown) {
    await revokeTemporaryApiKey();
    stopProcesses();
    process.exit(1);
  }
}
