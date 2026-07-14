import assert from "node:assert/strict";
import { createServer } from "node:http";

let received: Record<string, unknown> | null = null;
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200).end();
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address === "object");
process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${address.port}/v1/traces`;
process.env.OTEL_SERVICE_NAME = "revive-test";

const { emitSpan } = await import("../lib/telemetry.ts");
await emitSpan("revive.recovery.transition", {
  "revive.workspace_id": "ws_test",
  "revive.run_id": "run_test",
  "revive.state": "identity_verified",
  "revive.generation": 2,
}, { traceSeed: "ws_test:run_test" });

assert(received);
const resources = received.resourceSpans as Array<Record<string, unknown>>;
const scopes = resources[0].scopeSpans as Array<Record<string, unknown>>;
const spans = scopes[0].spans as Array<Record<string, unknown>>;
assert.equal(spans[0].name, "revive.recovery.transition");
assert.equal(String(spans[0].traceId).length, 32);
assert.equal((spans[0].attributes as unknown[]).length, 4);
await new Promise<void>((resolve) => server.close(() => resolve()));
console.log("telemetry: OTLP/HTTP span schema and correlation passed");

