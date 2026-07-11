import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { notFound } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { getUserActionRequest } from "@/lib/action-requests";
import { ActionRequestControls } from "@/components/app/ActionRequestControls";
import { ActionRequestStateBadge, PageHeader, StatusBadge } from "@/components/app/ConsolePrimitives";
import { workspaceRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const role = await workspaceRole(auth.email, workspace); const canOperate = role === "operator" || role === "admin" || role === "owner";
  const { id } = await params; const request = await getUserActionRequest(workspace.id, id, canOperate);
  if (!request) notFound();
  return <div className="mx-auto max-w-[1040px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <Link href="/app/requests" className="mb-5 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#596273] hover:text-[#151922]"><ArrowLeft size={11} />All requests</Link>
    <PageHeader eyebrow={request.actionType.replaceAll("_", " ")} title={request.title} description={request.description} actions={canOperate ? <ActionRequestControls id={request.id} url={request.url} pending={request.status === "pending"} /> : undefined} />
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <section className="instrument-panel overflow-hidden"><div className="flex items-center justify-between border-b border-[#151922] px-5 py-4"><h2 className="text-[12px] font-semibold">Request state</h2><ActionRequestStateBadge state={request.status} /></div><dl className="divide-y divide-[#e1e4de]">{[
        ["Recipient", `${request.recipient.email} · ${request.recipient.subjectId}`], ["Run", request.runId], ["Checkpoint", request.checkpointId || "runtime-owned"], ["Generation", String(request.generation)], ["Expires", new Date(request.expiresAt).toLocaleString()], ["Identity", request.identityMode.replaceAll("_", " ")],
      ].map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-3 px-5 py-3"><dt className="font-mono text-[8.5px] text-[#7b8491]">{label.toUpperCase()}</dt><dd className="break-all text-[10.5px] text-[#333943]">{value}</dd></div>)}</dl></section>
      <section className="instrument-panel overflow-hidden"><div className="flex items-center justify-between border-b border-[#151922] px-5 py-4"><h2 className="text-[12px] font-semibold">Continuation</h2><StatusBadge tone={request.resumeStatus === "acknowledged" ? "ok" : request.resumeStatus === "queued" ? "cobalt" : request.resumeStatus === "held_for_review" ? "warn" : "neutral"}>{request.resumeStatus.replaceAll("_", " ")}</StatusBadge></div><div className="p-5"><p className="text-[11px] leading-5 text-[#687180]">Completion returns a signed event containing this run, checkpoint, generation, verified actor context and structured response. A stale worker cannot consume it as a newer run.</p>{request.validationResult && <div className="mt-4 border-l-[3px] border-[#4967f2] bg-[#edf0ff] px-3 py-2 text-[10px] leading-5 text-[#3f4f91]">Response validation: {request.validationResult.feedback}</div>}{request.resumeAssessment && <div className="mt-3 border-l-[3px] border-[#9a5c15] bg-[#fff7e8] px-3 py-2 text-[10px] leading-5 text-[#74501f]">Resume decision: {request.resumeAssessment.decision} — {request.resumeAssessment.reason}</div>}{request.completedBy && <div className="mt-3 border-l-[3px] border-[#18724e] bg-[#edf8f2] px-3 py-2 text-[10px] leading-5 text-[#345b4b]">Completed by {request.completedBy.email} via {request.completedBy.verification.replaceAll("_", " ")}.</div>}</div></section>
    </div>
    <section className="instrument-panel mt-5 overflow-hidden"><div className="border-b border-[#151922] px-5 py-4"><h2 className="text-[12px] font-semibold">Structured response</h2><p className="mt-1 text-[9.5px] text-[#687180]">Only declared fields are accepted.</p></div>{request.response ? <dl className="divide-y divide-[#e1e4de]">{Object.entries(request.response).map(([key, value]) => <div key={key} className="grid grid-cols-[160px_1fr] gap-4 px-5 py-4"><dt className="font-mono text-[8.5px] text-[#7b8491]">{key.toUpperCase()}</dt><dd className="break-words text-[11px] text-[#151922]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl> : <div className="px-5 py-8 text-[11px] text-[#687180]">Waiting for the recipient. The response will appear here without restarting the run.</div>}</section>
  </div>;
}
