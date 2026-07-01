import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader, SectionHeading, StatusBadge, SummaryStrip } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { listSessions } from "@/lib/store";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const sessions = listSessions().filter((session) => !session.workspaceId || session.workspaceId === workspace.id);
  const recovered = sessions.filter((session) => session.revive.status === "completed").length;
  const actions = sessions.flatMap((session) => session.revive.actions);
  const committed = actions.filter((action) => action.state === "committed" || action.state === "reconciled").length;
  const latest = sessions.slice(0, 4);
  return <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Operations" title="Overview" description={`Observed state for ${workspace.name}. Values below come from the persisted recovery store, not generated sample data.`} actions={<Link href="/app" className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white">Run recovery drill</Link>} />
    <div className="mt-5"><SummaryStrip items={[{ label: "Saved cases", value: String(sessions.length), detail: "persisted in this workspace" }, { label: "Recovered", value: String(recovered), detail: "completed protected runs", tone: "ok" }, { label: "Committed actions", value: String(committed), detail: "recorded in action ledgers", tone: "cobalt" }]} /></div>
    <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Recent recovery cases" meta={`${latest.length} shown`} />{latest.length ? latest.map((session) => <Link key={session.id} href={`/app/runs/${session.id}`} className="grid gap-2 border-b border-[#e1e5ea] px-5 py-4 last:border-0 hover:bg-[#f5f6f2] sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><div className="text-[11px] font-semibold">{session.revive.recoveryCase?.id || session.revive.id}</div><div className="mt-1 font-mono text-[8px] text-[#8a929d]">{session.deathCode || "no provider error"}</div></div><StatusBadge tone={session.revive.status === "completed" ? "ok" : session.revive.status === "dead" ? "fail" : "warn"}>{session.revive.status.replaceAll("_", " ")}</StatusBadge><span className="font-mono text-[8.5px] text-[#8a929d]">{new Date(session.createdAt).toLocaleString()}</span></Link>) : <div className="px-5 py-12"><div className="text-[12px] font-semibold">No persisted recovery cases</div><p className="mt-2 text-[10.5px] text-[#687180]">Run the recovery lab to create the first measured record.</p></div>}</section>
  </div>;
}
