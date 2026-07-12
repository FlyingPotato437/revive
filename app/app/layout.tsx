import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { AppChrome } from "@/components/app/AppChrome";
import { listWorkspaces, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { actionApproval, listActions } from "@/lib/control-plane";
import { listOutcomeTransactions } from "@/lib/outcome-transactions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const workspaces = await listWorkspaces(session.email);
  const currentWorkspace = await selectedWorkspace(session.email, jar.get(WORKSPACE_COOKIE)?.value);
  const [actions, transactions] = await Promise.all([
    listActions(currentWorkspace.id).catch(() => []),
    listOutcomeTransactions(currentWorkspace.id).catch(() => []),
  ]);
  const pendingApprovals = actions.filter((action) => actionApproval(action)?.status === "pending").length
    + transactions.filter((transaction) => transaction.state === "awaiting_approval").length;

  return <AppChrome
    email={session.email}
    workspaces={workspaces.map(({ id, name, organization }) => ({ id, name, organization }))}
    currentWorkspace={{ id: currentWorkspace.id, name: currentWorkspace.name, organization: currentWorkspace.organization }}
    pendingApprovals={pendingApprovals}
  >{children}</AppChrome>;
}
