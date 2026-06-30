// ---------------------------------------------------------------------------
// Fully-offline mock of the Microsoft identity platform + Graph.
// No API keys, no network. It forges the exact payloads the real services
// return so the classifier is exercised against realistic shapes.
//
// This same module backs the real /api/graph HTTP route, so the "mock Graph
// endpoint" in the demo is genuinely an endpoint returning a forged
// invalid_grant — not a hardcoded UI string.
// ---------------------------------------------------------------------------

import type { RawAuthError } from "./classifier";
import type { Provider } from "./types";

let tokenSeq = 1000;

export function mintAccessToken(scopes: string[], generation: number): string {
  tokenSeq += 1;
  // a believable-looking opaque token fingerprint (never a real secret)
  const head = Buffer.from(`g${generation}.${scopes.join(" ")}`)
    .toString("base64url")
    .slice(0, 10);
  return `EwBwA8l6.${head}.${tokenSeq.toString(36)}${(tokenSeq * 7).toString(36)}`;
}

export function fingerprint(token: string): string {
  // a short, stable fingerprint of the token — what we log instead of secrets
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "tok_" + (h >>> 0).toString(16).padStart(8, "0");
}

export interface RefreshOk {
  ok: true;
  accessToken: string;
}
export interface RefreshErr {
  ok: false;
  status: number;
  error: RawAuthError;
}

/**
 * Simulate POST /oauth2/v2.0/token (grant_type=refresh_token).
 * If the refresh token is dead, forge the configured invalid_grant payload.
 */
export function tokenEndpoint(opts: {
  provider: Provider;
  refreshTokenDead: boolean;
  deathCode: string; // e.g. "AADSTS700082"
  scopes: string[];
  generation: number;
}): RefreshOk | RefreshErr {
  if (!opts.refreshTokenDead) {
    return { ok: true, accessToken: mintAccessToken(opts.scopes, opts.generation) };
  }

  if (opts.provider === "google") {
    return {
      ok: false,
      status: 400,
      error: {
        provider: "google",
        status: 400,
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      },
    };
  }

  const numeric = opts.deathCode.replace(/\D/g, "");
  return {
    ok: false,
    status: 400,
    error: {
      provider: "microsoft",
      status: 400,
      error: "invalid_grant",
      error_description:
        `${opts.deathCode}: The refresh token has expired due to inactivity. ` +
        `The token was issued on 2026-03-19 and was inactive for 90.00:00:00. ` +
        `Trace ID: 9f2c-${numeric} Correlation ID: 41ad-${numeric}.`,
      error_codes: [Number(numeric)],
    },
  };
}

/** Simulate a Graph resource call rejecting an expired ACCESS token (401). */
export function graphResourceUnauthorized(provider: Provider): RawAuthError {
  return {
    provider,
    status: 401,
    graphError: {
      code: "InvalidAuthenticationToken",
      message: "Access token has expired or is not yet valid.",
    },
  };
}
