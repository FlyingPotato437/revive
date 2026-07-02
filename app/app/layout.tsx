import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { AppChrome } from "@/components/app/AppChrome";
import { listWorkspaces, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

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

  return <AppChrome
    email={session.email}
    workspaces={workspaces.map(({ id, name, organization }) => ({ id, name, organization }))}
    currentWorkspace={{ id: currentWorkspace.id, name: currentWorkspace.name, organization: currentWorkspace.organization }}
  >{children}</AppChrome>;
}
