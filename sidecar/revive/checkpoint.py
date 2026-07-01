"""Durable, step-accurate checkpoints — real SQLite persistence.

A checkpoint is captured the instant a run parks (dead token, or any rendezvous).
Because it is durable, the run survives a process restart: a worker can pick the
run back up and resume it from the exact step after the human responds.
"""
from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Optional


@dataclass
class Checkpoint:
    run_id: str
    step_index: int
    step_id: str
    cursor: dict[str, Any]
    token_fingerprint: str
    scopes: list[str]
    status: str = "parked"          # parked | running | done | dead
    taken_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


class CheckpointStore:
    def __init__(self, path: str = "revive.db"):
        self.path = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS checkpoints (
                run_id TEXT PRIMARY KEY,
                step_index INTEGER, step_id TEXT, cursor TEXT,
                token_fingerprint TEXT, scopes TEXT, status TEXT, taken_at REAL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS rendezvous (
                id TEXT PRIMARY KEY, run_id TEXT UNIQUE, kind TEXT, prompt TEXT,
                url TEXT, context TEXT, status TEXT, reply TEXT,
                created_at REAL, expires_at REAL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS action_attempts (
                action_id TEXT PRIMARY KEY, run_id TEXT, step_id TEXT,
                state TEXT, attempts INTEGER, updated_at REAL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS credential_leases (
                lease_id TEXT PRIMARY KEY, generation INTEGER NOT NULL,
                updated_at REAL NOT NULL
            )"""
        )
        self._conn.commit()

    def save(self, cp: Checkpoint) -> None:
        self._conn.execute(
            """INSERT INTO checkpoints
               (run_id, step_index, step_id, cursor, token_fingerprint, scopes, status, taken_at)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(run_id) DO UPDATE SET
                 step_index=excluded.step_index, step_id=excluded.step_id,
                 cursor=excluded.cursor, token_fingerprint=excluded.token_fingerprint,
                 scopes=excluded.scopes, status=excluded.status, taken_at=excluded.taken_at""",
            (cp.run_id, cp.step_index, cp.step_id, json.dumps(cp.cursor),
             cp.token_fingerprint, json.dumps(cp.scopes), cp.status, cp.taken_at),
        )
        self._conn.commit()

    def load(self, run_id: str) -> Optional[Checkpoint]:
        row = self._conn.execute(
            "SELECT run_id, step_index, step_id, cursor, token_fingerprint, scopes, status, taken_at "
            "FROM checkpoints WHERE run_id=?", (run_id,)
        ).fetchone()
        if not row:
            return None
        return Checkpoint(
            run_id=row[0], step_index=row[1], step_id=row[2], cursor=json.loads(row[3]),
            token_fingerprint=row[4], scopes=json.loads(row[5]), status=row[6], taken_at=row[7],
        )

    def set_status(self, run_id: str, status: str) -> None:
        self._conn.execute("UPDATE checkpoints SET status=? WHERE run_id=?", (status, run_id))
        self._conn.commit()

    def save_rendezvous(self, data: dict[str, Any]) -> None:
        self._conn.execute(
            """INSERT INTO rendezvous
               (id, run_id, kind, prompt, url, context, status, reply, created_at, expires_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(run_id) DO UPDATE SET
                 id=excluded.id, kind=excluded.kind, prompt=excluded.prompt,
                 url=excluded.url, context=excluded.context, status=excluded.status,
                 reply=excluded.reply, created_at=excluded.created_at,
                 expires_at=excluded.expires_at""",
            (data["id"], data["run_id"], data["kind"], data["prompt"], data["url"],
             json.dumps(data.get("context", {})), data.get("status", "open"),
             json.dumps(data.get("reply")), data["created_at"], data["expires_at"]),
        )
        self._conn.commit()

    def load_rendezvous(self, run_id: str) -> Optional[dict[str, Any]]:
        row = self._conn.execute(
            "SELECT id, run_id, kind, prompt, url, context, status, reply, created_at, expires_at "
            "FROM rendezvous WHERE run_id=?", (run_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0], "run_id": row[1], "kind": row[2], "prompt": row[3],
            "url": row[4], "context": json.loads(row[5]), "status": row[6],
            "reply": json.loads(row[7]) if row[7] else None,
            "created_at": row[8], "expires_at": row[9],
        }

    def consume_rendezvous(self, run_id: str, reply: dict[str, Any]) -> bool:
        """Atomically consume one open, unexpired rendezvous."""
        now = time.time()
        cur = self._conn.execute(
            "UPDATE rendezvous SET status='answered', reply=? "
            "WHERE run_id=? AND status='open' AND expires_at>?",
            (json.dumps(reply), run_id, now),
        )
        self._conn.commit()
        return cur.rowcount == 1

    def action_state(self, action_id: str) -> Optional[str]:
        row = self._conn.execute(
            "SELECT state FROM action_attempts WHERE action_id=?", (action_id,)
        ).fetchone()
        return row[0] if row else None

    def start_action(self, action_id: str, run_id: str, step_id: str) -> None:
        now = time.time()
        self._conn.execute(
            """INSERT INTO action_attempts
               (action_id, run_id, step_id, state, attempts, updated_at)
               VALUES (?,?,?,'started',1,?)
               ON CONFLICT(action_id) DO UPDATE SET
                 attempts=action_attempts.attempts+1, updated_at=excluded.updated_at""",
            (action_id, run_id, step_id, now),
        )
        self._conn.commit()

    def complete_action(self, action_id: str) -> None:
        self._conn.execute(
            "UPDATE action_attempts SET state='completed', updated_at=? WHERE action_id=?",
            (time.time(), action_id),
        )
        self._conn.commit()

    def reset_action(self, action_id: str) -> None:
        # A provider 401 proves the protected side effect was not accepted.
        self._conn.execute("DELETE FROM action_attempts WHERE action_id=?", (action_id,))
        self._conn.commit()

    def ensure_lease(self, lease_id: str, generation: int) -> None:
        """Create a lease once without allowing an old worker to lower it."""
        self._conn.execute(
            """INSERT INTO credential_leases (lease_id, generation, updated_at)
               VALUES (?,?,?) ON CONFLICT(lease_id) DO NOTHING""",
            (lease_id, generation, time.time()),
        )
        self._conn.commit()

    def assert_lease_generation(self, lease_id: str, generation: int) -> None:
        row = self._conn.execute(
            "SELECT generation FROM credential_leases WHERE lease_id=?", (lease_id,)
        ).fetchone()
        if row is None or int(row[0]) != generation:
            current = int(row[0]) if row else None
            raise ValueError(
                f"stale credential generation for {lease_id}: got {generation}, current {current}"
            )

    def rotate_lease(self, lease_id: str, expected_generation: int) -> int:
        """Atomically fence the prior generation and return the new one."""
        next_generation = expected_generation + 1
        cur = self._conn.execute(
            """UPDATE credential_leases
               SET generation=?, updated_at=?
               WHERE lease_id=? AND generation=?""",
            (next_generation, time.time(), lease_id, expected_generation),
        )
        self._conn.commit()
        if cur.rowcount != 1:
            self.assert_lease_generation(lease_id, expected_generation)
            raise ValueError(f"could not rotate credential lease {lease_id}")
        return next_generation

    def close(self) -> None:
        self._conn.close()
