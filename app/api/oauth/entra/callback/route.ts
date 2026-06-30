import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { approveReconsent } from "@/lib/engine";
import { saveCredentialConnection } from "@/lib/hosted";
import { consumeEntraFlow, ENTRA_FLOW_COOKIE, entraFlowCookieOptions, fetchEntraProfile, redeemEntraCode } from "@/lib/oauth/entra";
import { sessionForTicket } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function recoveryRedirect(req: NextRequest, ticketId: string, outcome: "completed" | "error") {
  const url = new URL(`/reauthorize/${encodeURIComponent(ticketId)}`, req.url);
  url.searchParams.set(outcome, "1");
  const response = NextResponse.redirect(url);
  response.cookies.set(ENTRA_FLOW_COOKIE, "", { ...entraFlowCookieOptions, maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(req: NextRequest) {
  let ticketId = "unknown";
  try {
    const state = req.nextUrl.searchParams.get("state") || "";
    const code = req.nextUrl.searchParams.get("code") || "";
    if (req.nextUrl.searchParams.get("error")) throw new Error("authorization was denied by Microsoft Entra");
    if (!state || !code) throw new Error("authorization response is incomplete");
    const flow = consumeEntraFlow(req.cookies.get(ENTRA_FLOW_COOKIE)?.value, state);
    ticketId = flow.ticketId;
    const session = sessionForTicket(ticketId);
    const ticket = session?.revive.ticket;
    if (!session || !ticket || ticket.status !== "open" || ticket.expiresAt <= Date.now()) throw new Error("recovery ticket is inactive");
    const tokenSet = await redeemEntraCode(code, flow.verifier);
    const profile = await fetchEntraProfile(tokenSet.access_token);
    const principal = profile.mail || profile.userPrincipalName || "";
    if (!principal || principal.toLowerCase() !== ticket.account.toLowerCase()) {
      throw new Error("the authorized Microsoft account does not match the recovery ticket");
    }
    const connectionId = `entra_${crypto.createHash("sha256").update(profile.id).digest("hex").slice(0, 24)}`;
    await saveCredentialConnection({
      id: connectionId,
      provider: "microsoft",
      accountId: principal,
      scopes: tokenSet.scope.split(/\s+/).filter(Boolean),
      tokenSet: tokenSet as unknown as Record<string, unknown>,
      metadata: { runId: ticket.runId, sessionId: ticket.sessionId, providerSubject: profile.id, displayName: profile.displayName, source: "entra_authorization_code_pkce" },
    });
    const approved = approveReconsent(ticketId, { connectionId });
    if (!approved.ok) throw new Error(approved.reason || "recovery could not be resumed");
    return recoveryRedirect(req, ticketId, "completed");
  } catch (error) {
    console.error("Entra OAuth callback failed", error instanceof Error ? error.message : error);
    return recoveryRedirect(req, ticketId, "error");
  }
}
