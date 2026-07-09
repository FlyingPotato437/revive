// Weekly protection summary: "1,204 actions protected · 3 duplicates blocked ·
// 2 approvals · 1 recovery". Sends to Slack + REVIVE_NOTIFY_EMAIL when those
// channels are configured; always prints to stdout so it can run under cron.
//
//   npx tsx scripts/weekly-summary.mts <workspaceId>
//
// Reads .env.local via @next/env like the other scripts.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error("usage: npx tsx scripts/weekly-summary.mts <workspaceId>");
  process.exit(1);
}

const { getProtectionStats, formatProtectionSummary } = await import("../lib/protection-stats");
const { postSlack, sendEmail, notificationChannels } = await import("../lib/notify");

const stats = await getProtectionStats(workspaceId);
const summary = formatProtectionSummary(stats);
const headline = `Revive weekly summary (${stats.month}) — ${summary}`;
console.log(headline);

const channels = notificationChannels();
if (channels.slack) {
  const ok = await postSlack(`:shield: *Revive weekly summary* (${stats.month})\n${summary}`);
  console.log(`slack: ${ok ? "sent" : "failed"}`);
}
if (channels.email && process.env.REVIVE_NOTIFY_EMAIL) {
  const ok = await sendEmail({
    to: process.env.REVIVE_NOTIFY_EMAIL,
    subject: headline,
    text: [
      `Your agents this month:`,
      ``,
      `  Actions protected:   ${stats.actionsProtected}`,
      `  Duplicates blocked:  ${stats.duplicatesBlocked}`,
      `  Approvals pending:   ${stats.approvalsPending}`,
      `  Approvals decided:   ${stats.approvalsDecided}`,
      `  Recoveries:          ${stats.recoveries}`,
      ``,
      `Every number is derived from your recorded action and case ledgers.`,
    ].join("\n"),
  });
  console.log(`email: ${ok ? "sent" : "failed"}`);
}
if (!channels.slack && !channels.email) {
  console.log("no notification channels configured (SLACK_WEBHOOK_URL / RESEND_API_KEY+REVIVE_NOTIFY_FROM)");
}
