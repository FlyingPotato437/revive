// Outbound notifications (email via Resend, Slack via incoming webhook).
// Env-gated and fire-and-forget: a missing key just disables that channel,
// and a delivery failure is logged, never thrown, so it can't break a request.
//   RESEND_API_KEY      Resend API key (email)
//   REVIVE_NOTIFY_FROM  verified sender, e.g. "Revive <recovery@revivelabs.app>"
//   REVIVE_NOTIFY_EMAIL fallback recipient when a connection has no account email
//   SLACK_WEBHOOK_URL   incoming-webhook URL for the ops channel
//   REVIVE_PUBLIC_URL   origin used to absolutize recovery/app links

import type { ControlCase } from "@/lib/control-plane";
import { loadConnectionBinding } from "@/lib/hosted";
import { audit } from "@/lib/audit";
import { markUserActionDelivery, type UserActionRequest } from "@/lib/action-requests";

export function notificationChannels(): { email: boolean; slack: boolean } {
  return {
    email: Boolean(process.env.RESEND_API_KEY && process.env.REVIVE_NOTIFY_FROM),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
  };
}

function publicUrl(pathname?: string): string | null {
  const origin = process.env.REVIVE_PUBLIC_URL?.replace(/\/$/, "");
  if (!origin || !pathname) return null;
  return `${origin}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

/** Send one email through Resend. Returns false (no throw) when unconfigured. */
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REVIVE_NOTIFY_FROM;
  if (!apiKey || !from || !input.to) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Post a message to the configured Slack channel. Returns false when unconfigured. */
export async function postSlack(text: string): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget: called after a case parks. Never throws. */
export async function notifyCaseOpened(record: ControlCase): Promise<void> {
  const recoveryUrl = publicUrl(record.url);
  const slackText = [
    `:rotating_light: *Agent run parked* — recovery case \`${record.id}\``,
    `run \`${record.runId}\`${record.checkpointId ? ` · checkpoint \`${record.checkpointId}\`` : ""} · action \`${record.actionKey}\``,
    `reason: ${record.reason.slice(0, 160)}`,
    recoveryUrl ? `<${recoveryUrl}|Reconnect the account and resume>` : "recovery link available in the console",
  ].join("\n");

  const binding = await loadConnectionBinding(record.connectionId, record.workspaceId).catch(() => null);
  const to = binding?.accountId?.includes("@") ? binding.accountId : process.env.REVIVE_NOTIFY_EMAIL;
  const emailText = [
    `A workflow that acts as your account was paused because its access expired or was revoked.`,
    ``,
    `Run: ${record.runId}`,
    `Stopped at: ${record.actionKey}`,
    ``,
    recoveryUrl ? `Reconnect (single-use link, expires in 15 minutes):\n${recoveryUrl}` : `Open the Revive console to reconnect.`,
    ``,
    `Nothing already completed will be repeated after you reconnect.`,
  ].join("\n");

  const [slack, email] = await Promise.all([
    postSlack(slackText),
    recoveryUrl && to ? sendEmail({ to, subject: "Action needed: reconnect your account to resume a paused workflow", text: emailText }) : Promise.resolve(false),
  ]);
  if (slack || email) {
    await audit({
      workspaceId: record.workspaceId, actor: "notifier", subjectKind: "case", subjectId: record.id,
      event: "notified", detail: { slack, email },
    }).catch(() => undefined);
  }
}

/** Approval card: a high-risk agent action is paused on a human decision.
 *  Slack + fallback email with a link to the approvals inbox. Fire-and-forget
 *  like every other notifier here. */
