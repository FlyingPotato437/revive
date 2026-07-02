import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { approveReconsent } from "@/lib/engine";
import { loadConnectionIdentity, saveCredentialConnection } from "@/lib/hosted";
import { consumeEntraFlow, ENTRA_FLOW_COOKIE, entraFlowCookieOptions, fetchEntraProfile, redeemEntraCode, verifyEntraIdToken } from "@/lib/oauth/entra";
import { putSession, sessionForTicket } from "@/lib/store";
import { audit } from "@/lib/audit";

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

    // Identity binding: issuer + oid (subject) + tid (tenant) from a FULLY
    // VERIFIED id_token (JWKS signature, exact issuer, audience, expiry, and
    // the nonce bound to this PKCE flow). Email/UPN is display metadata only.
    if (!tokenSet.id_token) throw new Error("Entra did not return an id_token; openid scope is required");
    const identity = await verifyEntraIdToken(tokenSet.id_token, flow.nonce);

    // Binding source of truth, in order:
    //   1. The identity captured when the connection was originally created.
    //   2. The identity bound to this run's credential lease.
    //   3. Sandbox-only fallback: no prior binding exists (local drills), so
    //      this authorization becomes the binding — recorded as unverified.
    const connectionRef = session.revive.recoveryCase?.credentialLeaseId || "";
    const creationBinding = connectionRef ? await loadConnectionIdentity(connectionRef, session.workspaceId) : null;
    const expectedSubject = creationBinding?.subject || session.revive.token.subject;
    const expectedTenant = creationBinding?.tenant || session.revive.token.tenant;
    if (expectedSubject && identity.subject !== expectedSubject) {
      throw new Error("the authorized account is not the identity bound to this connection (subject mismatch)");
    }
    if (expectedTenant && identity.tenant !== expectedTenant) {
      throw new Error("the authorized account belongs to a different tenant than this connection");
    }
    if (creationBinding?.issuer && identity.issuer !== creationBinding.issuer) {
      throw new Error("the authorization issuer does not match the connection binding");
    }
    if (!expectedSubject || !expectedTenant) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("the connection is missing its creation-time identity binding; recovery is blocked");
      }
      console.warn(`recovery ${ticketId}: no prior identity binding existed; binding now (sandbox first-use)`);
      session.revive.token.subject = identity.subject;
      session.revive.token.tenant = identity.tenant;
      putSession(session);
    }

    // Scope check: the replacement grant must cover what the run needs.
    const granted = new Set(tokenSet.scope.toLowerCase().split(/\s+/).filter(Boolean));
    const missing = ticket.scopes.filter((scope) => scope !== "offline_access" && !granted.has(scope.toLowerCase()));
    if (missing.length) throw new Error(`the replacement grant is missing required scopes: ${missing.join(", ")}`);

    const profile = await fetchEntraProfile(tokenSet.access_token);
    const connectionId = `entra_${crypto.createHash("sha256").update(`${identity.tenant}:${identity.subject}`).digest("hex").slice(0, 24)}`;
    await saveCredentialConnection({
      id: connectionId,
      workspaceId: session.workspaceId,
      provider: "microsoft",
      accountId: profile.mail || profile.userPrincipalName || identity.subject,
      scopes: tokenSet.scope.split(/\s+/).filter(Boolean),
      tokenSet: tokenSet as unknown as Record<string, unknown>,
      metadata: {
        runId: ticket.runId, sessionId: ticket.sessionId,
        issuer: identity.issuer, providerSubject: identity.subject, providerTenant: identity.tenant,
        displayName: profile.displayName, source: "entra_authorization_code_pkce",
      },
    });
    await audit({ workspaceId: session.workspaceId || "local", actor: "oauth-callback", subjectKind: "auth", subjectId: ticketId, event: expectedSubject ? "identity_verified" : "identity_bound_first_use", detail: { connectionId, tenant: identity.tenant } });
    const approved = approveReconsent(ticketId, { connectionId });
    if (!approved.ok) throw new Error(approved.reason || "recovery could not be resumed");
    return recoveryRedirect(req, ticketId, "completed");
  } catch (error) {
    console.error("Entra OAuth callback failed", error instanceof Error ? error.message : error);
    return recoveryRedirect(req, ticketId, "error");
  }
}
