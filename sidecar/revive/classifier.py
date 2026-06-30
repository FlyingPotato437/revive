"""Sourced provider errors translated into recovery policy decisions."""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Verdict(str, Enum):
    REFRESHABLE = "refreshable"  # access token expired, refresh token alive
    DEAD = "dead"                # refresh token dead -> out-of-band re-consent
    TRANSIENT = "transient"      # throttling / 5xx -> retry with backoff
    UNKNOWN = "unknown"          # unrecognized -> fail safe (treat as dead)


@dataclass(frozen=True)
class CodeEntry:
    provider: str
    code: str
    oauth_error: str
    verdict: Verdict
    title: str
    reason: str
    remediation: str


# --- the recovery corpus --------------------------------------------------
# Real provider sub-codes. Grows over time; each row is independently testable.
CORPUS: list[CodeEntry] = [
    # Microsoft Entra / Graph — truly-dead refresh tokens
    CodeEntry("microsoft", "AADSTS700082", "invalid_grant", Verdict.DEAD,
              "Refresh token expired due to inactivity",
              "The authorization server expired the refresh token due to inactivity.",
              "Interactive re-consent (offline_access)."),
    CodeEntry("microsoft", "AADSTS50173", "invalid_grant", Verdict.DEAD,
              "Token issued before a credential change",
              "Password changed or sessions revoked after issuance.",
              "Interactive re-consent."),
    CodeEntry("microsoft", "AADSTS700084", "invalid_grant", Verdict.DEAD,
              "SPA refresh token reached its fixed lifetime",
              "A refresh token issued to a SPA reached its fixed 24-hour lifetime.",
              "Interactive re-consent."),
    CodeEntry("microsoft", "AADSTS50078", "invalid_grant", Verdict.DEAD,
              "Strong-auth / MFA re-challenge required",
              "Conditional access requires fresh MFA a refresh token can't satisfy.",
              "Interactive re-consent with MFA."),
    CodeEntry("microsoft", "AADSTS65001", "invalid_grant", Verdict.DEAD,
              "Consent has not been granted",
              "The user or tenant administrator has not granted the requested scopes.",
              "Run interactive authorization or request admin consent."),
    # Microsoft — refreshable (do NOT bother a human)
    CodeEntry("microsoft", "InvalidAuthenticationToken", "invalid_token", Verdict.REFRESHABLE,
              "Access token expired",
              "Short-lived access token lapsed; refresh token still valid.",
              "Silent refresh."),
    CodeEntry("microsoft", "AADSTS70043", "invalid_grant", Verdict.DEAD,
              "Refresh token expired by sign-in frequency policy",
              "Conditional Access expired or invalidated the refresh token.",
              "Run a new interactive authorization request."),
    # Microsoft — transient
    CodeEntry("microsoft", "AADSTS90033", "temporarily_unavailable", Verdict.TRANSIENT,
              "Service temporarily unavailable", "Transient STS error.",
              "Exponential backoff."),
    # Google Workspace
    CodeEntry("google", "token_expired_or_revoked", "invalid_grant", Verdict.DEAD,
              "Token has been expired or revoked",
              "Refresh token expired/revoked (removed access, inactivity, password reset).",
              "Interactive re-consent."),
    CodeEntry("google", "admin_policy_enforced", "invalid_grant", Verdict.DEAD,
              "Refresh blocked by Workspace admin policy",
              "A Workspace admin policy now blocks this client/scope.",
              "Admin re-grant or interactive re-consent."),
    # Slack
    CodeEntry("slack", "token_revoked", "invalid_grant", Verdict.DEAD,
              "Token revoked", "The Slack token was explicitly revoked.",
              "Re-install / re-consent."),
    CodeEntry("slack", "token_expired", "invalid_token", Verdict.REFRESHABLE,
              "Slack access token expired", "Rotating token lapsed; refresh works.",
              "Silent refresh."),
]

_BY_CODE = {(e.provider, e.code.lower()): e for e in CORPUS}
_AADSTS_RE = re.compile(r"AADSTS\d{4,6}")


