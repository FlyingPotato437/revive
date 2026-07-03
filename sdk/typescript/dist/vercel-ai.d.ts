import { ReviveClient } from "./index";
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
    credential?: () => {
        connectionId: string;
        provider: string;
        generation: number;
        credential: string;
    };
}
export interface ParkedToolResult {
    revive: "parked";
    caseId: string;
    recoveryUrl?: string;
    message: string;
}
export declare function protectTools<T extends Record<string, ToolLike>>(client: ReviveClient, options: ProtectToolsOptions, tools: T): T;
export {};
//# sourceMappingURL=vercel-ai.d.ts.map