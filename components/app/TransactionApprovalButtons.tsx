"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TransactionApprovalButtons({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    setBusy(decision); setError(null);
    try {
      const response = await fetch(`/api/workspaces/transactions/${transactionId}/approval`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save the decision");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the decision"); }
    finally { setBusy(null); }
  }

  return <div><div className="flex gap-2"><button onClick={() => void decide("approve")} disabled={Boolean(busy)} className="h-9 border border-[#18724e] bg-[#edf8f2] px-4 text-[10px] font-semibold text-[#18724e] hover:bg-[#dff0e7] disabled:opacity-50">{busy === "approve" ? "Approving" : "Approve transaction"}</button><button onClick={() => void decide("deny")} disabled={Boolean(busy)} className="h-9 border border-[#edceca] bg-white px-4 text-[10px] font-semibold text-[#af4039] hover:bg-[#fff0ee] disabled:opacity-50">{busy === "deny" ? "Denying" : "Deny"}</button></div>{error && <p role="alert" className="mt-2 text-[9.5px] text-[#af4039]">{error}</p>}</div>;
}
