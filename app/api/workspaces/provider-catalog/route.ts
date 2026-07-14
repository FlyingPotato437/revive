import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  createNangoIntegration,
  listNangoIntegrations,
  listNangoProviders,
  nangoConfigured,
  nangoIntegrationRestriction,
} from "@/lib/integrations/nango";
import { curatedIdentityProbe } from "@/lib/integrations/identity-probes";
import { builtInProviderForIntegration, nangoIntegrationsForWorkspace } from "@/lib/integrations/providers";
import { requireWorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Auth modes whose integration-level credentials our enable flow can send to
 *  Nango. APP/CUSTOM providers must be configured in the Nango dashboard. */
const OAUTH_CREDENTIAL_MODES = new Set(["OAUTH1", "OAUTH2", "TBA"]);

type CatalogStatus = "ready" | "registered_needs_probe" | "available" | "manual";

interface CatalogEntry {
  provider: string;
  displayName: string;
  authMode: string;
  categories: string[];
  docsUrl?: string;
  logoUrl?: string;
  status: CatalogStatus;
  /** Present when the provider is registered in the Nango project. */
  integrationId?: string;
  provisional?: boolean;
  /** Enable flow must collect an OAuth client id/secret first. */
  requiresCredentials: boolean;
  /** Identity binding source if enabled today. */
  identity: "built-in" | "curated" | "custom" | "none";
}

export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    if (!nangoConfigured()) return NextResponse.json({ configured: false, restricted: false, catalog: [] });

    const [providers, registered, options] = await Promise.all([
      listNangoProviders(),
      listNangoIntegrations(),
      nangoIntegrationsForWorkspace(workspace.id),
    ]);
    const optionById = new Map(options.map((option) => [option.id, option]));
    const registeredByProvider = new Map(registered.map((integration) => [integration.provider, integration]));

    const catalog: CatalogEntry[] = providers.map((provider) => {
      const integration = registeredByProvider.get(provider.name);
      const option = integration ? optionById.get(integration.id) : undefined;
      const builtIn = Boolean(builtInProviderForIntegration(provider.name));
      const curated = Boolean(curatedIdentityProbe(provider.name));
      const identity: CatalogEntry["identity"] = option && !option.provisional
        ? "built-in"
        : option && option.provisional && !curated
          ? "custom"
          : builtIn
            ? "built-in"
            : curated
              ? "curated"
              : "none";
      const requiresCredentials = OAUTH_CREDENTIAL_MODES.has(provider.authMode);
      const status: CatalogStatus = option
        ? "ready"
        : integration
          ? "registered_needs_probe"
          : !requiresCredentials && !["API_KEY", "BASIC", "OAUTH2_CC", "JWT", "SIGNATURE", "TWO_STEP", "NONE"].includes(provider.authMode)
            ? "manual"
            : "available";
      return {
        provider: provider.name,
        displayName: provider.displayName,
        authMode: provider.authMode,
        categories: provider.categories,
        docsUrl: provider.docsUrl,
        logoUrl: provider.logoUrl,
        status,
        integrationId: integration?.id,
        provisional: option?.provisional,
        requiresCredentials,
        identity,
      };
    });

    return NextResponse.json({
      configured: true,
      restricted: nangoIntegrationRestriction() !== null,
      catalog,
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "catalog unavailable" }, { status });
  }
}

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    // Enabling a provider registers it in the shared Nango project, so this is
    // an admin action even though connecting afterwards is not.
    await requireWorkspaceRole(session.email, workspace, "admin");
    if (!nangoConfigured()) return NextResponse.json({ error: "Nango is not configured" }, { status: 400 });

    const body = await req.json();
    const providerName = String(body.provider || "").trim();
    const template = (await listNangoProviders()).find((provider) => provider.name === providerName);
    if (!template) return NextResponse.json({ error: `unknown Nango provider "${providerName}"` }, { status: 404 });
    if ((await listNangoIntegrations()).some((integration) => integration.provider === providerName)) {
      return NextResponse.json({ error: `${template.displayName} is already registered in the Nango project` }, { status: 409 });
    }

    const clientId = String(body.clientId || "").trim();
    const clientSecret = String(body.clientSecret || "").trim();
    const scopes = String(body.scopes || "").trim();
    const needsCredentials = OAUTH_CREDENTIAL_MODES.has(template.authMode);
    if (needsCredentials && (!clientId || !clientSecret)) {
      return NextResponse.json({ error: `${template.displayName} uses ${template.authMode}; an OAuth client id and secret are required` }, { status: 400 });
    }

    const integration = await createNangoIntegration({
      provider: providerName,
      uniqueKey: providerName,
      displayName: template.displayName,
      credentials: needsCredentials
        ? { type: template.authMode as "OAUTH1" | "OAUTH2" | "TBA", clientId, clientSecret, scopes: scopes || undefined }
        : undefined,
    });

    const identity = builtInProviderForIntegration(providerName)
      ? "built-in"
      : curatedIdentityProbe(providerName)
        ? "curated"
        : "custom-required";
    const restriction = nangoIntegrationRestriction();
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "connection",
      subjectId: integration.id,
      event: "provider_integration_enabled",
      detail: { provider: providerName, authMode: template.authMode, identity, credentialsProvided: needsCredentials },
    });
    return NextResponse.json({
      integration,
      identity,
      warning: restriction && !restriction.includes(integration.id)
        ? `NANGO_ALLOWED_INTEGRATIONS is set and does not include "${integration.id}"; add it or unset the variable for this provider to be offered.`
        : identity === "custom-required"
          ? "No identity probe is known for this provider. Register a custom connector before users connect it."
          : undefined,
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not enable provider" }, { status });
  }
}
