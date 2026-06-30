export interface Auth0ExchangeInput {
  subjectToken: string;
  subjectTokenType: "access_token" | "refresh_token";
  connection: string;
  loginHint?: string;
}

export interface Auth0FederatedToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope?: string;
}

export async function exchangeAuth0Token(input: Auth0ExchangeInput): Promise<Auth0FederatedToken> {
  const domain = process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain || !process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_CLIENT_SECRET) {
    throw new Error("AUTH0_DOMAIN, AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET are required");
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(input.connection)) throw new Error("invalid Auth0 connection name");
  const subjectType = input.subjectTokenType === "refresh_token"
    ? "urn:ietf:params:oauth:token-type:refresh_token"
    : "urn:ietf:params:oauth:token-type:access_token";
  const body: Record<string, string> = {
    client_id: process.env.AUTH0_CLIENT_ID,
    client_secret: process.env.AUTH0_CLIENT_SECRET,
    subject_token: input.subjectToken,
    grant_type: "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
    subject_token_type: subjectType,
    requested_token_type: "http://auth0.com/oauth/token-type/federated-connection-access-token",
    connection: input.connection,
  };
  if (input.loginHint) body.login_hint = input.loginHint;
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const payload = await response.json() as { access_token?: string; token_type?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Auth0 Token Vault exchange failed (${response.status})`);
  }
  return { accessToken: payload.access_token, tokenType: payload.token_type || "Bearer", expiresIn: payload.expires_in || 3600, scope: payload.scope };
}
