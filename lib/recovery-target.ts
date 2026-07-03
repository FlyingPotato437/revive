import { getCase, TERMINAL_STATES, type ControlCase } from "./control-plane";
import { hydrateSessionForTicket } from "./store";
import { verifyRecoveryAccessToken, type RecoveryAccessClaims } from "./recovery-access";
import type { ReconsentTicket, SessionState } from "./types";

export type RecoveryTarget =
  | { kind: "sandbox"; session: SessionState; ticket: ReconsentTicket; consumed: boolean }
  | { kind: "control"; record: ControlCase; claims: RecoveryAccessClaims };

export async function resolveRecoveryTarget(token: string): Promise<RecoveryTarget | null> {
  // Hydrate the sandbox session from durable storage first: on serverless the
  // ticket may have been created on a different instance than this one.
  const sandbox = await hydrateSessionForTicket(token);
  const sandboxTicket = sandbox?.revive.ticket;
  if (sandbox && sandboxTicket?.id === token) {
    // Return the target even once the one-time ticket has been used, so the
    // page can show "already recovered" instead of a scary "expired". Only a
    // still-open, unexpired ticket is consumable.
    const consumed = sandboxTicket.status !== "open" || sandboxTicket.expiresAt <= Date.now();
    return { kind: "sandbox", session: sandbox, ticket: sandboxTicket, consumed };
  }

  const claims = verifyRecoveryAccessToken(token);
  if (!claims) return null;
  const record = await getCase(claims.workspaceId, claims.caseId);
  if (!record || TERMINAL_STATES.has(record.state)) return null;
  return { kind: "control", record, claims };
}
