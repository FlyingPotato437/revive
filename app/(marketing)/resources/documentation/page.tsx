import type { Metadata } from "next";
import Link from "next/link";
import { DocsCodeBlock } from "@/components/marketing/DocsCodeBlock";

export const metadata: Metadata = {
  title: "Documentation | Revive",
  description: "Install Revive, report blocked agent runs, receive signed continuations, and protect external writes.",
};

type DocsLink = readonly [id: string, label: string];
type DocsGroup = { label: string; links: readonly DocsLink[] };

const groups: readonly DocsGroup[] = [
  { label: "Get started", links: [["overview", "Overview"], ["install", "Install and authenticate"]] },
  { label: "Recovery flow", links: [["detect", "Report a blocked run"], ["request", "Request human action"], ["receiver", "Receive continuations"], ["endpoint", "Verify the endpoint"]] },
  { label: "Execution safety", links: [["protect", "Protect external writes"], ["acceptance", "Acceptance checks"], ["limits", "Current limits"]] },
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="docs-section"><p className="docs-section-index">{eyebrow}</p><h2>{title}</h2>{children}</section>;
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="docs-inline-code">{children}</code>;
}

const installCode = `npm install revive-sdk@^0.2.0`;

const detectCode = `import {
  ReviveClient,
  createLangGraphInterruptHandler,
} from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

const reportBlockedRun = createLangGraphInterruptHandler(revive);

await reportBlockedRun({
  runId: config.configurable.thread_id,
  checkpointId: state.checkpointId,
  generation: state.generation,
  failureMessage: error.message,
  trace: redactTrace(state.trace),
  idempotencyKey: \`${"${config.configurable.thread_id}"}:${"${state.checkpointId}"}:blocked\`,
});`;

const requestCode = `const { request } = await revive.reviveDeadRun({
  deadRunId: detected.id,
  recipient: {
    subjectId: "finance-owner",
    email: "finance@example.com",
  },
  destinationUrl: "https://app.example.com/refunds/review",
});

console.log(request.url); // one-use, recipient-bound URL`;

const receiverCode = `import express from "express";
import {
  createResumeWebhookHandler,
  type ResumeReceiptStore,
} from "revive-sdk";

const receipts: ResumeReceiptStore = {
  get: (webhookId) => receiptDatabase.get(webhookId),
  put: (webhookId, acknowledgement) =>
    receiptDatabase.insertIfAbsent(webhookId, acknowledgement),
};

const receiveRevive = createResumeWebhookHandler({
  secret: process.env.REVIVE_RESUME_SECRET!,
  receipts,
  async resume(data, context) {
    await checkpointRuntime.resume({
      runId: String(data.runId),
      checkpointId: data.checkpointId
        ? String(data.checkpointId)
        : undefined,
      generation: Number(data.generation),
      input: context.eventType === "action_request.completed"
        ? data.response
        : { connectionId: data.connectionId },
    });
  },
});

const app = express();
app.post(
  "/hooks/revive",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const result = await receiveRevive({
      headers: req.headers,
      rawBody: req.body,
    });
    res.status(result.status).json(result.body);
  },
);`;

const endpointCode = `curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint \\
  -H "Authorization: Bearer $REVIVE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\"url\":\"https://agents.example.com/hooks/revive\",\"secret\":\"$REVIVE_RESUME_SECRET\"}"

curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \\
  -H "Authorization: Bearer $REVIVE_API_KEY"`;

const protectCode = `const result = await revive.protectAction({
  runId,
  checkpointId: "issue-refund",
  connectionId: "payments-primary",
  actionKey: "payments.refund",
  idempotencyKey: refundIdempotencyKey,
  credential: loadCredentialLease,
  execute: issueRefund,
  reconcile: findRefundByIdempotencyKey,
});`;

