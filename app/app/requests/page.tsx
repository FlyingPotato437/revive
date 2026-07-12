import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, HandPointing } from "@phosphor-icons/react/dist/ssr";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listUserActionRequests } from "@/lib/action-requests";
import { ActionRequestBuilder } from "@/components/app/ActionRequestBuilder";
import { ActionRequestStateBadge, ago, PageHeader, SummaryStrip } from "@/components/app/ConsolePrimitives";
import { workspaceRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const role = await workspaceRole(auth.email, workspace);
  const canOperate = role === "operator" || role === "admin" || role === "owner";
  const requests = await listUserActionRequests(workspace.id).catch(() => []);
  const pending = requests.filter((request) => request.status === "pending").length;
  const completed = requests.filter((request) => request.status === "completed").length;
  const resumed = requests.filter((request) => request.resumeStatus === "acknowledged").length;
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Human action" title="User action requests" description="Ask the right person for one approval, answer, reconnect, verification, permission or browser step—then continue the same run." actions={canOperate && requests.length ? <ActionRequestBuilder /> : undefined} />
    <div className="mt-5"><SummaryStrip items={[{ label: "Waiting on people", value: String(pending), detail: "secure links still open", tone: pending ? "warn" : "ok" }, { label: "Completed", value: String(completed), detail: "structured responses received", tone: completed ? "cobalt" : undefined }, { label: "Runs resumed", value: String(resumed), detail: "runtime acknowledged", tone: resumed ? "ok" : undefined }]} /></div>
    <section className="instrument-panel mt-5 overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_150px_105px_70px] border-b border-[#151922] bg-[#eef0eb] px-5 py-2.5 font-mono text-[8px] tracking-[.08em] text-[#7b8491]"><span>REQUEST</span><span className="hidden sm:block">RECIPIENT</span><span>STATUS</span><span className="text-right">UPDATED</span></div>
      {requests.length ? requests.map((request) => <Link key={request.id} href={`/app/requests/${request.id}`} className="grid grid-cols-[minmax(0,1fr)_105px_70px] items-center gap-3 border-b border-[#e1e4de] px-5 py-4 last:border-b-0 hover:bg-[#f7f8f5] sm:grid-cols-[minmax(0,1fr)_150px_105px_70px]">
        <div className="min-w-0"><div className="truncate text-[11.5px] font-semibold text-[#151922]">{request.title}</div><div className="mt-1 truncate font-mono text-[8.5px] text-[#8a929d]">{request.actionType.replaceAll("_", " ")} · {request.runId}</div></div>
        <span className="hidden truncate text-[10px] text-[#596273] sm:block">{request.recipient.email}</span><ActionRequestStateBadge state={request.status} /><span className="text-right font-mono text-[8.5px] text-[#8a929d]">{ago(request.updatedAt)}</span>
      </Link>) : <div className="flex flex-col items-start px-5 py-12"><HandPointing size={28} className="text-[#4967f2]" /><h2 className="mt-5 text-[17px] font-semibold tracking-[-.03em]">No action requests yet</h2><p className="mt-2 max-w-[500px] text-[11px] leading-5 text-[#687180]">Create one for a real blocker. Revive sends the person a secure link, validates the response, and returns it to the exact paused run.</p>{canOperate && <div className="mt-5"><ActionRequestBuilder /></div>}</div>}
    </section>
    <p className="mt-4 text-[10px] text-[#687180]">Building from an agent runtime? <Link href="/app/quickstart" className="inline-flex items-center gap-1 font-semibold text-[#2e49c8] hover:underline">Use requestAction <ArrowRight size={10} /></Link></p>
  </div>;
}
