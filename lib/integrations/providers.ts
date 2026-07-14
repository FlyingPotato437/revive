// Connector registry: maps Nango integration ids to a provider adapter that
// knows how to (a) fetch the account identity used for creation-time binding
// and recovery verification, (b) declare the nominal recovery scope set, and
// (c) contribute connect-session defaults. An integration is offered when it
// is registered in the Nango project and an identity adapter resolves for it:
// a built-in spec here, a workspace custom connector, or the curated probe
// pack. NANGO_ALLOWED_INTEGRATIONS optionally restricts the offered set.

import {
  MICROSOFT_GRAPH_RECOVERY_SCOPES,
  MICROSOFT_GRAPH_USER_SCOPES,
  fetchNangoMicrosoftIdentity,
  listNangoIntegrations,
  nangoIntegrationRestriction,
  nangoProxy,
  type NangoIntegration,
  type NangoConnectSessionInput,
} from "./nango";
import { curatedIdentityProbe } from "./identity-probes";
import {
  getCustomConnector,
  listCustomConnectors,
  safeDotPathGet,
  type CustomConnectorDefinition,
  type IdentityProbeDefinition,
} from "@/lib/custom-connectors";

export interface ProviderIdentity {
  subject: string;
  tenant: string;
  accountId: string;
  displayName?: string;
}

export interface ProviderSpec {
  /** Stored as connection.provider and shown in the console/recovery page. */
  key: string;
  label: string;
  /** OIDC-style issuer recorded on the connection binding. */
  issuer: (identity: ProviderIdentity) => string;
  /** Nominal scope set recorded on connections made through the console. */
  recoveryScopes: string[];
  /** Workspace-defined probes are operator supplied and not Revive-certified. */
  provisional?: boolean;
  fetchIdentity: (input: { integrationId: string; connectionId: string }) => Promise<ProviderIdentity>;
  sessionDefaults?: (integrationId: string) => NonNullable<NangoConnectSessionInput["integrationDefaults"]>[string] | undefined;
}

async function proxyJson<T>(input: { integrationId: string; connectionId: string; path: string }): Promise<T> {
  const response = await nangoProxy(input);
  const payload = await response.json() as T & { error?: { message?: string } | string; message?: string };
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(detail || payload.message || `identity check failed (${response.status})`);
  }
  return payload;
}

const MICROSOFT: ProviderSpec = {
  key: "microsoft",
  label: "Microsoft",
  issuer: (identity) => `https://login.microsoftonline.com/${identity.tenant}/v2.0`,
  recoveryScopes: [...MICROSOFT_GRAPH_RECOVERY_SCOPES],
  fetchIdentity: fetchNangoMicrosoftIdentity,
  sessionDefaults: () => process.env.ENTRA_TENANT_ID
    ? { connectionConfig: { tenant: process.env.ENTRA_TENANT_ID }, userScopes: MICROSOFT_GRAPH_USER_SCOPES }
    : undefined,
};

const GOOGLE: ProviderSpec = {
  key: "google",
  label: "Google",
  issuer: () => "https://accounts.google.com",
  recoveryScopes: ["openid", "email", "profile"],
  fetchIdentity: async (input) => {
    const payload = await proxyJson<{ sub?: string; email?: string; hd?: string; name?: string }>({
      ...input,
      path: "/oauth2/v3/userinfo",
    });
    if (!payload.sub) throw new Error("Google userinfo returned no subject");
    return {
      subject: payload.sub,
      tenant: payload.hd || "google-consumer",
      accountId: payload.email || payload.sub,
      displayName: payload.name,
    };
  },
  sessionDefaults: () => ({ authorizationParams: { access_type: "offline", prompt: "consent" } }),
};

const GOOGLE_MAIL: ProviderSpec = {
  ...GOOGLE,
  // google-mail's proxy base is gmail.googleapis.com, so identity comes from
  // the Gmail profile. The address is the stable subject for a mailbox grant.
  fetchIdentity: async (input) => {
    const payload = await proxyJson<{ emailAddress?: string }>({
      ...input,
      path: "/gmail/v1/users/me/profile",
    });
    if (!payload.emailAddress) throw new Error("Gmail profile returned no email address");
    const domain = payload.emailAddress.split("@")[1] || "google-consumer";
    return {
      subject: payload.emailAddress.toLowerCase(),
      tenant: domain === "gmail.com" ? "google-consumer" : domain,
      accountId: payload.emailAddress,
    };
  },
  recoveryScopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify"],
};

