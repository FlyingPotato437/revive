import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ago, CaseStateBadge, PageHeader, SummaryStrip } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listCases } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "rejected", "expired", "escalated", "manual_review"]);

export default async function RecoveryCasesPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const cases = await listCases(workspace.id).catch(() => []);
  const open = cases.filter((item) => !TERMINAL.has(item.state));
  const resolved = cases.length - open.length;

  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Operations" title="Recovery cases" description="Interrupted runs that need identity verification, a resume, or a final review." actions={<Link href="/app" className="inline-flex h-9 items-center gap-2 border border-[#c9cec7] bg-white px-4 text-[10.5px] font-semibold text-[#151922] transition hover:border-[#151922]">Open test lab <ArrowRight size={12} /></Link>} />
    <div className="mt-5"><SummaryStrip items={[
      { label: "Open", value: String(open.length), detail: open.length ? "requires follow-through" : "nothing waiting", tone: open.length ? "warn" : "ok" },
      { label: "Resolved", value: String(resolved), detail: "all time", tone: resolved ? "ok" : undefined },
      { label: "Total", value: String(cases.length), detail: "recorded cases" },
    ]} /></div>
    <section className="instrument-panel mt-5 overflow-hidden"><div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5"><div><h2 className="text-[12px] font-semibold text-[#25282d]">Latest recovery work</h2><p className="mt-0.5 text-[10px] text-[#687180]">Open cases are shown first.</p></div><span className="font-mono text-[8.5px] text-[#7b8491]">{cases.length} records</span></div>{cases.length ? cases.map((recovery) => <Link key={recovery.id} href={`/app/runs/${recovery.id}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[#e8ebe7] px-4 py-3.5 last:border-b-0 hover:bg-[#f7f8f5] sm:px-5"><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#151922]">{recovery.actionKey}</div><p className="mt-1 truncate text-[9.5px] text-[#687180]">{recovery.reason}</p></div><CaseStateBadge state={recovery.state} /><span className="font-mono text-[8.5px] text-[#8a929d]">{ago(recovery.updatedAt)}</span></Link>) : <div className="px-5 py-10 text-[11px] text-[#687180]">No recovery cases yet. Revive will place a case here when an interrupted action needs a safe resume.</div>}</section>
  </div>;
}
