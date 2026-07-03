"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/app/ConsolePrimitives";

export function BillingControls({ plan, connectionLimit }: { plan: string; connectionLimit: number | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(targetPlan: "dev" | "team") {
    setBusy(targetPlan);
    setError(null);
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: targetPlan }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.url) {
      window.location.assign(payload.url);
      return;
    }
    setError(payload.error || "Billing is unavailable right now.");
    setBusy(null);
  }

  const isPaid = plan === "dev" || plan === "team";
  const limitLabel = connectionLimit === null ? "Custom connection limits" : `${connectionLimit} credential connection${connectionLimit === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#151922]">Current plan</span>
          <StatusBadge tone={plan === "free" ? "neutral" : "cobalt"}>{plan}</StatusBadge>
        </div>
        <p className="mt-1 text-[10.5px] leading-5 text-[#687180]">
          {plan === "free"
            ? "The sandbox remains free. Choose Dev or Team when a real workflow is ready."
            : `${limitLabel}. Manage payment methods, invoices, and cancellation through Stripe.`}
        </p>
        {error && <div role="alert" className="mt-2 border-l-[3px] border-[#c2413a] bg-[#fcedeb] px-3 py-2 text-[10.5px] text-[#8b3e38]">{error}</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {plan === "free" && <>
          <button onClick={() => checkout("dev")} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#fbfcf8] px-4 text-[10.5px] font-semibold text-[#151922] transition hover:bg-[#eef0eb] active:translate-y-px disabled:cursor-wait disabled:opacity-60">
            {busy === "dev" ? "Opening Stripe" : "Dev $10"}
          </button>
          <button onClick={() => checkout("team")} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-60">
            {busy === "team" ? "Opening Stripe" : "Team $49"}
            {busy === null && <ArrowRight size={13} weight="bold" />}
          </button>
        </>}
        {isPaid && <button onClick={() => checkout(plan as "dev" | "team")} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px disabled:cursor-wait disabled:opacity-60">
          {busy ? "Opening Stripe" : "Manage billing"}
          {!busy && <ArrowRight size={13} weight="bold" />}
        </button>}
        {plan === "enterprise" && <Link href="mailto:founders@revivelabs.app?subject=Revive%20Enterprise" className="inline-flex h-10 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Contact support <ArrowRight size={13} weight="bold" /></Link>}
      </div>
    </div>
  );
}
