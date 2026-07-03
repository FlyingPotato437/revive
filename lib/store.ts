// ---------------------------------------------------------------------------
// Local durable session registry + in-process pub/sub for SSE. This is the
// self-contained console store; production deployments should swap this module
// for Postgres/Redis without changing the engine contract.
// ---------------------------------------------------------------------------

import type { ReviveEvent, SessionState } from "./types";
import { hostedDatabaseEnabled, sqlClient } from "./hosted";
import fs from "node:fs";
import path from "node:path";

type Listener = (e: ReviveEvent) => void;

interface Store {
  sessions: Map<string, SessionState>;
  listeners: Map<string, Set<Listener>>;
  buffers: Map<string, ReviveEvent[]>; // replay buffer for late SSE subscribers
  tickets: Map<string, string>; // ticketId → sessionId
}

const g = globalThis as unknown as { __reviveStore?: Store };

const STATE_DIR = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const STATE_FILE = path.join(STATE_DIR, "console-state.json");

function loadStore(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as {
      sessions?: SessionState[];
      buffers?: [string, ReviveEvent[]][];
      tickets?: [string, string][];
    };
    return {
      sessions: new Map(parsed.sessions?.map((s) => [s.id, s]) ?? []),
      listeners: new Map(),
      buffers: new Map(parsed.buffers ?? []),
      tickets: new Map(parsed.tickets ?? []),
    };
  } catch {
    return { sessions: new Map(), listeners: new Map(), buffers: new Map(), tickets: new Map() };
  }
}

function persist() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
    const temp = `${STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(
      temp,
      JSON.stringify({
        sessions: [...store.sessions.values()],
        buffers: [...store.buffers.entries()],
        tickets: [...store.tickets.entries()],
      }),
      { mode: 0o600 },
    );
    fs.renameSync(temp, STATE_FILE);
  } catch (error) {
    console.error("Revive console state could not be persisted", error);
  }
}

export const store: Store =
  g.__reviveStore ??
  (g.__reviveStore = loadStore());

export function registerTicket(ticketId: string, sessionId: string) {
  store.tickets.set(ticketId, sessionId);
  persist();
  void persistTicketDurable(ticketId, sessionId);
}

export function sessionForTicket(ticketId: string): SessionState | undefined {
  const sid = store.tickets.get(ticketId);
  return sid ? store.sessions.get(sid) : undefined;
}

export function putSession(s: SessionState) {
  store.sessions.set(s.id, s);
  persist();
  void persistSessionDurable(s);
}

// --- durable console state (Postgres) --------------------------------------
// The in-memory store above lives in one process. On a serverless host
// (Vercel) each request may hit a different instance, so the sandbox session
// and its recovery ticket must also be readable from a shared store, or the
// reauthorization link opens on a lambda that never saw the ticket. These
// helpers write-through to Postgres and hydrate on demand; they are no-ops
// without DATABASE_URL, keeping local development purely in-memory.

async function persistSessionDurable(s: SessionState): Promise<void> {
  if (!hostedDatabaseEnabled()) return;
  try {
    const json = sqlClient().json(JSON.parse(JSON.stringify(s)));
    await sqlClient()`
      insert into revive_console_sessions (id, data, updated_at)
      values (${s.id}, ${json}, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
  } catch (error) {
    console.error("console session persist failed", error);
  }
}

async function persistTicketDurable(ticketId: string, sessionId: string): Promise<void> {
  if (!hostedDatabaseEnabled()) return;
  try {
    await sqlClient()`
      insert into revive_console_tickets (ticket_id, session_id, created_at)
      values (${ticketId}, ${sessionId}, now())
      on conflict (ticket_id) do update set session_id = excluded.session_id
    `;
  } catch (error) {
    console.error("console ticket persist failed", error);
  }
}

/** Load a session + its ticket from Postgres into the in-memory store so the
 *  synchronous readers (sessionForTicket/getSession) resolve on any instance.
 *  Returns the session when found. */
export async function hydrateSessionForTicket(ticketId: string): Promise<SessionState | undefined> {
  const local = sessionForTicket(ticketId);
  if (local) return local;
  if (!hostedDatabaseEnabled()) return undefined;
  try {
    const rows = await sqlClient()<{ session_id: string }[]>`
      select session_id from revive_console_tickets where ticket_id = ${ticketId}
    `;
    const sessionId = rows[0]?.session_id;
    if (!sessionId) return undefined;
    const sessionRows = await sqlClient()<{ data: SessionState }[]>`
      select data from revive_console_sessions where id = ${sessionId}
    `;
    const session = sessionRows[0]?.data;
    if (!session) return undefined;
    store.sessions.set(session.id, session);
    store.tickets.set(ticketId, sessionId);
    return session;
  } catch (error) {
    console.error("console session hydrate failed", error);
    return undefined;
  }
}

export function getSession(id: string): SessionState | undefined {
  return store.sessions.get(id);
}

export function listSessions(): SessionState[] {
  return [...store.sessions.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribe(sessionId: string, fn: Listener): () => void {
  let set = store.listeners.get(sessionId);
  if (!set) {
    set = new Set();
    store.listeners.set(sessionId, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

export function getBuffer(sessionId: string): ReviveEvent[] {
  return store.buffers.get(sessionId) ?? [];
}

export function emit(sessionId: string, e: ReviveEvent) {
  let buf = store.buffers.get(sessionId);
  if (!buf) {
    buf = [];
    store.buffers.set(sessionId, buf);
  }
  buf.push(e);
  if (buf.length > 400) buf.shift();

  // Engine state is mutated in place immediately before every emitted event.
  // Persisting here makes parked recovery cases survive a server restart.
  persist();

  const set = store.listeners.get(sessionId);
  if (set) for (const fn of set) fn(e);
}
