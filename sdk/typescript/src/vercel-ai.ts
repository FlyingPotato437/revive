// Vercel AI SDK adapter (adapter preview): wrap a tool map so every execute()
// is a protected action. Committed replays return the stored result without
// re-running; credential failures park the run and resolve to a structured
// "parked" result the model can surface to the user.
//
//   import { streamText } from "ai";
//   import { ReviveClient } from "@revive/sdk";
//   import { protectTools } from "@revive/sdk/vercel-ai";
//
//   const revive = new ReviveClient({ baseUrl, apiKey });
//   const tools = protectTools(revive, {
//     runId: threadId,
//     connectionId: "conn_…",
//     protected: ["sendEmail", "createTicket"],
//   }, rawTools);
//   await streamText({ model, tools, … });

import { inferActionRisk, ReviveClient, type ProtectActionResult } from "./index";

interface ToolLike {
  execute?: (input: unknown, options?: unknown) => PromiseLike<unknown> | unknown;
  [key: string]: unknown;
}

export interface ProtectToolsOptions {
  runId: string;
  connectionId: string;
  /** Tool names to protect; omit to protect every tool that has execute(). */
  protected?: string[];
  checkpointId?: string;
  credential?: () => { connectionId: string; provider: string; generation: number; credential: string };
}

export interface ParkedToolResult {
  revive: "parked";
  caseId: string;
  recoveryUrl?: string;
  message: string;
}

export function protectTools<T extends Record<string, ToolLike>>(
  client: ReviveClient,
  options: ProtectToolsOptions,
  tools: T,
): T {
  const guarded = new Set(options.protected ?? Object.keys(tools));
  const out: Record<string, ToolLike> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.execute || !guarded.has(name)) {
      out[name] = tool;
      continue;
    }
    const execute = tool.execute.bind(tool);
    out[name] = {
      ...tool,
      execute: async (input: unknown, callOptions?: unknown) => {
        const result: ProtectActionResult<unknown> = await client.protectAction({
          runId: options.runId,
          checkpointId: options.checkpointId,
          connectionId: options.connectionId,
          actionKey: name,
          metadata: { adapter: "vercel-ai" },
          riskContext: inferActionRisk(name, input),
          credential: options.credential
            ?? (() => ({ connectionId: options.connectionId, provider: "external", generation: 1, credential: "managed" })),
          execute: async () => execute(input, callOptions),
        });
        if (result.status === "parked") {
          const parked: ParkedToolResult = {
            revive: "parked",
            caseId: result.recoveryCase.id,
            recoveryUrl: result.recoveryCase.url,
            message: "This tool's account access failed. The workflow is parked; ask the account owner to reconnect via the recovery link. Completed steps will not repeat.",
          };
          return parked;
        }
        return result.value;
      },
    };
  }
  return out as T;
}
