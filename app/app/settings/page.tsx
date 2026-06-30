import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export default async function WorkspacePage() {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  const email = session?.email ?? "you@company.com";
  return (
    <div className="mx-auto max-w-[1040px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cobalt">Configuration</div><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-ink">Workspace</h1><p className="mt-2 max-w-[650px] text-[13px] leading-5 text-ink-muted">The console defaults to local mode. Entra, Postgres, signed webhook, Nango, Auth0 and Temporal paths activate through server-side environment configuration.</p></div>

      <section className="mt-6 rounded-card border border-hairline bg-white shadow-seat">
        <SectionHeader title="Workspace details" description="Identity and environment for this console." />
        <Row label="Signed-in account" value={email} />
        <Row label="Environment" value="revive-local" badge="sandbox" />
        <Row label="State backend" value=".revive/console-state.json" badge="durable local" />
      </section>

      <section className="mt-4 rounded-card border border-hairline bg-white shadow-seat">
        <SectionHeader title="Recovery policy" description="Safety defaults applied to newly opened recovery cases." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Reauthorization link lifetime" value="15 minutes" help="Expired links cannot resume a run." />
          <Field label="Unknown provider errors" value="Escalate for review" help="Never silently refresh an unrecognized failure." />
          <Field label="Credential delivery" value="Opaque lease handles" help="Workers do not receive stored refresh tokens." />
          <Field label="Side-effect replay" value="Idempotency required" help="Mutating steps receive a stable action key." />
        </div>
      </section>

      <section className="mt-4 rounded-card border border-hairline bg-white shadow-seat">
        <SectionHeader title="Sidecar quickstart" description="The API currently implemented in the Python package." />
        <div className="p-5"><pre className="overflow-x-auto rounded-[10px] border border-[#252b38] bg-[#141821] p-4 font-mono text-[11px] leading-6 text-white/75"><code>{`from revive import CheckpointStore, Engine, Provider

store = CheckpointStore("revive.db")
provider = Provider("microsoft", token_url=TOKEN_URL, scopes=SCOPES)
engine = Engine(provider, store, base_url=RECOVERY_URL)

result = engine.run(run_id, steps, credential_lease, SCOPES)`}</code></pre><p className="mt-3 text-[10.5px] leading-5 text-ink-faint">This replaces the previous fictional <span className="font-mono">wrap()</span> example. Package publishing and a hosted project key remain release work.</p></div>
      </section>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div className="border-b border-hairline px-5 py-4"><h2 className="text-[13px] font-semibold text-ink">{title}</h2><p className="mt-1 text-[10.5px] text-ink-muted">{description}</p></div>;
}
function Row({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 text-[11.5px] last:border-0"><span className="text-ink-muted">{label}</span><span className="flex items-center gap-2 font-mono text-[10.5px] text-ink">{value}{badge && <span className="rounded-[5px] bg-ok-soft px-2 py-1 font-sans text-[8.5px] font-semibold uppercase tracking-[0.07em] text-ok">{badge}</span>}</span></div>;
}
function Field({ label, value, help }: { label: string; value: string; help: string }) {
  return <div className="rounded-[9px] border border-hairline bg-paper-baseline p-4"><div className="text-[10px] font-medium text-ink-muted">{label}</div><div className="mt-1.5 text-[12px] font-semibold text-ink">{value}</div><p className="mt-1 text-[10px] leading-4 text-ink-faint">{help}</p></div>;
}
