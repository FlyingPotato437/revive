type ClaudeContent = { type?: string; text?: string };

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.REVIVE_CLAUDE_MODEL);
}

/** Small server-only Claude JSON helper. No SDK dependency. Callers must pass
 * redacted data and validate every returned field against deterministic enums. */
export async function askClaudeJson<T>(input: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.REVIVE_CLAUDE_MODEL;
  if (!apiKey || !model) return null;
  const configuredTimeout = Number(process.env.REVIVE_CLAUDE_TIMEOUT_MS || 3500);
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.max(500, Math.min(8000, configuredTimeout)) : 3500;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(1200, Math.max(128, input.maxTokens || 600)),
        temperature: 0,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = await response.json() as { content?: ClaudeContent[] };
    const text = body.content?.find((item) => item.type === "text")?.text?.trim();
    if (!text) return null;
    const candidate = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
