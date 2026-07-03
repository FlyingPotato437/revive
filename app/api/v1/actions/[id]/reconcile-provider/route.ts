import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authenticateApiKey } from "@/lib/api-auth";
import { getAction, reconcileAction, TransitionError } from "@/lib/control-plane";
import { allowedNangoIntegrations } from "@/lib/integrations/nango";
import {
  reconcileJiraIssue,
  reconcileSalesforceRecord,
  reconcileSlackMessage,
  replayVerdict,
} from "@/lib/reconcile/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const action = await getAction(auth.workspace.id, id);
  if (!action) return NextResponse.json({ error: "unknown action" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const provider = String(body.provider || "");
  const integrationId = String(body.integrationId || "");
  if (!allowedNangoIntegrations().includes(integrationId)) {
    return NextResponse.json({ error: "the Nango integration is not allowlisted" }, { status: 400 });
  }

  const common = { integrationId, connectionId: action.connectionId };
  const result = provider === "slack"
    ? await reconcileSlackMessage({
        ...common,
        channel: String(body.channel || ""),
        timestamp: body.timestamp ? String(body.timestamp) : undefined,
        clientMessageId: body.clientMessageId ? String(body.clientMessageId) : undefined,
        oldest: body.oldest ? String(body.oldest) : undefined,
      })
    : provider === "jira"
      ? await reconcileJiraIssue({
          ...common,
          issueKey: body.issueKey ? String(body.issueKey) : undefined,
          projectKey: body.projectKey ? String(body.projectKey) : undefined,
          summary: body.summary ? String(body.summary) : undefined,
          createdAfter: body.createdAfter ? String(body.createdAfter) : undefined,
        })
      : provider === "salesforce"
        ? await reconcileSalesforceRecord({
            ...common,
            apiVersion: body.apiVersion ? String(body.apiVersion) : undefined,
            object: String(body.object || ""),
            externalIdField: String(body.externalIdField || ""),
            externalIdValue: String(body.externalIdValue || ""),
          })
        : null;
  if (!result) return NextResponse.json({ error: "provider must be slack, jira, or salesforce" }, { status: 400 });

  if (result.outcome === "committed") {
    try {
      await reconcileAction(auth.workspace.id, id, {
        remoteId: result.remoteId,
        note: `${provider}:${result.strategy}: ${result.detail}`.slice(0, 300),
      });
    } catch (error) {
      if (!(error instanceof TransitionError)) throw error;
    }
  }
  await audit({
    workspaceId: auth.workspace.id,
    actor: auth.keyPrefix,
    subjectKind: "action",
    subjectId: id,
    event: "provider_reconciled",
    detail: { provider, outcome: result.outcome, strategy: result.strategy, remoteId: result.remoteId },
  });
  return NextResponse.json({ actionId: id, ...result, replayVerdict: replayVerdict(result.outcome) });
}
