"""A REAL local OAuth identity platform + protected resource, stdlib only.

This is not a stub that returns canned strings to the UI — it is an actual HTTP
server implementing:

  POST /oauth2/token   grant_type=refresh_token
       -> mints a short-lived access token, OR forges the exact provider error
          payload (AADSTS700082 invalid_grant) when the refresh token is dead.
  GET  /resource       -> 200 if the bearer access token is unexpired, else 401
                          with InvalidAuthenticationToken (forces a real refresh).
  POST /reconsent      -> simulates a human completing re-consent; marks the dead
                          refresh token recovered and mints a NEW refresh token.

The Revive engine talks to this over real HTTP, so the recovery is genuine.
"""
from __future__ import annotations

import json
import threading
import time
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


class IdP:
    """In-memory identity state for the mock provider."""

    def __init__(self):
        # refresh_token -> {"dead": bool, "scopes": [...]}
        self.refresh_tokens: dict[str, dict] = {}
        # access_token -> remaining uses (deterministic expiry by call count)
        self.access_tokens: dict[str, int] = {}
        self.seq = 1000

    def issue_refresh(self, scopes, dead=False) -> str:
        rt = "rt_" + secrets.token_hex(6)
        self.refresh_tokens[rt] = {"dead": dead, "scopes": scopes}
        return rt

    def kill_refresh(self, rt: str) -> None:
        if rt in self.refresh_tokens:
            self.refresh_tokens[rt]["dead"] = True

    def mint_access(self, uses: int) -> str:
        """Mint an access token good for `uses` protected calls, then it 401s."""
        self.seq += 1
        at = f"EwBwA8l6.{self.seq:x}.{secrets.token_hex(4)}"
        self.access_tokens[at] = uses
        return at


def make_server(idp: IdP, host="127.0.0.1", port=8750, refresh_uses=100):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silence default logging
            pass

        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode() if length else ""
            form = {k: v[0] for k, v in parse_qs(raw).items()}

            if path == "/oauth2/token":
                rt = form.get("refresh_token", "")
                rec = idp.refresh_tokens.get(rt)
                if rec is None:
                    return self._json(400, {"provider": "microsoft", "status": 400,
                                            "error": "invalid_grant",
                                            "error_description": "AADSTS70000: unknown refresh token"})
                if rec["dead"]:
                    # forge the exact dead-refresh-token payload Entra returns
                    return self._json(400, {
                        "provider": "microsoft", "status": 400, "error": "invalid_grant",
                        "error_description": ("AADSTS700082: The refresh token has expired due to "
                                              "inactivity. The token was issued on 2026-03-19 and "
                                              "was inactive for 90.00:00:00."),
                        "error_codes": [700082],
                    })
                at = idp.mint_access(refresh_uses)
                return self._json(200, {"token_type": "Bearer", "expires_in": 3600,
                                        "access_token": at, "refresh_token": rt,
                                        "scope": " ".join(rec["scopes"])})

            if path == "/reconsent":
                body = json.loads(raw) if raw.strip().startswith("{") else form
                old = body.get("refresh_token") or form.get("refresh_token")
                scopes = idp.refresh_tokens.get(old, {}).get("scopes", [])
                new_rt = idp.issue_refresh(scopes, dead=False)  # fresh, alive token
                return self._json(200, {"ok": True, "refresh_token": new_rt})

            return self._json(404, {"error": "not_found"})

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/resource":
                auth = self.headers.get("Authorization", "")
                at = auth[7:] if auth.startswith("Bearer ") else ""
                remaining = idp.access_tokens.get(at)
                if remaining is None or remaining <= 0:
                    return self._json(401, {"provider": "microsoft", "status": 401,
                                            "graph_error": {"code": "InvalidAuthenticationToken",
                                                            "message": "Access token has expired."}})
                idp.access_tokens[at] = remaining - 1
                return self._json(200, {"ok": True, "data": "protected payload"})
            return self._json(404, {"error": "not_found"})

    httpd = ThreadingHTTPServer((host, port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd
