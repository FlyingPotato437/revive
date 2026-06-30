"use client";

import { motion } from "framer-motion";
import type { StepStatus } from "@/lib/types";

/* --- eyebrow (mono, all-caps, instrument voice) --------------------------- */

export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}

/* --- HTTP method tag ------------------------------------------------------ */

export function MethodTag({ method }: { method: string }) {
  const tone =
    method === "GET"
      ? "text-cobalt bg-cobalt-soft"
      : method === "POST"
        ? "text-ok bg-ok-soft"
        : "text-warn bg-warn-soft";
  return (
    <span
      className={`mono inline-flex h-[17px] items-center rounded-tag px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] ${tone}`}
    >
      {method}
    </span>
  );
}

/* --- status node (drawn, not emoji) --------------------------------------- */

export function StatusNode({ status }: { status: StepStatus }) {
  const wrap = "relative flex h-[22px] w-[22px] shrink-0 items-center justify-center";
  switch (status) {
    case "ok":
      return (
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={wrap}
        >
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ok-soft">
            <Check className="text-ok" />
          </span>
        </motion.span>
      );
    case "running":
      return (
        <span className={wrap}>
          <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-cobalt/25" />
          <span className="absolute h-[18px] w-[18px] animate-spin rounded-full border-[1.5px] border-transparent border-t-cobalt" />
        </span>
      );
    case "refreshing":
      return (
        <span className={wrap}>
          <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-warn/25" />
          <span className="absolute h-[18px] w-[18px] animate-spin rounded-full border-[1.5px] border-transparent border-t-warn" />
        </span>
      );
    case "failed":
      return (
        <span className={wrap}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="#A8341F" strokeWidth="1.5" />
            <line x1="5.5" y1="14.5" x2="14.5" y2="5.5" stroke="#A8341F" strokeWidth="1.5" />
          </svg>
        </span>
      );
    case "checkpointed":
      return (
        <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className={wrap}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M6 4v12M14 4v12M6 7h2M12 7h2M6 13h2M12 13h2"
              stroke="#1F47C8"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </motion.span>
      );
    case "resuming":
      return (
        <span className={wrap}>
          <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-cobalt/25" />
          <span className="absolute h-[18px] w-[18px] animate-spin rounded-full border-[1.5px] border-transparent border-t-cobalt" />
        </span>
      );
    default: // pending
      return (
        <span className={wrap}>
          <span className="h-[14px] w-[14px] rounded-full border border-hairline" />
        </span>
      );
  }
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <path
        d="M2.5 6.2l2.2 2.3L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* --- pill / badge --------------------------------------------------------- */

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "cobalt" | "ok" | "fail" | "warn";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-hairline bg-paper-inset text-ink-muted",
    cobalt: "border-cobalt/25 bg-cobalt-soft text-cobalt",
    ok: "border-ok/25 bg-ok-soft text-ok",
    fail: "border-fail/25 bg-fail-soft text-fail",
    warn: "border-warn/25 bg-warn-soft text-warn",
  };
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.08em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Dot({
  tone = "neutral",
  pulse = false,
}: {
  tone?: "neutral" | "cobalt" | "ok" | "fail" | "warn";
  pulse?: boolean;
}) {
  const colors: Record<string, string> = {
    neutral: "bg-ink-faint",
    cobalt: "bg-cobalt",
    ok: "bg-ok",
    fail: "bg-fail",
    warn: "bg-warn",
  };
  return (
    <span className="relative flex h-[7px] w-[7px]">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${colors[tone]}`}
        />
      )}
      <span className={`relative inline-flex h-[7px] w-[7px] rounded-full ${colors[tone]}`} />
    </span>
  );
}

/* --- token chip ----------------------------------------------------------- */

export function TokenChip({
  fingerprint,
  generation,
  rotated = false,
}: {
  fingerprint: string;
  generation: number;
  rotated?: boolean;
}) {
  return (
    <span className="mono inline-flex items-center gap-2 rounded-[6px] border border-hairline bg-white px-2 py-1 text-[10px] text-ink-muted">
      <span className="text-ink-faint">lease</span>
      <motion.span
        key={fingerprint}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-ink"
      >
        {fingerprint}
      </motion.span>
      <motion.span
        key={`gen-${generation}`}
        initial={rotated ? { scale: 0.8 } : false}
        animate={{ scale: 1 }}
        className={`rounded px-1 ${
          rotated
            ? "bg-cobalt-soft text-cobalt ring-1 ring-cobalt/20"
            : "bg-paper-base text-ink-faint"
        }`}
      >
        gen {generation}
      </motion.span>
    </span>
  );
}
