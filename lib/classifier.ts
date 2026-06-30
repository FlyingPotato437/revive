// ---------------------------------------------------------------------------
// Token-death classifier.
//
// Given a raw provider error payload (the actual shape Microsoft/Google return),
// decide whether this is a recoverable access-token lapse (silent refresh) or a
// truly-dead refresh token that needs out-of-band human re-consent.
// ---------------------------------------------------------------------------

import { lookupCode } from "./graph-codes";
import type { ClassifierResult, Provider } from "./types";

/** Raw shapes we accept. Microsoft STS uses {error, error_description, error_codes:[...]}. */
export interface RawAuthError {
  provider: Provider;
  // OAuth2 token endpoint shape
  error?: string;
  error_description?: string;
  error_codes?: number[];
  // Graph resource shape: { error: { code, message } }
  graphError?: { code: string; message: string };
  status?: number;
  retryAfter?: number;
}

// Pull the first AADSTSxxxxx token out of a description string.
const AADSTS_RE = /AADSTS\d{4,6}/g;

export function classify(raw: RawAuthError): ClassifierResult {
  const provider = raw.provider;

  // 1) Resource-level 401 from Graph (access token simply expired).
  if (raw.graphError?.code) {
    const entry = lookupCode(provider, raw.graphError.code);
    if (entry) return toResult(entry, 0.97);
  }

  // 2) Microsoft STS: mine AADSTS codes from error_codes[] and the description.
  const codes: string[] = [];
  if (raw.error_codes) codes.push(...raw.error_codes.map((c) => `AADSTS${c}`));
  if (raw.error_description) {
    const m = raw.error_description.match(AADSTS_RE);
    if (m) codes.push(...m);
  }
  for (const code of codes) {
    const entry = lookupCode(provider, code);
    if (entry) return toResult(entry, 0.98);
  }

  // 3) Google: invalid_grant with a descriptive reason.
  if (provider === "google" && raw.error === "invalid_grant") {
    const desc = (raw.error_description || "").toLowerCase();
    if (desc.includes("expired") || desc.includes("revoked")) {
      const entry = lookupCode("google", "token_expired_or_revoked")!;
      return toResult(entry, 0.95);
    }
    if (desc.includes("admin") || desc.includes("policy")) {
      const entry = lookupCode("google", "admin_policy_enforced")!;
      return toResult(entry, 0.9);
    }
  }

  // 4) Transient signals.
  if (raw.status === 429 || raw.error === "throttled") {
    return {
      verdict: "transient",
      provider,
      oauthError: raw.error || "throttled",
      code: String(raw.status ?? 429),
      title: "Rate limited",
      reason: "The provider throttled this request.",
      remediation: "Honor Retry-After and retry with backoff.",
      needsHuman: false,
      confidence: 0.8,
    };
  }
  if (raw.status && raw.status >= 500) {
    return {
      verdict: "transient",
      provider,
      oauthError: raw.error || "server_error",
      code: String(raw.status),
      title: "Upstream server error",
      reason: "A transient 5xx from the provider.",
      remediation: "Retry with exponential backoff.",
      needsHuman: false,
      confidence: 0.75,
    };
  }

  // 5) invalid_grant we couldn't pin to a code → fail safe: treat as dead.
  if (raw.error === "invalid_grant") {
    return {
      verdict: "dead",
      provider,
      oauthError: "invalid_grant",
      code: "invalid_grant",
      title: "Refresh token rejected",
      reason:
        "The provider rejected the refresh token with invalid_grant and no recoverable sub-code. Failing safe to re-consent.",
      remediation: "Interactive re-consent required.",
      needsHuman: true,
      confidence: 0.6,
    };
  }

  // 6) Genuinely unknown.
  return {
    verdict: "unknown",
    provider,
    oauthError: raw.error || "unknown",
    code: raw.graphError?.code || "unknown",
    title: "Unrecognized auth error",
    reason:
      "This error is not in the recovery corpus yet. Failing safe and escalating to a human.",
    remediation: "Escalate to re-consent and capture for the corpus.",
    needsHuman: true,
    confidence: 0.4,
  };
}

function toResult(
  entry: ReturnType<typeof lookupCode> & {},
  confidence: number,
): ClassifierResult {
  return {
    verdict: entry.verdict,
    provider: entry.provider,
    oauthError: entry.oauthError,
    code: entry.code,
    title: entry.title,
    reason: entry.reason,
    remediation: entry.remediation,
    needsHuman: entry.verdict === "dead" || entry.verdict === "unknown",
    confidence,
  };
}
