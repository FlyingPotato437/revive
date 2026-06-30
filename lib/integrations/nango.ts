const DEFAULT_NANGO_URL = "https://api.nango.dev";

export interface NangoConnectSessionInput {
  endUser: { id: string; email?: string; displayName?: string };
  organization?: { id: string; displayName?: string };
  allowedIntegrations: string[];
}

export interface NangoConnectSession {
  token: string;
  expiresAt: string;
}

function config() {
  if (!process.env.NANGO_SECRET_KEY) throw new Error("NANGO_SECRET_KEY is not configured");
  return { secret: process.env.NANGO_SECRET_KEY, baseUrl: (process.env.NANGO_BASE_URL || DEFAULT_NANGO_URL).replace(/\/$/, "") };
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
    }),
  });
  const payload = await response.json() as { data?: { token?: string; expires_at?: string }; error?: string; message?: string };
  if (!response.ok || !payload.data?.token || !payload.data.expires_at) {
    throw new Error(payload.message || payload.error || `Nango connect session failed (${response.status})`);
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
