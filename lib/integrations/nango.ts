const DEFAULT_NANGO_URL = "https://api.nango.dev";

export interface NangoConnectSessionInput {
  endUser: { id: string; email?: string; displayName?: string };
  organization?: { id: string; displayName?: string };
  allowedIntegrations: string[];
  integrationDefaults?: Record<string, {
    connectionConfig?: Record<string, unknown>;
    authorizationParams?: Record<string, string>;
    userScopes?: string;
  }>;
}

export interface NangoConnectSession {
  token: string;
  expiresAt: string;
}

function config() {
  if (!process.env.NANGO_SECRET_KEY) throw new Error("NANGO_SECRET_KEY is not configured");
  return { secret: process.env.NANGO_SECRET_KEY, baseUrl: (process.env.NANGO_BASE_URL || DEFAULT_NANGO_URL).replace(/\/$/, "") };
}

export function nangoConfigured(): boolean {
  return Boolean(process.env.NANGO_SECRET_KEY);
}

export function allowedNangoIntegrations(): string[] {
  return (process.env.NANGO_ALLOWED_INTEGRATIONS || "microsoft-tenant-specific")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^[a-zA-Z0-9_-]+$/.test(item));
}

function serializeDefaults(input: NangoConnectSessionInput["integrationDefaults"]) {
  if (!input) return undefined;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, {
    connection_config: value.connectionConfig,
    authorization_params: value.authorizationParams,
    user_scopes: value.userScopes,
  }]));
}

async function nangoFetch(path: string, init: RequestInit): Promise<Response> {
  const { secret, baseUrl } = config();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return response;
}

export async function createNangoConnectSession(input: NangoConnectSessionInput): Promise<NangoConnectSession> {
  const response = await nangoFetch("/connect/sessions", {
    method: "POST",
    body: JSON.stringify({
      end_user: { id: input.endUser.id, email: input.endUser.email, display_name: input.endUser.displayName },
      organization: input.organization ? { id: input.organization.id, display_name: input.organization.displayName } : undefined,
      allowed_integrations: input.allowedIntegrations,
      integrations_config_defaults: serializeDefaults(input.integrationDefaults),
    }),
  });
  const payload = await response.json() as { data?: { token?: string; expires_at?: string }; error?: string; message?: string };
  if (!response.ok || !payload.data?.token || !payload.data.expires_at) {
    throw new Error(payload.message || payload.error || `Nango connect session failed (${response.status})`);
  }
  return { token: payload.data.token, expiresAt: payload.data.expires_at };
}

export async function createNangoReconnectSession(input: {
  connectionId: string;
  integrationId: string;
  endUser?: NangoConnectSessionInput["endUser"];
  organization?: NangoConnectSessionInput["organization"];
  integrationDefaults?: NangoConnectSessionInput["integrationDefaults"];
}): Promise<NangoConnectSession> {
  const response = await nangoFetch("/connect/sessions/reconnect", {
    method: "POST",
    body: JSON.stringify({
      connection_id: input.connectionId,
      integration_id: input.integrationId,
      end_user: input.endUser ? {
        id: input.endUser.id,
        email: input.endUser.email,
        display_name: input.endUser.displayName,
      } : undefined,
      organization: input.organization ? {
        id: input.organization.id,
        display_name: input.organization.displayName,
      } : undefined,
      integrations_config_defaults: serializeDefaults(input.integrationDefaults),
    }),
  });
  const payload = await response.json() as {
    data?: { token?: string; expires_at?: string };
    error?: { message?: string } | string;
    message?: string;
  };
  if (!response.ok || !payload.data?.token || !payload.data.expires_at) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || detail || `Nango reconnect session failed (${response.status})`);
  }
  return { token: payload.data.token, expiresAt: payload.data.expires_at };
}

export async function nangoProxy(input: { integrationId: string; connectionId: string; path: string; method?: string; body?: unknown; retries?: number }): Promise<Response> {
  if (!input.path.startsWith("/") || input.path.startsWith("//")) throw new Error("Nango proxy path must be relative");
  return nangoFetch(`/proxy${input.path}`, {
    method: input.method || "GET",
    headers: {
      "Provider-Config-Key": input.integrationId,
      "Connection-Id": input.connectionId,
      "Retries": String(Math.max(0, Math.min(input.retries || 0, 5))),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
}

export interface NangoMicrosoftIdentity {
  subject: string;
  tenant: string;
  accountId: string;
  displayName?: string;
}

export async function fetchNangoMicrosoftIdentity(input: {
  integrationId: string;
  connectionId: string;
}): Promise<NangoMicrosoftIdentity> {
  const response = await nangoProxy({
    ...input,
    path: "/v1.0/me?$select=id,displayName,mail,userPrincipalName",
  });
  const payload = await response.json() as {
    id?: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Microsoft Graph identity check failed (${response.status})`);
  }
  const tenant = process.env.ENTRA_TENANT_ID;
  if (!tenant || tenant === "common" || tenant === "organizations") {
    throw new Error("ENTRA_TENANT_ID must be a concrete tenant for identity-bound Nango recovery");
  }
  return {
    subject: payload.id,
    tenant,
    accountId: payload.mail || payload.userPrincipalName || payload.id,
    displayName: payload.displayName,
  };
}
