import crypto from "node:crypto";

export type TelemetryValue = string | number | boolean | undefined;
export type TelemetryAttributes = Record<string, TelemetryValue>;

function endpoint(): string | null {
  const direct = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (direct) return direct;
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, "");
  return base ? `${base}/v1/traces` : null;
}

function headers(): Record<string, string> {
  const output: Record<string, string> = { "content-type": "application/json" };
  for (const entry of (process.env.OTEL_EXPORTER_OTLP_HEADERS || "").split(",")) {
    const index = entry.indexOf("=");
    if (index > 0) output[entry.slice(0, index).trim()] = entry.slice(index + 1).trim();
  }
  return output;
}

function attributeValue(value: Exclude<TelemetryValue, undefined>) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  return { stringValue: value.slice(0, 240) };
}

function traceId(seed?: string): string {
  return seed
    ? crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32)
    : crypto.randomBytes(16).toString("hex");
}

/** Emit one OTLP/HTTP JSON span without making telemetry a runtime dependency.
 * Callers pass only compact identifiers and state facts. Export failure never
 * changes recovery behavior. */
export async function emitSpan(
  name: string,
  attributes: TelemetryAttributes,
  options: { traceSeed?: string; startedAt?: number; status?: "ok" | "error" } = {},
): Promise<void> {
  const startedAt = options.startedAt ?? Date.now();
  const endedAt = Date.now();
  const safeAttributes = Object.entries(attributes)
    .filter((entry): entry is [string, Exclude<TelemetryValue, undefined>] => entry[1] !== undefined)
    .slice(0, 40)
    .map(([key, value]) => ({ key: key.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100), value: attributeValue(value) }));
  const span = {
    traceId: traceId(options.traceSeed),
    spanId: crypto.randomBytes(8).toString("hex"),
    name: name.slice(0, 120),
    kind: 1,
    startTimeUnixNano: String(BigInt(startedAt) * 1_000_000n),
    endTimeUnixNano: String(BigInt(Math.max(startedAt, endedAt)) * 1_000_000n),
    attributes: safeAttributes,
    status: { code: options.status === "error" ? 2 : 1 },
  };
  if (process.env.REVIVE_STRUCTURED_TELEMETRY === "1") {
    console.log(JSON.stringify({ type: "revive.span", ...span }));
  }
  const target = endpoint();
  if (!target) return;
  const body = {
    resourceSpans: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: process.env.OTEL_SERVICE_NAME || "revive-control-plane" } }] },
      scopeSpans: [{ scope: { name: "revive.control-plane", version: "0.1.0" }, spans: [span] }],
    }],
  };
  try {
    await fetch(target, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.REVIVE_OTEL_TIMEOUT_MS || 750)),
    });
  } catch {
    // Observability must never break recovery or callback acknowledgement.
  }
}

