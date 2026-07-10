"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviveEvent, RunState, SessionState } from "./types";

export interface LogLine {
  id: string;
  lane: "baseline" | "revive";
  level: "info" | "warn" | "error" | "good";
  tag: string;
  message: string;
  at: number;
}

export interface ClientState {
  sessionId: string | null;
  session: SessionState | null;
  baseline: RunState | null;
  revive: RunState | null;
  logs: LogLine[];
  done: boolean;
  starting: boolean;
}

const EMPTY: ClientState = {
  sessionId: null,
  session: null,
  baseline: null,
  revive: null,
  logs: [],
  done: false,
  starting: false,
};

export function useReviveClient() {
  const [state, setState] = useState<ClientState>(EMPTY);
  const esRef = useRef<EventSource | null>(null);
  const logSeq = useRef(0);
  const lastSnapshot = useRef<string | null>(null);

  const teardown = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const connect = useCallback((sessionId: string) => {
    teardown();
    const es = new EventSource(`/api/sessions/${sessionId}/events`);
    esRef.current = es;
    es.onmessage = (ev) => {
      let e: ReviveEvent;
      try {
        e = JSON.parse(ev.data);
      } catch {
        return;
      }
      setState((prev) => {
        switch (e.type) {
          case "snapshot":
            return {
              ...prev,
              session: e.session,
              baseline: e.session.baseline,
              revive: e.session.revive,
            };
          case "run":
            return e.lane === "baseline"
              ? { ...prev, baseline: e.run }
              : { ...prev, revive: e.run };
          case "log": {
            logSeq.current += 1;
            const line: LogLine = {
              id: `${e.at}-${logSeq.current}`,
              lane: e.lane,
              level: e.level,
              tag: e.tag,
              message: e.message,
              at: e.at,
            };
            const logs = [...prev.logs, line];
            if (logs.length > 300) logs.shift();
            return { ...prev, logs };
          }
          case "done":
            return { ...prev, done: true };
          default:
            return prev;
        }
      });
    };
    es.onerror = () => {
      /* EventSource auto-reconnects; ignore transient errors */
    };
  }, [teardown]);

  const start = useCallback(
    async (failureStep: number, deathCode: string) => {
      teardown();
      logSeq.current = 0;
      lastSnapshot.current = null;
      setState({ ...EMPTY, starting: true });
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ failureStep, deathCode }),
      });
      const data = await res.json();
      try {
        sessionStorage.setItem("revive_sid", data.sessionId);
      } catch {
        /* ignore */
      }
      setState((prev) => ({ ...prev, sessionId: data.sessionId, starting: false }));
      connect(data.sessionId);
    },
    [connect, teardown],
  );

  const reset = useCallback(() => {
    teardown();
    logSeq.current = 0;
    lastSnapshot.current = null;
    try {
      sessionStorage.removeItem("revive_sid");
    } catch {
      /* ignore */
    }
    setState(EMPTY);
  }, [teardown]);

  // Reconnect to an in-flight session after a page reload. The SSE buffer
  // replays every event, rebuilding the full UI state (refresh-safe).
  useEffect(() => {
    let sid: string | null = null;
    try {
      sid = sessionStorage.getItem("revive_sid");
    } catch {
      /* ignore */
    }
    if (sid) {
      setState((prev) => ({ ...prev, sessionId: sid }));
      connect(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull the authoritative session snapshot over plain HTTP. SSE cannot be
  // relied on across serverless instances, so this is both the post-approve
  // refresh and a periodic fallback that keeps the UI in sync.
  const refresh = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { session?: SessionState };
      if (!body.session) return;
      const terminal = (s: string) => s === "completed" || s === "dead";
      // Skip the state write when nothing changed: the 3s fallback poll would
      // otherwise re-render (and re-animate) the whole lab with identical data.
      const fingerprint = JSON.stringify(body.session);
      if (fingerprint === lastSnapshot.current) return;
      lastSnapshot.current = fingerprint;
      setState((prev) => ({
        ...prev,
        session: body.session!,
        baseline: body.session!.baseline,
        revive: body.session!.revive,
        done: terminal(body.session!.baseline.status) && terminal(body.session!.revive.status),
      }));
    } catch {
      /* transient; the next poll retries */
    }
  }, []);

  const approve = useCallback(async () => {
    const ticket = state.revive?.ticket;
    const sessionId = state.sessionId;
    if (!ticket || ticket.status !== "open") return;
    const response = await fetch(`/api/reconsent/${ticket.id}`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.reason || "Recovery approval failed");
    }
    // The POST returns only after the resume completes and is persisted, so a
    // single refresh reflects the recovered run even when SSE is unavailable.
    if (sessionId) await refresh(sessionId);
  }, [state.revive?.ticket, state.sessionId, refresh]);

  // Polling fallback: while a session is active but not finished, reconcile
  // state over HTTP every few seconds in case SSE events never arrive.
  useEffect(() => {
    const sessionId = state.sessionId;
    if (!sessionId || state.done) return;
    const timer = setInterval(() => { void refresh(sessionId); }, 3000);
    return () => clearInterval(timer);
  }, [state.sessionId, state.done, refresh]);

  return { state, start, reset, approve };
}
