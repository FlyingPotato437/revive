import { cookies } from "next/headers";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ApiKeyManager } from "@/components/app/AccountControls";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";
export default async function ApiKeysPage() { const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!; const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value); const keys = workspace.apiKeys.map(({ hash: _hash, ...key }) => key); return <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8"><PageHeader eyebrow="Account" title="API keys" description="Project-scoped credentials for lifecycle ingest and the control plane. Secret material is displayed once and stored only as a hash." actions={<StatusBadge tone="neutral">least privilege</StatusBadge>} /><section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Project keys" meta={workspace.name} /><div className="p-5"><ApiKeyManager keys={keys} projects={workspace.projects} /></div></section><section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Use a key" meta="POST /api/ingest" /><div className="p-5"><p className="text-[10.5px] leading-5 text-[#687180]">Every key is bound to one project and one role. Viewer keys can read that project, operator keys can ingest lifecycle events and mutate its control-plane records, and admin keys can also manage workspace runtime configuration.</p><pre className="mt-3 overflow-x-auto border border-[#e2e3df] bg-[#fbfcf8] p-4 font-mono text-[10px] leading-5 text-[#2a2d32]">{`# Python sidecar
from revive import Engine, Reporter
reporter = Reporter(api_key="rv_live_…", base_url="http://localhost:3000")
engine = Engine(provider, store, reporter=reporter)

# or raw HTTP
curl -X POST http://localhost:3000/api/ingest \\
  -H "Authorization: Bearer rv_live_…" -H "Content-Type: application/json" \\
  -d '{"run_id":"nightly-01","event":"recovered","steps_done":8,"steps_total":8}'`}</pre></div></section><div className="mt-5 border border-[#d2d8ff] bg-[#edf0ff] p-4 text-[10.5px] leading-5 text-[#3f55b5]">Project boundaries are enforced in the action ledger, recovery-case queries, transitions, reconciliation, and lifecycle ingest. Existing keys are migrated to their workspace&rsquo;s default project with the admin role.</div></div>; }
