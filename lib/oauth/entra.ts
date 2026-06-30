import crypto from "node:crypto";
import { sealJson, openJson, sha256Base64Url, timingSafeTextEqual } from "../secure-envelope";

export const ENTRA_FLOW_COOKIE = "revive_entra_flow";
const FLOW_TTL_MS = 10 * 60 * 1000;

export interface EntraFlow {
  state: string;
  verifier: string;
  ticketId: string;
  createdAt: number;
}

export interface EntraTokenSet {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
}

export interface EntraProfile {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

export function entraConfigured(): boolean {
  return Boolean(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_REDIRECT_URI);
}

function tenant(): string {
  const value = process.env.ENTRA_TENANT_ID || "organizations";
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) throw new Error("ENTRA_TENANT_ID is invalid");
  return value;
}

export function requestedScopes(): string[] {
  const value = process.env.ENTRA_SCOPES || "offline_access User.Read Mail.ReadWrite Calendars.Read Files.Read.All";
  return [...new Set(value.split(/\s+/).filter(Boolean))];
}

export function createEntraAuthorization(ticketId: string): { url: string; cookie: string } {
  if (!entraConfigured()) throw new Error("Entra OAuth is not configured");
  const verifier = crypto.randomBytes(64).toString("base64url");
  const flow: EntraFlow = {
    state: crypto.randomBytes(32).toString("base64url"),
    verifier,
    ticketId,
    createdAt: Date.now(),
  };
  const query = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.ENTRA_REDIRECT_URI!,
    response_mode: "query",
    scope: requestedScopes().join(" "),
    state: flow.state,
    code_challenge: sha256Base64Url(verifier),
    code_challenge_method: "S256",
    prompt: "consent",
  });
  return {
    url: `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${query}`,
    cookie: sealJson(flow, "entra-pkce-flow"),
  };
}

export function consumeEntraFlow(cookie: string | undefined, returnedState: string): EntraFlow {
  if (!cookie) throw new Error("missing OAuth transaction cookie");
  const flow = openJson<EntraFlow>(cookie, "entra-pkce-flow");
  if (Date.now() - flow.createdAt > FLOW_TTL_MS) throw new Error("OAuth transaction expired");
  if (!timingSafeTextEqual(flow.state, returnedState)) throw new Error("OAuth state mismatch");
  return flow;
}

export async function redeemEntraCode(code: string, verifier: string): Promise<EntraTokenSet> {
  const body = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID!,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.ENTRA_REDIRECT_URI!,
    code_verifier: verifier,
    scope: requestedScopes().join(" "),
  });
  if (process.env.ENTRA_CLIENT_SECRET) body.set("client_secret", process.env.ENTRA_CLIENT_SECRET);
  const response = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const payload = await response.json() as EntraTokenSet & { error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Entra token exchange failed (${response.status})`);
  }
  if (!payload.refresh_token) throw new Error("Entra did not return a refresh token; ensure offline_access is granted");
  return payload;
}

export async function fetchEntraProfile(accessToken: string): Promise<EntraProfile> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const payload = await response.json() as EntraProfile & { error?: { message?: string } };
  if (!response.ok || !payload.id) throw new Error(payload.error?.message || `Microsoft Graph profile lookup failed (${response.status})`);
  return payload;
}

export const entraFlowCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/oauth/entra/callback",
  maxAge: FLOW_TTL_MS / 1000,
};
