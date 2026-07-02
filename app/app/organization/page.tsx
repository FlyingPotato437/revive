import { cookies } from "next/headers";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { WorkspaceCreator } from "@/components/app/AccountControls";
import { MemberManager } from "@/components/app/MemberManager";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { listWorkspaceMembers, workspaceRole } from "@/lib/rbac";
import { listWorkspaces, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspaces = await listWorkspaces(auth.email);
  const current = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const role = await workspaceRole(auth.email, current);
  const members = await listWorkspaceMembers(current);
  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Account" title="Organization and workspaces" description="Manage workspace boundaries, operator access, and the active console context." actions={<StatusBadge tone="cobalt">{role || "no access"}</StatusBadge>} />
      <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Current workspace" /><div className="grid gap-4 p-5 sm:grid-cols-3"><Fact label="Name" value={current.name} /><Fact label="Organization" value={current.organization} /><Fact label="Workspace ID" value={current.id} mono /></div></section>
      <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Members" meta={`${members.length} total`} /><MemberManager members={members} canManage={role === "owner" || role === "admin"} /></section>
      <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Create workspace" meta="owner only" /><div className="p-5"><WorkspaceCreator /></div></section>
      <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Available workspaces" />{workspaces.map((workspace) => <div key={workspace.id} className="grid gap-2 border-b border-[#e1e5ea] px-5 py-4 last:border-0 sm:grid-cols-[1fr_1fr_auto]"><span className="text-[10.5px] font-semibold">{workspace.name}</span><span className="text-[10px] text-[#687180]">{workspace.organization}</span><StatusBadge tone={workspace.id === current.id ? "ok" : "neutral"}>{workspace.id === current.id ? "active" : "available"}</StatusBadge></div>)}</section>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="font-mono text-[8px] tracking-[.1em] text-[#8a929d]">{label.toUpperCase()}</div><div className={`mt-2 text-[11px] font-semibold ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}
