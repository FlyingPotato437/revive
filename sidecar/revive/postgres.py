"""Postgres implementation of the checkpoint contract used by Engine.

Apply db/migrations/0001_control_plane.sql before constructing this store.
The psycopg dependency is optional so the local SQLite package stays lightweight.
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from .checkpoint import Checkpoint

try:
    import psycopg  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    psycopg = None


class PostgresCheckpointStore:
    def __init__(self, dsn: str):
        if psycopg is None:
            raise RuntimeError("psycopg is not installed: pip install 'revive-sidecar[postgres]'")
        self._conn = psycopg.connect(dsn)

    def save(self, cp: Checkpoint) -> None:
        with self._conn.transaction():
            self._conn.execute(
                """INSERT INTO revive_checkpoints
                   (run_id, step_index, step_id, cursor, token_fingerprint, scopes, status, taken_at)
                   VALUES (%s,%s,%s,%s::jsonb,%s,%s::jsonb,%s,%s)
                   ON CONFLICT(run_id) DO UPDATE SET
                     step_index=excluded.step_index, step_id=excluded.step_id,
                     cursor=excluded.cursor, token_fingerprint=excluded.token_fingerprint,
                     scopes=excluded.scopes, status=excluded.status, taken_at=excluded.taken_at""",
                (cp.run_id, cp.step_index, cp.step_id, json.dumps(cp.cursor),
                 cp.token_fingerprint, json.dumps(cp.scopes), cp.status, cp.taken_at),
            )

    def load(self, run_id: str) -> Optional[Checkpoint]:
        row = self._conn.execute(
            "SELECT run_id, step_index, step_id, cursor, token_fingerprint, scopes, status, taken_at "
            "FROM revive_checkpoints WHERE run_id=%s", (run_id,)
        ).fetchone()
        if not row:
            return None
        return Checkpoint(
            run_id=row[0], step_index=row[1], step_id=row[2], cursor=row[3],
            token_fingerprint=row[4], scopes=row[5], status=row[6], taken_at=row[7],
        )

    def set_status(self, run_id: str, status: str) -> None:
        with self._conn.transaction():
            self._conn.execute("UPDATE revive_checkpoints SET status=%s WHERE run_id=%s", (status, run_id))

    def save_rendezvous(self, data: dict[str, Any]) -> None:
        with self._conn.transaction():
            self._conn.execute(
                """INSERT INTO revive_rendezvous
                   (id, run_id, kind, prompt, url, context, status, reply, created_at, expires_at)
                   VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s::jsonb,%s,%s)
                   ON CONFLICT(run_id) DO UPDATE SET
                     id=excluded.id, kind=excluded.kind, prompt=excluded.prompt,
                     url=excluded.url, context=excluded.context, status=excluded.status,
                     reply=excluded.reply, created_at=excluded.created_at, expires_at=excluded.expires_at""",
                (data["id"], data["run_id"], data["kind"], data["prompt"], data["url"],
                 json.dumps(data.get("context", {})), data.get("status", "open"),
                 json.dumps(data.get("reply")), data["created_at"], data["expires_at"]),
            )

    def load_rendezvous(self, run_id: str) -> Optional[dict[str, Any]]:
        row = self._conn.execute(
            "SELECT id, run_id, kind, prompt, url, context, status, reply, created_at, expires_at "
            "FROM revive_rendezvous WHERE run_id=%s", (run_id,)
        ).fetchone()
        if not row:
            return None
        return {"id": row[0], "run_id": row[1], "kind": row[2], "prompt": row[3],
                "url": row[4], "context": row[5], "status": row[6], "reply": row[7],
                "created_at": row[8], "expires_at": row[9]}

    def consume_rendezvous(self, run_id: str, reply: dict[str, Any]) -> bool:
        with self._conn.transaction():
            row = self._conn.execute(
                "UPDATE revive_rendezvous SET status='answered', reply=%s::jsonb "
                "WHERE run_id=%s AND status='open' AND expires_at>%s RETURNING id",
                (json.dumps(reply), run_id, time.time()),
            ).fetchone()
        return row is not None

    def action_state(self, action_id: str) -> Optional[str]:
        row = self._conn.execute(
            "SELECT state FROM revive_action_attempts WHERE action_id=%s", (action_id,)
        ).fetchone()
        return row[0] if row else None

    def start_action(self, action_id: str, run_id: str, step_id: str) -> None:
        with self._conn.transaction():
            self._conn.execute(
                """INSERT INTO revive_action_attempts
                   (action_id, run_id, step_id, state, attempts, updated_at)
                   VALUES (%s,%s,%s,'started',1,%s)
                   ON CONFLICT(action_id) DO UPDATE SET
                     attempts=revive_action_attempts.attempts+1, updated_at=excluded.updated_at""",
                (action_id, run_id, step_id, time.time()),
            )

    def complete_action(self, action_id: str) -> None:
        with self._conn.transaction():
            self._conn.execute(
                "UPDATE revive_action_attempts SET state='completed', updated_at=%s WHERE action_id=%s",
                (time.time(), action_id),
            )

    def reset_action(self, action_id: str) -> None:
        with self._conn.transaction():
            self._conn.execute("DELETE FROM revive_action_attempts WHERE action_id=%s", (action_id,))

    def ensure_lease(self, lease_id: str, generation: int) -> None:
        with self._conn.transaction():
            self._conn.execute(
                """INSERT INTO revive_credential_leases (lease_id, generation, updated_at)
                   VALUES (%s,%s,now()) ON CONFLICT(lease_id) DO NOTHING""",
                (lease_id, generation),
            )

    def assert_lease_generation(self, lease_id: str, generation: int) -> None:
        row = self._conn.execute(
            "SELECT generation FROM revive_credential_leases WHERE lease_id=%s", (lease_id,)
        ).fetchone()
        if row is None or int(row[0]) != generation:
            current = int(row[0]) if row else None
            raise ValueError(
                f"stale credential generation for {lease_id}: got {generation}, current {current}"
            )

    def rotate_lease(self, lease_id: str, expected_generation: int) -> int:
        next_generation = expected_generation + 1
        with self._conn.transaction():
            row = self._conn.execute(
                """UPDATE revive_credential_leases
                   SET generation=%s, updated_at=now()
                   WHERE lease_id=%s AND generation=%s
                   RETURNING generation""",
                (next_generation, lease_id, expected_generation),
            ).fetchone()
        if row is None:
            self.assert_lease_generation(lease_id, expected_generation)
            raise ValueError(f"could not rotate credential lease {lease_id}")
        return int(row[0])

    def close(self) -> None:
        self._conn.close()
