import fs from "node:fs";
import path from "node:path";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "@/lib/hosted";

export interface IdentityProbeDefinition {
  path: string;
  subjectField: string;
  tenantField: string;
  accountField: string;
}

export interface CustomConnectorDefinition {
  integrationId: string;
  label: string;
  identityProbe: IdentityProbeDefinition;
  provisional: true;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface CustomConnectorInput {
  integrationId: string;
  label: string;
  identityProbe: IdentityProbeDefinition;
}

const INTEGRATION_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DOT_PATH = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const BLOCKED_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const localDirectory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const localFile = path.join(localDirectory, "custom-connectors.json");

function cleanDotPath(value: unknown, name: string): string {
  const field = String(value || "").trim();
  if (!field || field.length > 200 || !DOT_PATH.test(field)) {
    throw new Error(`${name} must be a dot path such as id or org.id`);
  }
  if (field.split(".").some((segment) => BLOCKED_SEGMENTS.has(segment))) {
    throw new Error(`${name} contains a blocked path segment`);
  }
  return field;
}

export function validateCustomConnectorInput(input: CustomConnectorInput): CustomConnectorInput {
  const integrationId = String(input?.integrationId || "").trim();
  const label = String(input?.label || "").trim();
  const probePath = String(input?.identityProbe?.path || "").trim();
  if (!INTEGRATION_ID.test(integrationId)) {
    throw new Error("integrationId must be 1-100 letters, numbers, underscores, or hyphens");
  }
  if (label.length < 2 || label.length > 80) throw new Error("label must be 2-80 characters");
  // Relative here means relative to the provider API base selected by Nango.
  // Protocol-relative paths and absolute URLs must never reach the proxy.
  if (!probePath.startsWith("/") || probePath.startsWith("//") || probePath.includes("://") || probePath.length > 500) {
    throw new Error("identityProbe.path must be a relative provider path beginning with one /");
  }
  return {
    integrationId,
    label,
    identityProbe: {
      path: probePath,
      subjectField: cleanDotPath(input.identityProbe.subjectField, "identityProbe.subjectField"),
      tenantField: cleanDotPath(input.identityProbe.tenantField, "identityProbe.tenantField"),
      accountField: cleanDotPath(input.identityProbe.accountField, "identityProbe.accountField"),
    },
  };
}

/** Read an own-property-only dot path without permitting prototype traversal. */
export function safeDotPathGet(payload: unknown, dotPath: string): unknown {
  const segments = cleanDotPath(dotPath, "identity field").split(".");
  let value: unknown = payload;
  for (const segment of segments) {
    if (BLOCKED_SEGMENTS.has(segment) || value === null || typeof value !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function readLocal(): Record<string, CustomConnectorDefinition[]> {
  try { return JSON.parse(fs.readFileSync(localFile, "utf8")) as Record<string, CustomConnectorDefinition[]>; }
  catch { return {}; }
}

function writeLocal(data: Record<string, CustomConnectorDefinition[]>): void {
  fs.mkdirSync(localDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${localFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, localFile);
}

export async function listCustomConnectors(workspaceId: string): Promise<CustomConnectorDefinition[]> {
  if (!hostedDatabaseEnabled()) return readLocal()[workspaceId] || [];
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<{
      integration_id: string; label: string; probe_path: string; subject_field: string;
      tenant_field: string; account_field: string; provisional: boolean; created_by: string;
      created_at: Date; updated_at: Date;
    }[]>`
      select integration_id, label, probe_path, subject_field, tenant_field, account_field,
        provisional, created_by, created_at, updated_at
      from revive_custom_connectors
      where workspace_id = ${workspaceId}
      order by label, integration_id
    `;
    return rows.map((row) => ({
      integrationId: row.integration_id,
      label: row.label,
      identityProbe: {
        path: row.probe_path,
        subjectField: row.subject_field,
        tenantField: row.tenant_field,
        accountField: row.account_field,
      },
      provisional: true,
      createdBy: row.created_by,
      createdAt: row.created_at.getTime(),
      updatedAt: row.updated_at.getTime(),
    }));
  });
}

export async function getCustomConnector(workspaceId: string, integrationId: string): Promise<CustomConnectorDefinition | null> {
  const connectors = await listCustomConnectors(workspaceId);
  return connectors.find((connector) => connector.integrationId === integrationId) || null;
}

export async function setCustomConnector(
  workspaceId: string,
  actor: string,
  input: CustomConnectorInput,
): Promise<CustomConnectorDefinition> {
  const clean = validateCustomConnectorInput(input);
  const now = Date.now();
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const connectors = data[workspaceId] || [];
    const existing = connectors.find((connector) => connector.integrationId === clean.integrationId);
    const record: CustomConnectorDefinition = {
      ...clean, provisional: true, createdBy: existing?.createdBy || actor,
      createdAt: existing?.createdAt || now, updatedAt: now,
    };
    data[workspaceId] = [...connectors.filter((connector) => connector.integrationId !== clean.integrationId), record]
      .sort((a, b) => a.label.localeCompare(b.label));
    writeLocal(data);
    return record;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`
      insert into revive_custom_connectors
        (workspace_id, integration_id, label, probe_path, subject_field, tenant_field, account_field, provisional, created_by)
      values
        (${workspaceId}, ${clean.integrationId}, ${clean.label}, ${clean.identityProbe.path},
         ${clean.identityProbe.subjectField}, ${clean.identityProbe.tenantField}, ${clean.identityProbe.accountField}, true, ${actor})
      on conflict (workspace_id, integration_id) do update set
        label = excluded.label,
        probe_path = excluded.probe_path,
        subject_field = excluded.subject_field,
        tenant_field = excluded.tenant_field,
        account_field = excluded.account_field,
        provisional = true,
        updated_at = now()
    `;
  });
  return (await getCustomConnector(workspaceId, clean.integrationId))!;
}

export async function deleteCustomConnector(workspaceId: string, integrationId: string): Promise<void> {
  if (!INTEGRATION_ID.test(integrationId)) throw new Error("valid integrationId is required");
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    data[workspaceId] = (data[workspaceId] || []).filter((connector) => connector.integrationId !== integrationId);
    writeLocal(data);
    return;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`delete from revive_custom_connectors where workspace_id = ${workspaceId} and integration_id = ${integrationId}`;
  });
}

