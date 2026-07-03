"use client";

import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/app/ConsolePrimitives";

export function BillingControls({ plan, connectionLimit }: { plan: string; connectionLimit: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.url) {
      window.location.assign(payload.url);
      return;
    }
    setError(payload.error || "Billing is unavailable right now.");
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#151922]">Current plan</span>
          <StatusBadge tone={plan === "pro" ? "cobalt" : "neutral"}>{plan}</StatusBadge>
        </div>
        <p className="mt-1 text-[10.5px] leading-5 text-[#687180]">
          {plan === "pro"
            ? "Pro: up to 25 credential connections. Manage or cancel through the billing portal."
            : `Free: ${connectionLimit} credential connection. Pro adds up to 25 connections at $199/month.`}
        </p>
        {error && <div role="alert" className="mt-2 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-3 py-2 text-[10.5px] text-[#8b3e38]">{error}</div>}
      </div>
      <button
        onClick={checkout}
        disabled={busy}
        className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Opening Stripe" : plan === "pro" ? "Manage billing" : "Upgrade to Pro"}
        {!busy && <ArrowRight size={13} weight="bold" />}
      </button>
    </div>
  );
}
