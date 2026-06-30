"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }
  return (
    <div>
      <div className="mono mb-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-chip border border-hairline bg-paper-inset px-3 py-2 shadow-inset">
        <span className="mono min-w-0 flex-1 truncate text-[12.5px] text-ink">
          {value}
        </span>
        <button
          onClick={copy}
          className="mono shrink-0 rounded border border-hairline bg-paper-panel px-2 py-0.5 text-[10.5px] text-ink-muted transition hover:bg-paper-base"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}