const GITHUB: ProviderSpec = {
  key: "github",
  label: "GitHub",
  issuer: () => "https://github.com",
  recoveryScopes: ["repo", "user:email"],
  fetchIdentity: async (input) => {
    const payload = await proxyJson<{ id?: number; login?: string; name?: string }>({
      ...input,
      path: "/user",
    });
    if (!payload.id || !payload.login) throw new Error("GitHub /user returned no identity");
    return {
      subject: String(payload.id),
      tenant: "github",
      accountId: payload.login,
      displayName: payload.name || payload.login,
    };
  },
};

const SLACK: ProviderSpec = {
  key: "slack",
  label: "Slack",
  issuer: () => "https://slack.com",
  recoveryScopes: ["chat:write", "users:read"],
  fetchIdentity: async (input) => {
    const payload = await proxyJson<{ ok?: boolean; user_id?: string; team_id?: string; user?: string; team?: string; error?: string }>({
      ...input,
      path: "/api/auth.test",
    });
    if (!payload.ok || !payload.user_id || !payload.team_id) {
      throw new Error(typeof payload.error === "string" ? `Slack auth.test failed: ${payload.error}` : "Slack auth.test returned no identity");
    }
    return {
      subject: payload.user_id,
      tenant: payload.team_id,
      accountId: payload.user ? `${payload.user}@${payload.team || payload.team_id}` : payload.user_id,
      displayName: payload.user,
    };
  },
};

/** integration id (exact or prefix) → provider adapter */
const INTEGRATION_PROVIDERS: [RegExp, ProviderSpec][] = [
  [/^microsoft/, MICROSOFT],
  [/^entra/, MICROSOFT],
  [/^google-mail$|^gmail/, GOOGLE_MAIL],
  [/^google/, GOOGLE],
  [/^github/, GITHUB],
  [/^slack/, SLACK],
];

export function builtInProviderForIntegration(integrationId: string): ProviderSpec | null {
  for (const [pattern, spec] of INTEGRATION_PROVIDERS) {
    if (pattern.test(integrationId)) return spec;
  }
  return null;
}

function requiredIdentityValue(value: unknown, field: "subject" | "tenant", connector: { label: string }): string {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim().length === 0) {
    throw new Error(`${connector.label} identity probe returned no ${field}; connection was not bound`);
  }
  return String(value).trim();
}

export function identityFromCustomProbe(payload: unknown, connector: { label: string; identityProbe: IdentityProbeDefinition }): ProviderIdentity {
  const subject = requiredIdentityValue(safeDotPathGet(payload, connector.identityProbe.subjectField), "subject", connector);
  const tenant = requiredIdentityValue(safeDotPathGet(payload, connector.identityProbe.tenantField), "tenant", connector);
  const accountValue = safeDotPathGet(payload, connector.identityProbe.accountField);
  const accountId = (typeof accountValue === "string" || typeof accountValue === "number") && String(accountValue).trim()
    ? String(accountValue).trim()
    : subject;
  return { subject, tenant, accountId };
}

function probeProvider(key: string, label: string, identityProbe: IdentityProbeDefinition): ProviderSpec {
  return {
    key,
    label,
    issuer: (identity) => `nango://${key}/${encodeURIComponent(identity.tenant)}`,
    recoveryScopes: [],
    provisional: true,
    fetchIdentity: async (input) => {
      const payload = await proxyJson<unknown>({ ...input, path: identityProbe.path });
      return identityFromCustomProbe(payload, { label, identityProbe });
    },
  };
}

function customProvider(connector: CustomConnectorDefinition): ProviderSpec {
  return probeProvider(connector.integrationId, connector.label, connector.identityProbe);
}

/** Built-ins take precedence, then workspace definitions, then the curated
 *  probe pack keyed by the integration's provider template. */
