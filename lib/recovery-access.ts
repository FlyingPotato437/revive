import crypto from "node:crypto";
import { applicationSecret } from "./secrets";

const ACCESS_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 15 * 60;

export interface RecoveryAccessClaims {
  caseId: string;
  workspaceId: string;
  exp: number;
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", applicationSecret())
    .update(`${ACCESS_VERSION}.${payload}`)
    .digest("base64url");
}

export function createRecoveryAccessToken(
  caseId: string,
  workspaceId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const claims: RecoveryAccessClaims = {
    caseId,
    workspaceId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${ACCESS_VERSION}.${payload}.${sign(payload)}`;
}

export function createRecoveryAccessUrl(caseId: string, workspaceId: string): string {
  return `/reauthorize/${createRecoveryAccessToken(caseId, workspaceId)}`;
}

export function verifyRecoveryAccessToken(token: string): RecoveryAccessClaims | null {
  const [version, payload, supplied] = token.split(".");
  if (version !== ACCESS_VERSION || !payload || !supplied) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RecoveryAccessClaims;
    if (!/^case_[A-Za-z0-9_-]+$/.test(claims.caseId)) return null;
    if (!/^ws_[A-Za-z0-9_-]+$/.test(claims.workspaceId)) return null;
    if (!Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
