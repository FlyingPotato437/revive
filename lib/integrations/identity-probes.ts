// Curated identity probes for Nango provider templates that do not ship a
// certified built-in adapter. Each probe is a GET request executed through
// Nango's proxy against the provider's own "who am I" endpoint; Revive stores
// only the resulting subject/tenant/account binding.
//
// Probes here are still PROVISIONAL: Revive has not certified the stability of
// these identity fields with a live recovery pass. They exist so a workspace
// can enable most of the Nango catalog without hand-writing a custom
// connector. Where a provider exposes no organization identifier, tenantField
// intentionally repeats subjectField: the binding degrades to subject-only,
// which recovery still enforces.
//
// Keys are Nango provider template names (integration.provider), not
// integration unique keys.

import type { IdentityProbeDefinition } from "@/lib/custom-connectors";

export interface CuratedIdentityProbe {
  label: string;
  probe: IdentityProbeDefinition;
}

export const CURATED_IDENTITY_PROBES: Record<string, CuratedIdentityProbe> = {
  salesforce: {
    label: "Salesforce",
    probe: { path: "/services/oauth2/userinfo", subjectField: "user_id", tenantField: "organization_id", accountField: "email" },
  },
  "salesforce-sandbox": {
    label: "Salesforce Sandbox",
    probe: { path: "/services/oauth2/userinfo", subjectField: "user_id", tenantField: "organization_id", accountField: "email" },
  },
  jira: {
    // /myself returns no organization identifier; cloud binding comes from the
    // connection's cloudId in Nango's proxy base, so tenant repeats subject.
    label: "Jira",
    probe: { path: "/rest/api/3/myself", subjectField: "accountId", tenantField: "accountId", accountField: "emailAddress" },
  },
  zendesk: {
    label: "Zendesk",
    probe: { path: "/api/v2/users/me", subjectField: "user.id", tenantField: "user.id", accountField: "user.email" },
  },
  hubspot: {
    // Account-level probe: HubSpot has no proxy-reachable current-user
    // endpoint, so the binding is the portal, not the person.
    label: "HubSpot",
    probe: { path: "/account-info/v3/details", subjectField: "portalId", tenantField: "portalId", accountField: "portalId" },
  },
  stripe: {
    label: "Stripe",
    probe: { path: "/v1/account", subjectField: "id", tenantField: "id", accountField: "email" },
  },
  gitlab: {
    label: "GitLab",
    probe: { path: "/user", subjectField: "id", tenantField: "id", accountField: "username" },
  },
  bitbucket: {
    label: "Bitbucket",
    probe: { path: "/2.0/user", subjectField: "uuid", tenantField: "uuid", accountField: "username" },
  },
  notion: {
    label: "Notion",
    probe: { path: "/v1/users/me", subjectField: "id", tenantField: "id", accountField: "name" },
  },
  asana: {
    label: "Asana",
    probe: { path: "/api/1.0/users/me", subjectField: "data.gid", tenantField: "data.gid", accountField: "data.email" },
  },
  clickup: {
    label: "ClickUp",
    probe: { path: "/api/v2/user", subjectField: "user.id", tenantField: "user.id", accountField: "user.email" },
  },
  airtable: {
    label: "Airtable",
    probe: { path: "/v0/meta/whoami", subjectField: "id", tenantField: "id", accountField: "email" },
  },
  intercom: {
    label: "Intercom",
    probe: { path: "/me", subjectField: "id", tenantField: "app.id_code", accountField: "email" },
  },
  zoom: {
    label: "Zoom",
    probe: { path: "/v2/users/me", subjectField: "id", tenantField: "account_id", accountField: "email" },
  },
  calendly: {
    label: "Calendly",
    probe: { path: "/users/me", subjectField: "resource.uri", tenantField: "resource.current_organization", accountField: "resource.email" },
  },
  pipedrive: {
    label: "Pipedrive",
    probe: { path: "/v1/users/me", subjectField: "data.id", tenantField: "data.company_id", accountField: "data.email" },
  },
  freshdesk: {
    label: "Freshdesk",
    probe: { path: "/api/v2/agents/me", subjectField: "id", tenantField: "id", accountField: "contact.email" },
  },
  front: {
    label: "Front",
    probe: { path: "/me", subjectField: "id", tenantField: "id", accountField: "username" },
  },
  linkedin: {
    label: "LinkedIn",
    probe: { path: "/v2/userinfo", subjectField: "sub", tenantField: "sub", accountField: "email" },
  },
  typeform: {
    label: "Typeform",
    probe: { path: "/me", subjectField: "user_id", tenantField: "user_id", accountField: "email" },
  },
  figma: {
    label: "Figma",
    probe: { path: "/v1/me", subjectField: "id", tenantField: "id", accountField: "email" },
  },
  discord: {
    label: "Discord",
    probe: { path: "/users/@me", subjectField: "id", tenantField: "id", accountField: "username" },
  },
  box: {
    label: "Box",
    probe: { path: "/2.0/users/me", subjectField: "id", tenantField: "id", accountField: "login" },
  },
  shopify: {
    // Version-pinned admin path; revisit when Nango bumps the template.
    label: "Shopify",
    probe: { path: "/api/2024-04/shop.json", subjectField: "shop.id", tenantField: "shop.myshopify_domain", accountField: "shop.email" },
  },
  mailchimp: {
    label: "Mailchimp",
    probe: { path: "/3.0/", subjectField: "account_id", tenantField: "account_id", accountField: "email" },
  },
};

export function curatedIdentityProbe(providerName: string): CuratedIdentityProbe | null {
  return CURATED_IDENTITY_PROBES[providerName] || null;
}
