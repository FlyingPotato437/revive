/**
 * Remove common secrets and direct identifiers before free-form admin text is
 * sent to an external model. This is deliberately conservative: policy
 * compilation needs action categories and thresholds, not credentials or PII.
 */
export function redactSensitiveText(value: unknown, maxLength = 6_000): string {
  return String(value ?? "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[private-key-redacted]")
    .replace(/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi, "[slack-webhook-redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(["']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|password|secret|webhook[_-]?url)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[redacted]")
    .replace(/\b(?:sk-(?:ant-)?|xox[baprs]-|gh[pousr]_)[A-Za-z0-9_-]{12,}\b/gi, "[token-redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email-redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[number-redacted]")
    .slice(0, Math.max(1, Math.min(20_000, maxLength)));
}
