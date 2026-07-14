import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation | Revive",
  description: "Integrate dead-run detection, protected actions, human resolution, and signed runtime resume callbacks.",
};

const contents = [
  ["model", "Recovery model"],
  ["detect", "Detect a dead run"],
  ["resolve", "Request human action"],
  ["resume", "Resume the runtime"],
  ["protect", "Protect external writes"],
  ["verify", "Verify the integration"],
  ["limits", "Supported path and limits"],
] as const;

function CodeBlock({ children }: { children: string }) {
  return <pre className="mt-6 overflow-x-auto border border-[#151922] bg-[#151922] p-5 font-mono text-[10.5px] leading-6 text-[#eef0eb]"><code>{children}</code></pre>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 border-t border-[#bfc5cc] py-14 first:border-t-0 first:pt-0 sm:py-16"><h2 className="text-[clamp(28px,4vw,42px)] font-semibold tracking-[-0.05em]">{title}</h2><div className="mt-6 max-w-[760px] text-[13px] leading-7 text-[#596273]">{children}</div></section>;
}

export default function DocumentationPage() {
  return <article className="min-h-[100dvh] bg-[#f4f5f1] text-[#151922]">
    <header className="border-b border-[#151922] bg-[#edf0ff]">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#4967f2]">DOCUMENTATION</p>
        <h1 className="mt-6 max-w-[850px] text-[clamp(42px,6vw,76px)] font-semibold leading-[0.96] tracking-[-0.06em]">Add recovery at the boundary you already own.</h1>
        <p className="mt-7 max-w-[660px] text-[15px] leading-7 text-[#5f6876]">Revive does not replace your runtime. It records the failed run, routes the required human action, and returns a signed continuation to the original checkpoint.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/signup?next=%2Fapp%2Fquickstart" className="inline-flex h-10 items-center bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Start quickstart</Link><Link href="/resources/whitepaper" className="inline-flex h-10 items-center border border-[#151922] px-4 text-[10.5px] font-semibold text-[#151922] transition hover:bg-white active:translate-y-px">Read evidence</Link></div>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-20 lg:py-24">
      <aside className="hidden lg:block"><nav aria-label="Documentation contents" className="sticky top-24 border-l border-[#aeb5bd] pl-5"><p className="mb-5 font-mono text-[9px] text-[#8a929d]">ON THIS PAGE</p>{contents.map(([href, label]) => <a key={href} href={`#${href}`} className="block py-1.5 text-[10.5px] text-[#687180] transition-colors hover:text-[#2e49c8]">{label}</a>)}</nav></aside>
      <div className="min-w-0">
        <Section id="model" title="Recovery model"><p>A recovery has four durable coordinates: workspace, run, checkpoint, and lease generation. Revive accepts a continuation only when all four still match.</p><div className="mt-7 grid gap-px border border-[#151922] bg-[#151922] sm:grid-cols-4">{[["Detect", "Record the terminal blocker."], ["Resolve", "Route one scoped human action."], ["Fence", "Advance the credential generation."], ["Resume", "Continue the same checkpoint."]].map(([title, body]) => <div key={title} className="bg-[#fbfcf8] p-4"><h3 className="text-[11px] font-semibold text-[#151922]">{title}</h3><p className="mt-2 text-[10px] leading-5 text-[#687180]">{body}</p></div>)}</div></Section>

        <Section id="detect" title="Detect a dead run"><p>Call the detector at an existing terminal failure or interrupt boundary. Send identifiers and a redacted trace, not provider tokens or raw secrets.</p><CodeBlock>{`import { ReviveClient } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

await revive.detectDeadRun({
  runId: state.runId,
  checkpointId: state.checkpointId,
  generation: state.generation,
  idempotencyKey: \`${'${state.runId}'}:terminal\`,
  failureMessage: error.message,
  trace: redactedTrace,
});`}</CodeBlock></Section>

        <Section id="resolve" title="Request the human action"><p>Create a recipient-bound request only after the blocker is classified as recoverable. Declare the fields Revive may return to the runtime.</p><CodeBlock>{`await revive.requestAction({
  runId: state.runId,
  checkpointId: state.checkpointId,
  generation: state.generation,
  idempotencyKey: \`${'${state.runId}'}:approval\`,
  actionType: "approval",
  title: "Approve the customer refund",
  recipient: {
    subjectId: "finance-owner",
    email: "finance@example.com",
  },
});`}</CodeBlock></Section>

        <Section id="resume" title="Resume the runtime"><p>Use the SDK receiver for both <code>recovery.resume_requested</code> and <code>action_request.completed</code>. It verifies the exact raw request before parsing, suppresses concurrent retries, and returns the run/checkpoint/generation acknowledgement the control plane requires.</p><CodeBlock>{`import express from "express";
import { createResumeWebhookHandler } from "revive-sdk";

const receive = createResumeWebhookHandler({
  secret: process.env.REVIVE_RESUME_SECRET,
  receipts: durableReceiptStore,
  async resume(data, context) {
    await runtime.resume({
      runId: data.runId,
      checkpointId: data.checkpointId,
      generation: data.generation,
      input: context.eventType === "action_request.completed"
        ? data.response
        : { connectionId: data.connectionId },
    });
  },
});

app.post("/hooks/revive", express.raw({ type: "application/json" }), async (req, res) => {
  const result = await receive({ headers: req.headers, rawBody: req.body });
  res.status(result.status).json(result.body);
});`}</CodeBlock><p className="mt-5">Use a database-backed receipt store in production and make the checkpoint resume operation idempotent. An in-memory receipt cannot cover a process restart.</p></Section>

        <Section id="protect" title="Protect external writes"><p>Wrap mutations that cannot safely run twice. A replay with an uncertain result must reconcile against the provider before Revive permits another execution.</p><CodeBlock>{`const result = await revive.protectAction({
  runId: state.runId,
  checkpointId: "issue-refund",
  connectionId: "payments-primary",
  actionKey: "payments.refund",
  idempotencyKey: state.refundKey,
  riskContext: { operation: "money_movement", monetary: true },
  execute: issueRefund,
  reconcile: findRefundByIdempotencyKey,
});`}</CodeBlock></Section>

        <Section id="verify" title="Verify the integration"><p>Registering a URL does not activate automatic continuation. Quickstart sends a signed probe and marks the endpoint Verified only when it returns the expected acknowledgement. It also requires a real, non-onboarding failure event before setup can complete.</p><CodeBlock>{`curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \\
  -H "Authorization: Bearer $REVIVE_API_KEY"

# Repository acceptance tests
npm run test:sdk-package
npm run test:golden`}</CodeBlock><div className="mt-7 border border-[#151922] bg-[#fbfcf8] p-5"><h3 className="text-[13px] font-semibold">Integration acceptance</h3><ul className="mt-4 grid gap-3 text-[11px] leading-5 text-[#596273] sm:grid-cols-2"><li>Clean package install succeeds</li><li>Real failure boundary received</li><li>Signed callback verified</li><li>Duplicate delivery suppressed</li><li>Kill/restart resume passes</li><li>Ambiguous write reconciles once</li></ul></div></Section>

        <Section id="limits" title="Supported path and limits"><p>The mechanically tested alpha path is Node.js 20+, <code>revive-sdk</code> 0.2.x, the hosted control plane, an existing durable checkpointer, an HTTPS callback using the SDK receiver, and a database-backed receipt store. Microsoft is currently the only certified hosted credential-recovery provider; other provider connectors are provisional.</p><p className="mt-5">Revive cannot reconstruct state your runtime discarded, and it cannot make an arbitrary provider write exactly-once without provider idempotency or a reliable reconciliation read. A signed probe proves callback reachability and protocol correctness; every design partner must still run the kill/restart check against its real runtime before production traffic.</p><p className="mt-5"><a className="font-semibold text-[#2e49c8] underline underline-offset-4" href="https://github.com/FlyingPotato437/revive/blob/main/docs/supported-integration.md">Read the complete supported integration guide</a>.</p></Section>
      </div>
    </div>
  </article>;
}
