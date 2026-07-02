// Append-only audit trail. Local JSONL always; tenant-scoped Postgres when hosted.
import fs from "node:fs";
import path from "node:path";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "./hosted";

export interface AuditEvent {
  workspaceId: string;
  actor: string; // api key prefix, user email, or "system"
  subjectKind: "case" | "action" | "connection" | "key" | "auth";
  subjectId: string;
  event: string;
  detail?: Record<string, unknown>;
}

const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const file = path.join(directory, "audit.jsonl");

export async function audit(entry: AuditEvent): Promise<void> {
  const record = { ...entry, at: new Date().toISOString() };
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.appendFileSync(file, JSON.stringify(record) + "\n", { mode: 0o600 });
  } catch (error) {
    console.error("audit append failed", error);
  }
  if (hostedDatabaseEnabled()) {
    try {
      await withWorkspaceTransaction(entry.workspaceId, async (sql) => {
        const detail = JSON.parse(JSON.stringify(entry.detail || {}));
        await sql`
          insert into revive_audit_events (workspace_id, actor, subject_kind, subject_id, event, detail)
          values (${entry.workspaceId}, ${entry.actor}, ${entry.subjectKind}, ${entry.subjectId}, ${entry.event}, ${sql.json(detail)})
        `;
      });
    } catch (error) {
      // The local append remains the fallback record; surface the hosted failure.
      console.error("audit insert failed", error);
    }
  }
}