export async function notifyApprovalRequested(input: {
  workspaceId: string;
  actionId: string;
  actionKey: string;
  runId: string;
  summary?: string;
}): Promise<void> {
  const inboxUrl = publicUrl("/app/approvals");
  const slackText = [
    `:raised_hand: *Approval needed* — agent action \`${input.actionKey}\``,
    `run \`${input.runId}\` · action \`${input.actionId}\``,
    input.summary ? `summary: ${input.summary.slice(0, 200)}` : "",
    inboxUrl ? `<${inboxUrl}|Review and approve in the console>` : "review in the Revive console → Approvals",
  ].filter(Boolean).join("\n");
  const to = process.env.REVIVE_NOTIFY_EMAIL;
  const emailText = [
    `An agent asked to run a high-risk action and is paused until someone approves it.`,
    ``,
    `Action: ${input.actionKey}`,
    `Run: ${input.runId}`,
    input.summary ? `Summary: ${input.summary.slice(0, 300)}` : ``,
    ``,
    inboxUrl ? `Approve or deny: ${inboxUrl}` : `Open the Revive console → Approvals.`,
    ``,
    `Approved actions run exactly once. Nothing runs until a decision is made.`,
  ].filter(Boolean).join("\n");
  const [slack, email] = await Promise.all([
    postSlack(slackText),
    to ? sendEmail({ to, subject: `Approval needed: ${input.actionKey}`, text: emailText }) : Promise.resolve(false),
  ]);
  if (slack || email) {
    await audit({
      workspaceId: input.workspaceId, actor: "notifier", subjectKind: "action", subjectId: input.actionId,
      event: "approval_notified", detail: { slack, email },
    }).catch(() => undefined);
  }
}

/** Deliver a customer-facing action link to the selected recipient. The link
 * is a one-use capability; messages intentionally omit raw context fields. */
export async function notifyUserActionRequest(record: UserActionRequest): Promise<void> {
  const actionUrl = record.url?.startsWith("http") ? record.url : publicUrl(record.url);
  const emailText = [
    `An AI workflow needs one action from you before it can continue.`,
    ``,
    record.title,
    record.description,
    ``,
    `Run: ${record.runId}`,
    record.checkpointId ? `Paused at: ${record.checkpointId}` : ``,
    ``,
    actionUrl ? `Complete the action: ${actionUrl}` : `Ask the workflow owner for a new secure action link.`,
    ``,
    `This link is single-use and expires ${new Date(record.expiresAt).toISOString()}.`,
  ].filter(Boolean).join("\n");
  const consoleUrl = publicUrl(`/app/requests/${record.id}`);
  const slackText = [
    `:hand: *User action needed* — ${record.title}`,
    `run \`${record.runId}\`${record.checkpointId ? ` · checkpoint \`${record.checkpointId}\`` : ""}`,
    consoleUrl ? `<${consoleUrl}|View delivery status in Revive>` : "view delivery status in the Revive console",
  ].join("\n");
  const [email, slack] = await Promise.all([
    actionUrl ? sendEmail({ to: record.recipient.email, subject: `Action needed: ${record.title}`, text: emailText }) : Promise.resolve(false),
    postSlack(slackText),
  ]);
  await markUserActionDelivery(record.workspaceId, record.id, { email, slack }).catch(() => undefined);
  await audit({
    workspaceId: record.workspaceId, actor: "notifier", subjectKind: "action_request", subjectId: record.id,
    event: "delivery_attempted", detail: { email, slack, recipientSubject: record.recipient.subjectId },
  }).catch(() => undefined);
}

/** Invite email + Slack ping when a teammate is added to a workspace. */
export async function sendWorkspaceInvite(input: {
  email: string;
  role: string;
  workspaceName: string;
  inviterEmail: string;
}): Promise<{ email: boolean; slack: boolean }> {
  const signInUrl = publicUrl("/login") || "https://revivelabs.app/login";
  const emailText = [
    `${input.inviterEmail} added you to the "${input.workspaceName}" workspace on Revive as ${input.role}.`,
    ``,
    `Revive is the secure user-action layer for AI agents — it gets the human action a blocked run needs and resumes the same workflow.`,
    ``,
    `Sign in to accept:`,
    signInUrl,
  ].join("\n");
  const [email, slack] = await Promise.all([
    sendEmail({ to: input.email, subject: `You've been added to ${input.workspaceName} on Revive`, text: emailText }),
    postSlack(`:wave: ${input.inviterEmail} invited *${input.email}* to *${input.workspaceName}* as ${input.role}.`),
  ]);
  return { email, slack };
}
