import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { notificationChannels, postSlack, sendEmail } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  → which channels are configured (env present).
// POST → actually send a test email (to the caller) + a test Slack message,
//        so an admin can confirm delivery works before relying on it.
export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: notificationChannels() });
}

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    const [email, slack] = await Promise.all([
      sendEmail({
        to: session.email,
        subject: "Revive test notification",
        text: `This is a test email from Revive for the "${workspace.name}" workspace. If you received it, email notifications are working.`,
      }),
      postSlack(`:white_check_mark: Revive test notification for *${workspace.name}* (requested by ${session.email}). Slack notifications are working.`),
    ]);
    return NextResponse.json({
      configured: notificationChannels(),
      delivered: { email, slack },
      note: email || slack ? "Test sent. Check your inbox / Slack channel." : "No channel configured — set RESEND_API_KEY + REVIVE_NOTIFY_FROM and/or SLACK_WEBHOOK_URL.",
    });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "forbidden";
    return NextResponse.json({ error: error instanceof Error ? error.message : "test failed" }, { status: forbidden ? 403 : 400 });
  }
}
