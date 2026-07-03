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

  const approve = useCallback(async () => {
    const ticket = state.revive?.ticket;
    if (!ticket || ticket.status !== "open") return;
    const response = await fetch(`/api/reconsent/${ticket.id}`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.reason || "Recovery approval failed");
    }
  }, [state.revive?.ticket]);

  return { state, start, reset, approve };
}
