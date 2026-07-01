import { cookies } from "next/headers";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ApiKeyManager } from "@/components/app/AccountControls";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";
export default async function ApiKeysPage() { const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!; const workspace = selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value); const keys = workspace.apiKeys.map(({ hash: _hash, ...key }) => key); return <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8"><PageHeader eyebrow="Account" title="API keys" description="Keys authenticate the sidecar reporter against this console. Secret material is displayed once and stored only as a hash." actions={<StatusBadge tone="neutral">workspace scoped</StatusBadge>} /><section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Workspace keys" meta={workspace.name} /><div className="p-5"><ApiKeyManager keys={keys} /></div></section><section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Use a key" meta="POST /api/ingest" /><div className="p-5"><p className="text-[10.5px] leading-5 text-[#687180]">Point the sidecar reporter at this console and recovery cases from your own agents land in this workspace — Overview and Recovery cases update as runs park, reauthorize and recover. Lifecycle metadata only; tokens never leave your process.</p><pre className="mt-3 overflow-x-auto border border-[#e2e3df] bg-[#fbfcf8] p-4 font-mono text-[10px] leading-5 text-[#2a2d32]">{`# Python sidecar
from revive import Engine, Reporter
reporter = Reporter(api_key="rv_live_…", base_url="http://localhost:3000")
engine = Engine(provider, store, reporter=reporter)

# or raw HTTP
curl -X POST http://localhost:3000/api/ingest \\
  -H "Authorization: Bearer rv_live_…" -H "Content-Type: application/json" \\
  -d '{"run_id":"nightly-01","event":"recovered","steps_done":8,"steps_total":8}'`}</pre></div></section><div className="mt-5 border border-[#f0e2c0] bg-[#fdf7e7] p-4 text-[10.5px] leading-5 text-[#7a6224]">Scope note: keys accept recovery lifecycle events only. Full hosted RBAC and per-project scoping remain open work.</div></div>; }