export default function DocumentationPage() {
  return <div className="docs-shell">
    <header className="docs-hero">
      <div className="docs-container">
        <nav aria-label="Breadcrumb"><Link href="/resources">Resources</Link><span>/</span><span>Documentation</span></nav>
        <div className="docs-hero-grid">
          <div>
            <div className="docs-version"><span />SDK 0.2.x · design-partner alpha</div>
            <h1>Recover a blocked run without rebuilding your runtime.</h1>
            <p>Report a durable checkpoint, collect the exact human action, and receive one signed continuation for the same run and generation.</p>
          </div>
          <div className="docs-install-card">
            <span>Install the TypeScript SDK</span>
            <code>{installCode}</code>
            <Link href="/signup?next=%2Fapp%2Fquickstart">Open guided setup <span aria-hidden>→</span></Link>
          </div>
        </div>
      </div>
    </header>

    <div className="docs-container docs-layout">
      <aside className="docs-sidebar">
        <nav aria-label="Documentation navigation">
          {groups.map((group) => <div key={group.label}><p>{group.label}</p>{group.links.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</div>)}
        </nav>
      </aside>

      <article className="docs-prose">
        <Section id="overview" eyebrow="01 — Mental model" title="Revive owns the exception, not the runtime">
          <p>Your runtime remains responsible for durable execution. Revive records the terminal blocker, binds a human response to the intended recipient and execution coordinates, and returns control to the checkpoint you already persist.</p>
          <div className="docs-flow" aria-label="Recovery flow">
            {["Report blocker", "Collect action", "Verify response", "Resume checkpoint"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></div>)}
          </div>
          <div className="docs-note"><strong>Required coordinates</strong><p>Use a stable <InlineCode>runId</InlineCode>, <InlineCode>checkpointId</InlineCode>, and monotonic <InlineCode>generation</InlineCode>. IDs that disappear with the original process cannot support recovery.</p></div>
        </Section>

        <Section id="install" eyebrow="02 — Setup" title="Install and authenticate">
          <p>Revive’s tested TypeScript path requires Node.js 20 or newer. Create a project-scoped operator key in <strong>Workspace → API keys</strong> and keep it in the server runtime.</p>
          <DocsCodeBlock code={installCode} language="bash" label="Terminal" />
          <DocsCodeBlock code={`REVIVE_API_KEY=rv_live_...\nREVIVE_RESUME_SECRET=generate-at-least-32-random-bytes`} language="bash" label=".env" />
        </Section>

        <Section id="detect" eyebrow="03 — Detection" title="Report a blocked run">
          <p>Call the adapter from an existing terminal failure or interrupt boundary. Send a redacted trace and runtime-owned identifiers—never provider tokens, cookies, or raw credentials.</p>
          <DocsCodeBlock code={detectCode} language="typescript" label="agent-boundary.ts" />
          <p>Temporal uses <InlineCode>createTemporalFailureSignal</InlineCode>. MCP runtimes use <InlineCode>createMcpElicitationHandler</InlineCode>. All three produce the same control-plane record.</p>
        </Section>

        <Section id="request" eyebrow="04 — Human action" title="Ask only for the missing decision">
          <p>Once a blocker is recoverable, send one recipient-bound request. Revive accepts only the declared response fields and binds the completion to the same run, checkpoint, and generation.</p>
          <DocsCodeBlock code={requestCode} language="typescript" label="request-resolution.ts" />
        </Section>

        <Section id="receiver" eyebrow="05 — Continuation" title="Receive both continuation events">
          <p>The receiver must handle <InlineCode>recovery.resume_requested</InlineCode> after credential recovery and <InlineCode>action_request.completed</InlineCode> after an approval or structured response.</p>
          <DocsCodeBlock code={receiverCode} language="typescript" label="revive-receiver.ts" />
          <div className="docs-warning"><strong>Raw body required</strong><p>Do not put <InlineCode>express.json()</InlineCode> in front of this route. Revive signs the exact bytes. Use a database-backed receipt store; the in-memory implementation is for tests only.</p></div>
        </Section>

        <Section id="endpoint" eyebrow="06 — Verification" title="Register, then verify the endpoint">
          <p>Saving a callback URL does not enable continuation. Revive activates it only after a signed <InlineCode>recovery.resume_test</InlineCode> receives the exact expected acknowledgement.</p>
          <DocsCodeBlock code={endpointCode} language="bash" label="Terminal" />
          <p>A successful response is <InlineCode>{`{ "ok": true, "verified": true }`}</InlineCode>. Revive then queues eligible continuations that were safely parked before verification.</p>
        </Section>

        <Section id="protect" eyebrow="07 — Side effects" title="Protect every external write">
          <p>Resuming a checkpoint does not make a third-party mutation exactly-once. Wrap non-idempotent writes and reconcile any result that may have committed before its response was lost.</p>
          <DocsCodeBlock code={protectCode} language="typescript" label="protected-refund.ts" />
        </Section>

        <Section id="acceptance" eyebrow="08 — Release gate" title="Prove the integration before traffic">
          <p>Quickstart verifies the control-plane wiring. Before customer traffic, run the kill/restart test against the runtime and checkpoint store you will actually operate.</p>
          <ol className="docs-checklist">
            {["A clean project imports revive-sdk from npm.", "A real failure appears with the expected execution coordinates.", "The callback is Verified, not merely Registered.", "A duplicate signed event enters the runtime once.", "A bad signature and stale timestamp return HTTP 401.", "A replacement worker resumes after the original process is killed.", "A lost provider response reconciles without a duplicate write."].map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}
          </ol>
          <DocsCodeBlock code={`npm run test:sdk-package\nnpm run test:golden`} language="bash" label="Repository acceptance tests" />
        </Section>

        <Section id="limits" eyebrow="09 — Support boundary" title="What is supported today">
          <p>The mechanically tested alpha path is Node.js 20+, <InlineCode>revive-sdk</InlineCode> 0.2.x, the hosted control plane, an existing durable checkpointer, an HTTPS SDK receiver, and a database-backed receipt store.</p>
          <div className="docs-support-grid"><div><span>Certified hosted recovery</span><strong>Microsoft</strong></div><div><span>Provisional connectors</span><strong>Google, GitHub, Slack + catalog</strong></div></div>
          <ul className="docs-limit-list"><li>Revive cannot reconstruct state your runtime never persisted.</li><li>An arbitrary provider write still needs provider idempotency or a reliable reconciliation read.</li><li>A signed probe proves callback reachability and protocol correctness—not every application-specific resume handler.</li><li>This is a design-partner alpha, not a general-availability guarantee for every runtime and provider.</li></ul>
          <p>For the complete repository-level contract, read the <a href="https://github.com/FlyingPotato437/revive/blob/main/docs/supported-integration.md">supported integration guide</a>.</p>
        </Section>
      </article>

      <aside className="docs-context">
        <div><p>On this page</p>{groups.flatMap((group) => group.links).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</div>
        <div className="docs-context-status"><span>Support status</span><strong><i /> Alpha path operational</strong><p>SDK 0.2.0<br />Node 20+<br />Microsoft certified</p></div>
      </aside>
    </div>
  </div>;
}