@dataclass(frozen=True)
class ClassifierResult:
    verdict: Verdict
    provider: str
    oauth_error: str
    code: str
    title: str
    reason: str
    remediation: str
    needs_human: bool
    confidence: float

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict.value, "provider": self.provider,
            "oauth_error": self.oauth_error, "code": self.code, "title": self.title,
            "reason": self.reason, "remediation": self.remediation,
            "needs_human": self.needs_human, "confidence": self.confidence,
        }


def _result(entry: CodeEntry, confidence: float) -> ClassifierResult:
    return ClassifierResult(
        verdict=entry.verdict, provider=entry.provider, oauth_error=entry.oauth_error,
        code=entry.code, title=entry.title, reason=entry.reason,
        remediation=entry.remediation,
        needs_human=entry.verdict in (Verdict.DEAD, Verdict.UNKNOWN),
        confidence=confidence,
    )


def classify(payload: dict) -> ClassifierResult:
    """Classify a raw provider error payload.

    Accepts the real shapes:
      - OAuth2 token endpoint: {error, error_description, error_codes:[...]}
      - Graph resource 401:    {graph_error:{code,message}} / {error:{code}}
      - Google invalid_grant:  {error:"invalid_grant", error_description:"..."}
    """
    provider = payload.get("provider", "microsoft")

    # 1) Graph resource-level 401 (access token expired)
    graph_err = payload.get("graph_error") or (
        payload.get("error") if isinstance(payload.get("error"), dict) else None
    )
    if isinstance(graph_err, dict) and graph_err.get("code"):
        entry = _BY_CODE.get((provider, graph_err["code"].lower()))
        if entry:
            return _result(entry, 0.97)

    # 2) Microsoft STS: mine AADSTS codes from error_codes[] and description
    codes: list[str] = []
    for c in payload.get("error_codes", []) or []:
        codes.append(f"AADSTS{c}")
    desc = payload.get("error_description", "") or ""
    codes += _AADSTS_RE.findall(desc)
    for code in codes:
        entry = _BY_CODE.get((provider, code.lower()))
        if entry:
            return _result(entry, 0.98)

    err = payload.get("error") if isinstance(payload.get("error"), str) else None

    # 3) Google / Slack invalid_grant with a descriptive reason
    if err == "invalid_grant" and provider in ("google", "slack"):
        d = desc.lower()
        if "expired" in d or "revoked" in d:
            key = "token_expired_or_revoked" if provider == "google" else "token_revoked"
            entry = _BY_CODE.get((provider, key))
            if entry:
                return _result(entry, 0.95)
        if "admin" in d or "policy" in d:
            entry = _BY_CODE.get((provider, "admin_policy_enforced"))
            if entry:
                return _result(entry, 0.9)

    # 4) transient signals
    status = payload.get("status")
    if status == 429 or err == "throttled":
        return ClassifierResult(Verdict.TRANSIENT, provider, err or "throttled",
                                str(status or 429), "Rate limited",
                                "The provider throttled this request.",
                                "Honor Retry-After.", False, 0.8)
    if isinstance(status, int) and status >= 500:
        return ClassifierResult(Verdict.TRANSIENT, provider, err or "server_error",
                                str(status), "Upstream server error",
                                "Transient 5xx.", "Backoff and retry.", False, 0.75)

    # 5) invalid_grant we couldn't pin -> fail safe to DEAD
    if err == "invalid_grant":
        return ClassifierResult(Verdict.DEAD, provider, "invalid_grant", "invalid_grant",
                                "Refresh token rejected",
                                "invalid_grant with no recoverable sub-code.",
                                "Interactive re-consent.", True, 0.6)

    # 6) genuinely unknown -> fail safe, capture for the corpus
    return ClassifierResult(Verdict.UNKNOWN, provider, err or "unknown",
                            (graph_err or {}).get("code", "unknown") if isinstance(graph_err, dict) else "unknown",
                            "Unrecognized auth error",
                            "Not in the corpus yet; failing safe.",
                            "Escalate to re-consent; capture for the corpus.", True, 0.4)
