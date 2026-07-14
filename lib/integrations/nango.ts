const DEFAULT_NANGO_URL = "https://api.nango.dev";

export const MICROSOFT_GRAPH_RECOVERY_SCOPES = [
  "offline_access",
  "openid",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.Read",
  "Files.Read.All",
] as const;

export const MICROSOFT_GRAPH_USER_SCOPES = MICROSOFT_GRAPH_RECOVERY_SCOPES
  .filter((scope) => scope !== "offline_access" && scope !== "openid")
  .join(" ");

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

export interface NangoIntegration {
  id: string;
  provider: string;
  displayName?: string;
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

/** Optional operator restriction on offered integrations. `null` means the
 *  Nango project registry itself is the boundary: every integration registered
 *  there may be offered, subject to an identity adapter existing. */
export function nangoIntegrationRestriction(): string[] | null {
  if (!process.env.NANGO_ALLOWED_INTEGRATIONS?.trim()) return null;
  return allowedNangoIntegrations();
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

/** The integration ids that really exist in the configured Nango environment.
 *  This is the source of truth for what the console may offer to users. */
export async function listNangoIntegrations(): Promise<NangoIntegration[]> {
  const response = await nangoFetch("/integrations", { method: "GET" });
  const payload = await response.json() as {
    data?: Array<{
      unique_key?: unknown;
      provider?: unknown;
      display_name?: unknown;
    }>;
    error?: { message?: string } | string;
    message?: string;
  };
  if (!response.ok || !Array.isArray(payload.data)) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || detail || `Nango integration registry failed (${response.status})`);
  }
  return payload.data.flatMap((integration) => {
    if (typeof integration.unique_key !== "string" || typeof integration.provider !== "string") return [];
    if (!/^[a-zA-Z0-9_-]+$/.test(integration.unique_key) || !/^[a-zA-Z0-9_-]+$/.test(integration.provider)) return [];
    return [{
      id: integration.unique_key,
      provider: integration.provider,
      displayName: typeof integration.display_name === "string" ? integration.display_name : undefined,
    }];
  });
}

export interface NangoProviderTemplate {
  /** Provider template key in Nango's catalog, e.g. "salesforce". */
  name: string;
  displayName: string;
  authMode: string;
  categories: string[];
  docsUrl?: string;
  logoUrl?: string;
  /** Connection-config keys the provider requires at connect time. */
  connectionConfig: string[];
}

const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000;
let providerCatalogCache: { at: number; data: NangoProviderTemplate[] } | null = null;

/** Nango's full provider-template catalog (~hundreds of APIs). Cached in
 *  process memory; this is display metadata, not an availability decision. */
export async function listNangoProviders(): Promise<NangoProviderTemplate[]> {
  if (providerCatalogCache && Date.now() - providerCatalogCache.at < PROVIDER_CACHE_TTL_MS) {
    return providerCatalogCache.data;
  }
  const response = await nangoFetch("/providers", { method: "GET" });
  const payload = await response.json() as {
    data?: Array<{
      name?: unknown;
      display_name?: unknown;
      auth_mode?: unknown;
      categories?: unknown;
      docs?: unknown;
      logo_url?: unknown;
      connection_configuration?: unknown;
    }>;
    error?: { message?: string } | string;
    message?: string;
  };
  if (!response.ok || !Array.isArray(payload.data)) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || detail || `Nango provider catalog failed (${response.status})`);
  }
  const data = payload.data.flatMap((provider) => {
    if (typeof provider.name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(provider.name)) return [];
    return [{
      name: provider.name,
      displayName: typeof provider.display_name === "string" && provider.display_name.trim()
        ? provider.display_name
        : provider.name,
      authMode: typeof provider.auth_mode === "string" ? provider.auth_mode : "OAUTH2",
      categories: Array.isArray(provider.categories)
        ? provider.categories.filter((category): category is string => typeof category === "string")
        : [],
      docsUrl: typeof provider.docs === "string" ? provider.docs : undefined,
      logoUrl: typeof provider.logo_url === "string" ? provider.logo_url : undefined,
      connectionConfig: Array.isArray(provider.connection_configuration)
        ? provider.connection_configuration.filter((key): key is string => typeof key === "string")
        : [],
    }];
  });
  providerCatalogCache = { at: Date.now(), data };
  return data;
}

export interface CreateNangoIntegrationInput {
  provider: string;
  uniqueKey: string;
  displayName?: string;
  /** Required for OAuth-style providers; API-key providers need none. */
  credentials?: { type: "OAUTH1" | "OAUTH2" | "TBA"; clientId: string; clientSecret: string; scopes?: string };
}

/** Register a provider integration in the configured Nango project so users
 *  can connect it. Credentials go straight to Nango; Revive never stores them. */
export async function createNangoIntegration(input: CreateNangoIntegrationInput): Promise<NangoIntegration> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.uniqueKey)) throw new Error("integration unique key must be 1-100 letters, numbers, underscores, or hyphens");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.provider)) throw new Error("provider key must be 1-100 letters, numbers, underscores, or hyphens");
  const response = await nangoFetch("/integrations", {
    method: "POST",
    body: JSON.stringify({
      unique_key: input.uniqueKey,
      provider: input.provider,
      display_name: input.displayName,
      credentials: input.credentials
        ? {
          type: input.credentials.type,
          client_id: input.credentials.clientId,
          client_secret: input.credentials.clientSecret,
          scopes: input.credentials.scopes,
        }
        : undefined,
    }),
  });
  const payload = await response.json() as {
    data?: { unique_key?: string; provider?: string; display_name?: string };
    error?: { message?: string; code?: string } | string;
    message?: string;
  };
  if (!response.ok || !payload.data?.unique_key || !payload.data.provider) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message || payload.error?.code;
    throw new Error(payload.message || detail || `Nango integration creation failed (${response.status})`);
  }
  return {
    id: payload.data.unique_key,
    provider: payload.data.provider,
    displayName: payload.data.display_name,
  };
}

export async function createNangoConnectSession(input: NangoConnectSessionInput): Promise<NangoConnectSession> {
  const response = await nangoFetch("/connect/sessions", {
    method: "POST",
    body: JSON.stringify({
      tags: {
        end_user_id: input.endUser.id,
        end_user_email: input.endUser.email,
        organization_id: input.organization?.id,
      },
      allowed_integrations: input.allowedIntegrations,
      integrations_config_defaults: serializeDefaults(input.integrationDefaults),
    }),
  });
  const payload = await response.json() as {
    data?: { token?: string; expires_at?: string };
    error?: { message?: string; code?: string; errors?: { message?: string }[] } | string;
    message?: string;
  };
  if (!response.ok || !payload.data?.token || !payload.data.expires_at) {
    const detail = typeof payload.error === "string"
      ? payload.error
      : payload.error?.message || payload.error?.errors?.[0]?.message || payload.error?.code;
    throw new Error(payload.message || detail || `Nango connect session failed (${response.status})`);
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
      tags: input.endUser || input.organization ? {
        end_user_id: input.endUser?.id,
        end_user_email: input.endUser?.email,
        organization_id: input.organization?.id,
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