export async function providerForIntegration(integrationId: string, workspaceId?: string): Promise<ProviderSpec | null> {
  const builtIn = builtInProviderForIntegration(integrationId);
  if (builtIn) return builtIn;
  const registered = (await listNangoIntegrations()).find((integration) => integration.id === integrationId);
  const registeredBuiltIn = registered ? builtInProviderForIntegration(registered.provider) : null;
  if (registeredBuiltIn) return registeredBuiltIn;
  if (workspaceId) {
    const connector = await getCustomConnector(workspaceId, integrationId);
    if (connector) return customProvider(connector);
  }
  const curated = registered ? curatedIdentityProbe(registered.provider) : null;
  return curated ? probeProvider(integrationId, curated.label, curated.probe) : null;
}

export async function fetchNangoIdentity(input: { integrationId: string; connectionId: string; workspaceId?: string }): Promise<ProviderIdentity> {
  const provider = await providerForIntegration(input.integrationId, input.workspaceId);
  if (!provider) throw new Error(`no identity adapter for integration "${input.integrationId}"`);
  return provider.fetchIdentity({ integrationId: input.integrationId, connectionId: input.connectionId });
}

export interface NangoIntegrationOption {
  id: string;
  provider: string;
  label: string;
  provisional: boolean;
}

/** Labels for conventional integration ids. Availability is always determined
 *  from Nango's live integration registry, never from this catalog alone. */
export const BUILT_IN_CATALOG: { id: string; label: string }[] = [
  { id: "microsoft-tenant-specific", label: "Microsoft 365" },
  { id: "google-mail", label: "Gmail" },
  { id: "github", label: "GitHub" },
  { id: "slack", label: "Slack" },
];

const CATALOG_LABELS = new Map(BUILT_IN_CATALOG.map((item) => [item.id, item.label]));

/** Every integration registered in the Nango project that Revive can bind an
 *  identity for: built-in adapters (certified), workspace custom connectors,
 *  then the curated probe pack (both provisional). `restriction` is the
 *  optional NANGO_ALLOWED_INTEGRATIONS override; `null` means unrestricted. */
export function resolveNangoIntegrationOptions(
  registered: NangoIntegration[],
  restriction: string[] | null,
  customConnectors: CustomConnectorDefinition[],
): NangoIntegrationOption[] {
  const allowlist = restriction ? new Set(restriction) : null;
  const custom = new Map(customConnectors.map((connector) => [connector.integrationId, connector]));
  const options = registered.flatMap((integration) => {
    if (allowlist && !allowlist.has(integration.id)) return [];
    const builtIn = builtInProviderForIntegration(integration.id)
      || builtInProviderForIntegration(integration.provider);
    if (builtIn) {
      return [{
        id: integration.id,
        provider: builtIn.key,
        label: CATALOG_LABELS.get(integration.id) || builtIn.label,
        provisional: false,
      }];
    }
    // A custom definition cannot shadow a built-in adapter.
    const connector = custom.get(integration.id);
    if (connector) {
      return [{ id: integration.id, provider: integration.provider, label: connector.label, provisional: true }];
    }
    const curated = curatedIdentityProbe(integration.provider);
    if (curated) {
      return [{
        id: integration.id,
        provider: integration.provider,
        label: integration.displayName || curated.label,
        provisional: true,
      }];
    }
    return [];
  });
  return options.sort((a, b) => Number(a.provisional) - Number(b.provisional) || a.label.localeCompare(b.label));
}

export async function nangoIntegrationsForWorkspace(workspaceId: string): Promise<NangoIntegrationOption[]> {
  return resolveNangoIntegrationOptions(
    await listNangoIntegrations(),
    nangoIntegrationRestriction(),
    await listCustomConnectors(workspaceId),
  );
}

export async function nangoIntegrationAvailable(workspaceId: string, integrationId: string): Promise<boolean> {
  return (await nangoIntegrationsForWorkspace(workspaceId)).some((integration) => integration.id === integrationId);
}

/** Connect-session defaults for every requested integration that declares any. */
export function connectSessionDefaults(integrationIds: string[]): NangoConnectSessionInput["integrationDefaults"] {
  const entries = integrationIds.flatMap((id) => {
    const defaults = builtInProviderForIntegration(id)?.sessionDefaults?.(id);
    return defaults ? [[id, defaults] as const] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}
