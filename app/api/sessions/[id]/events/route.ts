import { NextRequest } from "next/server";
import { getBuffer, getSession, subscribe } from "@/lib/store";
import type { ReviveEvent } from "@/lib/types";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = sessionFromCookies(req.cookies);
  if (!auth) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const session = getSession(id);
  const workspace = await selectedWorkspace(auth.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
  if (session?.workspaceId && session.workspaceId !== workspace.id) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: ReviveEvent | { type: "ping" }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* closed */
        }
      };

      if (!session) {
        send({ type: "done" });
        controller.close();
        return;
      }

      // Replay everything that happened before this subscriber joined.
      send({ type: "snapshot", session });
      for (const e of getBuffer(id)) {
        if (e.type !== "snapshot") send(e);
      }

      const unsub = subscribe(id, (e) => send(e));
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);

      const close = () => {
        clearInterval(keepAlive);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
