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
    `Revive is the agent recovery control plane — it keeps automated workflows recoverable when their credentials fail.`,
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
