// ---------------------------------------------------------------------------
// Provider error taxonomy.
//
// Sourced recovery policy catalog. Provider codes are inputs to policy; the
// defensible product is the recovery control plane and its outcome data, not a
// hard-coded error table.
// ---------------------------------------------------------------------------

import type { Provider, Verdict } from "./types";

export interface CodeEntry {
  provider: Provider;
  code: string;
  oauthError: string;
  verdict: Verdict;
  title: string;
  reason: string;
  remediation: string;
  source: string;
}

export const CODE_TABLE: CodeEntry[] = [
  // --- Microsoft Entra / Graph: truly-dead refresh tokens -----------------
  {
    provider: "microsoft",
    code: "AADSTS700082",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Refresh token expired due to inactivity",
    reason:
      "The authorization server expired the refresh token due to inactivity. It can no longer mint access tokens.",
    remediation: "Interactive re-consent required (offline_access).",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },
  {
    provider: "microsoft",
    code: "AADSTS50173",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Token issued before a credential change",
    reason:
      "The user's password was changed or sessions were revoked after this refresh token was issued, invalidating it.",
    remediation: "Interactive re-consent required.",
    source: "https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50173-grant-expired-revoked",
  },
  {
    provider: "microsoft",
    code: "AADSTS700084",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "SPA refresh token reached its fixed lifetime",
    reason:
      "A refresh token issued to a single-page application reached its fixed 24-hour lifetime.",
    remediation: "Interactive re-consent required.",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },
  {
    provider: "microsoft",
    code: "AADSTS50078",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Strong-auth / MFA re-challenge required",
    reason:
      "A conditional-access policy now requires fresh multi-factor authentication that a refresh token cannot satisfy.",
    remediation: "Interactive re-consent with MFA.",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },
  {
    provider: "microsoft",
    code: "AADSTS50076",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "MFA required by conditional access",
    reason:
      "Conditional access requires multi-factor authentication for this resource; silent refresh is not permitted.",
    remediation: "Interactive re-consent with MFA.",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },
  {
    provider: "microsoft",
    code: "AADSTS65001",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Consent has not been granted",
    reason:
      "The user or tenant administrator has not granted consent for the requested application scopes.",
    remediation: "Run an interactive authorization flow or request admin consent.",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },

  // --- Microsoft: refreshable (do NOT bother a human) ---------------------
  {
    provider: "microsoft",
    code: "InvalidAuthenticationToken",
    oauthError: "invalid_token",
    verdict: "refreshable",
    title: "Access token expired",
    reason:
      "The short-lived access token lapsed (CompactToken lifetime). The refresh token is still valid.",
    remediation: "Silent refresh — no human needed.",
    source: "https://learn.microsoft.com/en-us/graph/resolve-auth-errors",
  },
  {
    provider: "microsoft",
    code: "AADSTS70043",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Refresh token expired by sign-in frequency policy",
    reason:
      "A Conditional Access sign-in frequency check expired or invalidated the refresh token.",
    remediation: "Run a new interactive authorization request.",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },

  // --- Microsoft: transient -----------------------------------------------
  {
    provider: "microsoft",
    code: "AADSTS90033",
    oauthError: "temporarily_unavailable",
    verdict: "transient",
    title: "Service temporarily unavailable",
    reason: "A transient STS error. Retrying with backoff usually succeeds.",
    remediation: "Exponential backoff, then retry.",
    source: "https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes",
  },
  {
    provider: "microsoft",
    code: "TooManyRequests",
    oauthError: "throttled",
    verdict: "transient",
    title: "Graph throttling (429)",
    reason: "Per-app request quota exceeded; respect Retry-After.",
    remediation: "Honor Retry-After and retry.",
    source: "https://learn.microsoft.com/en-us/graph/throttling",
  },

  // --- Google Workspace ----------------------------------------------------
  {
    provider: "google",
    code: "token_expired_or_revoked",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Token has been expired or revoked",
    reason:
      "Google reports the refresh token as expired or revoked (user removed access, 6-month inactivity, or password reset).",
    remediation: "Interactive re-consent required.",
    source: "https://developers.google.com/identity/protocols/oauth2",
  },
  {
    provider: "google",
    code: "admin_policy_enforced",
    oauthError: "invalid_grant",
    verdict: "dead",
    title: "Refresh blocked by Workspace admin policy",
    reason:
      "A Workspace admin policy now blocks this client/scope, invalidating the grant.",
    remediation: "Admin re-grant or interactive re-consent.",
    source: "https://developers.google.com/identity/protocols/oauth2",
  },
];

const BY_CODE = new Map(
  CODE_TABLE.map((e) => [`${e.provider}:${e.code.toLowerCase()}`, e]),
);

export function lookupCode(
  provider: Provider,
  code: string,
): CodeEntry | undefined {
  return BY_CODE.get(`${provider}:${code.toLowerCase()}`);
}
