// Case-open notifications: recovery lands where ops lives. Env-gated, never
// blocks the recovery path — failures are logged to audit and swallowed.
//   SLACK_WEBHOOK_URL   incoming-webhook URL for the ops channel
//   RESEND_API_KEY      Resend key for account-owner email
//   REVIVE_NOTIFY_FROM  verified sender, e.g. recovery@revivelabs.app
//   REVIVE_NOTIFY_EMAIL fallback recipient when the connection has no account email
//   REVIVE_PUBLIC_URL   origin used to absolutize recovery links

import type { ControlCase } from "@/lib/control-plane";
import { loadConnectionBinding } from "@/lib/hosted";
import { audit } from "@/lib/audit";

function publicUrl(pathname?: string): string | null {
  const origin = process.env.REVIVE_PUBLIC_URL?.replace(/\/$/, "");
  if (!origin || !pathname) return null;
  return `${origin}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

async function notifySlack(record: ControlCase, recoveryUrl: string | null): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return false;
  const lines = [
    `:rotating_light: *Agent run parked* — recovery case \`${record.id}\``,
    `run \`${record.runId}\`${record.checkpointId ? ` · checkpoint \`${record.checkpointId}\`` : ""} · action \`${record.actionKey}\``,
    `reason: ${record.reason.slice(0, 160)}`,
    recoveryUrl ? `<${recoveryUrl}|Reconnect the account and resume>` : "recovery link available in the console",
  ];
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  return response.ok;
}

async function notifyEmail(record: ControlCase, recoveryUrl: string | null): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REVIVE_NOTIFY_FROM;
  if (!apiKey || !from || !recoveryUrl) return false;
  const binding = await loadConnectionBinding(record.connectionId, record.workspaceId).catch(() => null);
  const to = binding?.accountId?.includes("@") ? binding.accountId : process.env.REVIVE_NOTIFY_EMAIL;
  if (!to) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Action needed: reconnect your account to resume a paused workflow`,
      text: [
        `A workflow that acts as your account was paused because its access expired or was revoked.`,
        ``,
        `Run: ${record.runId}`,
        `Stopped at: ${record.actionKey}`,
        ``,
        `Reconnect (single-use link, expires soon):`,
        recoveryUrl,
        ``,
        `Nothing already completed will be repeated after you reconnect.`,
      ].join("\n"),
    }),
  });
  return response.ok;
}

/** Fire-and-forget: called after a case parks. Never throws. */
export async function notifyCaseOpened(record: ControlCase): Promise<void> {
  const recoveryUrl = publicUrl(record.url);
  const results = await Promise.allSettled([notifySlack(record, recoveryUrl), notifyEmail(record, recoveryUrl)]);
  const delivered = {
    slack: results[0].status === "fulfilled" && results[0].value,
    email: results[1].status === "fulfilled" && results[1].value,
  };
  if (delivered.slack || delivered.email) {
    await audit({
      workspaceId: record.workspaceId, actor: "notifier", subjectKind: "case", subjectId: record.id,
      event: "notified", detail: delivered,
    }).catch(() => undefined);
  }
}
