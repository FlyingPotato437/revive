import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { PageHeader, StatusBadge } from "@/components/app/ConsolePrimitives";
export default async function WorkspacePage() {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  const email = session?.email ?? "you@company.com";
  const hosted = Boolean(process.env.DATABASE_URL);
  const entra = Boolean(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_REDIRECT_URI);
  const delivery = Boolean(process.env.REVIVE_WEBHOOK_URL && process.env.REVIVE_WEBHOOK_SECRET);
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Configuration" title="Workspace" description="Environment, recovery defaults and production readiness. Secrets remain server-side and are never rendered here." actions={<StatusBadge tone={hosted ? "ok" : "neutral"}>{hosted ? "hosted" : "local mode"}</StatusBadge>} />
    <div className="mt-5 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <div className="space-y-5">
        <SettingsSection title="Workspace identity" code="ENV/01"><Setting label="Signed-in account" value={email} mono /><Setting label="Environment" value={hosted ? "hosted" : "revive-local"} /><Setting label="State backend" value={hosted ? "Postgres" : ".revive/console-state.json"} mono /></SettingsSection>
        <SettingsSection title="Integration readiness" code="SYS/02"><Readiness label="Microsoft Entra PKCE" ready={entra} /><Readiness label="Postgres job queue" ready={hosted} /><Readiness label="Signed delivery webhook" ready={delivery} /><Readiness label="Nango credential vault" ready={Boolean(process.env.NANGO_SECRET_KEY)} /><Readiness label="Auth0 Token Vault" ready={Boolean(process.env.AUTH0_DOMAIN)} /></SettingsSection>
      </div>
      <div className="space-y-5">
        <SettingsSection title="Recovery policy" code="POL/03"><Policy label="Recovery link lifetime" value="15 minutes" detail="Expired capabilities cannot resume a run." /><Policy label="Unknown provider errors" value="Escalate" detail="Never silently retry an unrecognized credential failure." /><Policy label="Credential delivery" value="Opaque lease" detail="Workers receive a connection reference and fencing generation." /><Policy label="Side-effect replay" value="Reconcile first" detail="Mutating actions reuse a stable idempotency key." /></SettingsSection>
        <section className="recorder-panel overflow-hidden rounded-[8px] border border-[#292d36] text-white"><div className="border-b border-white/10 px-5 py-4"><div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[.14em] text-[#8798ff]"><span className="font-mono text-white/25">SDK/04</span>Sidecar quickstart</div><h2 className="mt-2 text-[13px] font-semibold">Process-independent recovery</h2></div><pre className="overflow-x-auto p-5 font-mono text-[9.5px] leading-5 text-white/58"><code>{`from revive import Engine, Provider, PostgresCheckpointStore\n\nstore = PostgresCheckpointStore(DATABASE_URL)\nprovider = Provider("microsoft", TOKEN_URL, scopes=SCOPES)\nengine = Engine(provider, store, base_url=RECOVERY_URL)\n\nresult = engine.run(run_id, steps, credential_lease, SCOPES)`}</code></pre></section>
      </div>
    </div>
  </div>;
}
function SettingsSection({ title, code, children }: { title: string; code: string; children: React.ReactNode }) { return <section className="instrument-panel overflow-hidden rounded-[8px]"><div className="flex h-11 items-center justify-between border-b border-[#e2e3df] px-4"><h2 className="text-[10.5px] font-semibold text-[#303339]">{title}</h2><span className="font-mono text-[7.5px] text-[#b0b2ae]">{code}</span></div>{children}</section>; }
function Setting({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="flex items-center justify-between gap-4 border-b border-[#e9eae5] px-4 py-3 last:border-0"><span className="text-[9.5px] text-[#777b81]">{label}</span><span className={`truncate text-right text-[9.5px] text-[#34383e] ${mono ? "font-mono" : "font-medium"}`}>{value}</span></div>; }
function Readiness({ label, ready }: { label: string; ready: boolean }) { return <div className="flex items-center justify-between border-b border-[#e9eae5] px-4 py-3 last:border-0"><span className="text-[9.5px] text-[#555a61]">{label}</span><StatusBadge tone={ready ? "ok" : "neutral"}>{ready ? "configured" : "not configured"}</StatusBadge></div>; }
function Policy({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="grid gap-2 border-b border-[#e9eae5] px-4 py-3.5 last:border-0 sm:grid-cols-[1fr_auto] sm:items-start"><div><div className="text-[9.5px] font-medium text-[#3b3f45]">{label}</div><p className="mt-1 text-[8.5px] leading-4 text-[#92959a]">{detail}</p></div><span className="font-mono text-[8.5px] text-[#5065e8]">{value}</span></div>; }
