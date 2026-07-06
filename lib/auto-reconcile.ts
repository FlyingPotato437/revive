// Auto-reconciliation in the recovery loop: before a recovered run resumes,
// answer "did the interrupted side effect already happen?" for every action
// whose outcome is unknown, using the reconcile hints attached at
// registration. Committed → ledger marked reconciled (replay returns the
// stored outcome). Provably absent → reset to prepared (safe to execute
// exactly once on resume). Unknown → left uncertain, so the replay verdict
// still demands reconciliation instead of permitting a blind retry.

import { listActionsForRun, reconcileAction, resetActionSafe, type ControlAction } from "./control-plane";
import { reconcileGraphSentMail } from "./reconcile/graph";
import { reconcileGmailSentMail } from "./reconcile/gmail";
import { audit } from "./audit";

export interface ReconcileHints {
  provider?: string; // "microsoft" (default) | "google"
  subject?: string;
  internetMessageId?: string;
  messageId?: string;
  rfc822MessageId?: string;
  windowMinutes?: number;
}

export interface AutoReconcileSummary {
  checked: number;
  committed: number;
  safeToExecute: number;
  unknown: number;
  skippedNoHints: number;
  results: Array<{ actionId: string; actionKey: string; outcome: string; remoteId?: string }>;
}

function hintsOf(action: ControlAction): ReconcileHints | null {
  const meta = action.metadata as { reconcileHints?: ReconcileHints } | undefined;
  const hints = meta?.reconcileHints;
  if (!hints) return null;
  if (!hints.subject && !hints.internetMessageId && !hints.messageId && !hints.rfc822MessageId) return null;
  return hints;
}

/** Run auto-reconciliation for every unknown-outcome action of a run.
 *  Never throws — a provider error leaves the action uncertain (safe default). */
export async function autoReconcileRun(input: {
  workspaceId: string;
  runId: string;
  connectionId: string;
  integrationId: string;
  actor: string;
}): Promise<AutoReconcileSummary> {
  const summary: AutoReconcileSummary = { checked: 0, committed: 0, safeToExecute: 0, unknown: 0, skippedNoHints: 0, results: [] };
  let actions: ControlAction[] = [];
  try {
    actions = await listActionsForRun(input.workspaceId, input.runId);
  } catch {
    return summary;
  }
  const unknownOutcome = actions.filter((a) => a.state === "started" || a.state === "uncertain");

  for (const action of unknownOutcome) {
    const hints = hintsOf(action);
    if (!hints) {
      summary.skippedNoHints += 1;
      continue;
    }
    summary.checked += 1;
    try {
      const probe = {
        integrationId: input.integrationId,
        connectionId: action.connectionId || input.connectionId,
        subject: hints.subject,
        windowMinutes: hints.windowMinutes,
      };
      const result = hints.provider === "google"
        ? await reconcileGmailSentMail({ ...probe, messageId: hints.messageId, rfc822MessageId: hints.rfc822MessageId })
        : await reconcileGraphSentMail({ ...probe, messageId: hints.messageId, internetMessageId: hints.internetMessageId });

      if (result.outcome === "committed") {
        await reconcileAction(input.workspaceId, action.id, {
          remoteId: result.remoteId,
          note: `auto-reconcile:${result.strategy}: ${result.detail}`.slice(0, 300),
        });
        summary.committed += 1;
      } else if (result.outcome === "not_found") {
        await resetActionSafe(input.workspaceId, action.id, `auto-reconcile:${result.strategy}: provider confirmed not committed`);
        summary.safeToExecute += 1;
      } else {
        summary.unknown += 1;
      }
      summary.results.push({ actionId: action.id, actionKey: action.actionKey, outcome: result.outcome, remoteId: result.remoteId });
    } catch {
      summary.unknown += 1;
      summary.results.push({ actionId: action.id, actionKey: action.actionKey, outcome: "unknown" });
    }
  }

  if (summary.checked > 0) {
    await audit({
      workspaceId: input.workspaceId, actor: input.actor, subjectKind: "action", subjectId: input.runId,
      event: "auto_reconciled",
      detail: { runId: input.runId, checked: summary.checked, committed: summary.committed, safeToExecute: summary.safeToExecute, unknown: summary.unknown },
    }).catch(() => undefined);
  }
  return summary;
}
