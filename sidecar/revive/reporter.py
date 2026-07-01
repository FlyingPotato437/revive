"""Console reporter — streams recovery-case lifecycle events to the hosted console.

Stdlib only. Fire-and-forget with a short timeout; a console outage must never
block or fail a recovery. Only lifecycle metadata leaves the process — never a
token, never step payloads.

    from revive import Engine, Reporter

    reporter = Reporter(api_key="rvk_…", base_url="https://console.revive.dev")
    engine = Engine(provider, store, reporter=reporter)

Events: opened · parked · reauthorized · resumed · recovered · abandoned.
"""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from typing import Optional


class Reporter:
    def __init__(self, api_key: str, base_url: str = "http://localhost:3000",
                 source: str = "revive-sidecar", timeout: float = 3.0,
                 asynchronous: bool = True):
        self.api_key = api_key
        self.endpoint = base_url.rstrip("/") + "/api/ingest"
        self.source = source
        self.timeout = timeout
        self.asynchronous = asynchronous
        self.last_error: Optional[str] = None

    # -- public -------------------------------------------------------------
    def emit(self, run_id: str, event: str, **fields) -> None:
        payload = {"run_id": run_id, "event": event, "source": self.source}
        for key, value in fields.items():
            if value is not None:
                payload[key] = value
        if self.asynchronous:
            threading.Thread(target=self._post, args=(payload,), daemon=True).start()
        else:
            self._post(payload)

    # -- internals ----------------------------------------------------------
    def _post(self, payload: dict) -> None:
        body = json.dumps(payload).encode()
        request = urllib.request.Request(
            self.endpoint, data=body, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.api_key}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                response.read()
            self.last_error = None
        except urllib.error.HTTPError as error:
            self.last_error = f"HTTP {error.code}"
        except Exception as error:  # noqa: BLE001 - reporting must never raise
            self.last_error = str(error)
