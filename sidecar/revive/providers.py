"""OAuth provider interface — performs REAL token refresh over HTTP.

The provider calls a real token endpoint (grant_type=refresh_token). On failure
it surfaces the raw, provider-shaped error payload, which the classifier reads.
This is what makes Revive's recovery real rather than simulated: a genuine HTTP
round-trip to an identity platform (or a local mock IdP that forges the exact
error payloads).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


class TokenError(Exception):
    """Raised when a token endpoint rejects a refresh. Carries the raw payload."""

    def __init__(self, payload: dict, status: int):
        self.payload = payload
        self.status = status
        super().__init__(payload.get("error_description") or payload.get("error") or "token error")


class AuthError(Exception):
    """Raised when a protected resource rejects the access token (401)."""

    def __init__(self, payload: dict):
        self.payload = payload
        super().__init__("resource rejected access token")


@dataclass
class Token:
    access_token: str
    refresh_token: str
    expires_in: int = 3600

    @property
    def fingerprint(self) -> str:
        # short stable fingerprint; never log the raw secret
        h = 2166136261
        for ch in self.access_token:
            h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
        return "tok_" + format(h, "08x")


@dataclass
class Provider:
    name: str           # "microsoft" | "google" | "slack"
    token_url: str      # the real /oauth2/token endpoint
    client_id: str = "revive-sidecar"
    scopes: tuple[str, ...] = ()

    def refresh(self, refresh_token: str) -> Token:
        """Exchange a refresh token for a fresh access token. Raises TokenError."""
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "scope": " ".join(self.scopes),
        }).encode()
        req = urllib.request.Request(self.token_url, data=data, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode())
                return Token(
                    access_token=body["access_token"],
                    refresh_token=body.get("refresh_token", refresh_token),
                    expires_in=body.get("expires_in", 3600),
                )
        except urllib.error.HTTPError as e:
            raw = e.read().decode() or "{}"
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"error": "http_error", "error_description": raw}
            payload.setdefault("provider", self.name)
            payload.setdefault("status", e.code)
            raise TokenError(payload, e.code) from None
