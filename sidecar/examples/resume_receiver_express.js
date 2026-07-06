/**
 * Express resume receiver — production shape for Node runtimes.
 *
 * Receives signed `recovery.resume_requested` callbacks from the Revive control
 * plane, verifies the HMAC, resumes the parked run from its checkpoint, and
 * acks so the case transitions identity_verified -> resumed -> completed.
 *
 * Register the deployed URL once per workspace:
 *
 *   curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint \
 *     -H "authorization: Bearer $REVIVE_API_KEY" -H "content-type: application/json" \
 *     -d '{"url": "https://agents.example.com/revive/resume", "secret": "'$REVIVE_RESUME_SECRET'"}'
 *
 *   # verify the wiring end to end before relying on it:
 *   curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \
 *     -H "authorization: Bearer $REVIVE_API_KEY"
 *
 * Run:  REVIVE_RESUME_SECRET=… node resume_receiver_express.js
 * Requires: npm install express
 */
const crypto = require("node:crypto");
const express = require("express");

const SECRET = process.env.REVIVE_RESUME_SECRET;
const TOLERANCE_SECONDS = 300;
if (!SECRET) throw new Error("REVIVE_RESUME_SECRET is required");

/** Constant-time check of `v1,<hmac-sha256-hex>` over `{id}.{timestamp}.{body}`. */
function verifySignature(signature, webhookId, timestamp, rawBody) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > TOLERANCE_SECONDS) return false;
  const signed = Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`), rawBody]);
  const expected = "v1," + crypto.createHmac("sha256", SECRET).update(signed).digest("hex");
  const a = Buffer.from(signature || "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Resume the parked run identified by the callback. MUST have resumed the run
 * before returning — the acknowledgement tells the control plane to mark the
 * case `resumed`. Throw on failure and delivery will be retried.
 *
 * data: { caseId, workspaceId, runId, checkpointId, connectionId, actionKey,
 *         idempotencyKey, generation }
 *
 * LangGraph.js runtimes typically do:
 *
 *   const { graph, config } = runs.get(data.runId); // checkpointer-backed registry
 *   await graph.invoke(new Command({ resume: {
 *     connection_id: data.connectionId,
 *     lease_generation: data.generation,
 *   }}), config);
 */
async function resumeRun(data) {
  throw new Error("wire this to your run registry");
}

const acked = new Map(); // webhook-id -> acknowledgement (dedup across retries)

const app = express();
// Raw body: the signature covers the exact bytes on the wire.
app.post("/revive/resume", express.raw({ type: "*/*" }), async (req, res) => {
  const webhookId = req.get("webhook-id") || "";
  const timestamp = req.get("webhook-timestamp") || "";
  const signature = req.get("webhook-signature") || "";
  if (!verifySignature(signature, webhookId, timestamp, req.body)) {
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }
  let event;
  try {
    event = JSON.parse(req.body);
  } catch {
    return res.status(400).json({ ok: false, error: "invalid JSON" });
  }
  if (event.type === "recovery.resume_test") return res.json({ ok: true, test: true });
  if (event.type !== "recovery.resume_requested") return res.json({ ok: true, ignored: event.type });
  if (acked.has(webhookId)) return res.json(acked.get(webhookId)); // idempotent retry

  try {
    await resumeRun(event.data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
  const ack = { ok: true, resumed: true, runId: event.data.runId, checkpointId: event.data.checkpointId };
  acked.set(webhookId, ack);
  return res.json(ack);
});

app.listen(process.env.PORT || 8752, () => console.log("revive resume receiver listening"));
