import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, GitDiff } from "@phosphor-icons/react/dist/ssr";
import { ago, PageHeader, SummaryStrip, TransactionStateBadge } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listOutcomeTransactions } from "@/lib/outcome-transactions";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const transactions = await listOutcomeTransactions(workspace.id).catch(() => []);
  const verified = transactions.filter((item) => item.state === "verified").length;
  const recovered = transactions.filter((item) => item.state === "compensated").length;
  const attention = transactions.filter((item) => ["awaiting_approval", "recovering", "needs_human"].includes(item.state)).length;

  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Outcome integrity" title="Transactions" description="One business operation across every provider action, held open until its final state is proved." actions={<Link href="/app/action-contracts" className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10px] font-semibold text-white hover:bg-[#2b3340]">Define an outcome <ArrowRight size={12} /></Link>} />
    <div className="mt-5"><SummaryStrip items={[{ label: "Verified", value: String(verified), detail: "complete outcomes", tone: verified ? "ok" : undefined }, { label: "Needs attention", value: String(attention), detail: "approval or recovery", tone: attention ? "warn" : "ok" }, { label: "Compensated", value: String(recovered), detail: "safely unwound", tone: recovered ? "cobalt" : undefined }]} /></div>
    <section className="instrument-panel mt-5 overflow-hidden" aria-labelledby="transactions-title"><div className="flex min-h-12 items-center justify-between border-b border-[#e1e2de] px-5"><div><h2 id="transactions-title" className="text-[12px] font-semibold text-[#25282d]">Latest business operations</h2><p className="mt-0.5 text-[10px] text-[#687180]">Progress is derived from independently settled steps.</p></div><span className="font-mono text-[8.5px] text-[#7b8491]">{transactions.length} total</span></div>
      {transactions.length ? transactions.map((transaction) => {
        const settled = transaction.steps.filter((step) => ["verified", "compensated", "skipped"].includes(step.state)).length;
        const pct = Math.round((settled / Math.max(1, transaction.steps.length)) * 100);
        return <Link key={transaction.id} href={`/app/transactions/${transaction.id}`} className="grid gap-3 border-b border-[#e8ebe7] px-5 py-4 last:border-b-0 hover:bg-[#f7f8f5] lg:grid-cols-[minmax(0,1fr)_180px_auto_auto] lg:items-center"><div className="min-w-0"><div className="truncate text-[11.5px] font-semibold text-[#151922]">{transaction.title}</div><div className="mt-1 truncate font-mono text-[8.5px] text-[#8a929d]">{transaction.contractKey} · {transaction.runId}</div></div><div><div className="flex items-center justify-between font-mono text-[8px] text-[#7b8491]"><span>{settled}/{transaction.steps.length} settled</span><span>{pct}%</span></div><div className="mt-1.5 h-1 bg-[#e1e5ea]"><div className={`h-1 ${transaction.state === "needs_human" ? "bg-[#af4039]" : "bg-[#4967f2]"}`} style={{ width: `${pct}%` }} /></div></div><TransactionStateBadge state={transaction.state} /><span className="font-mono text-[8.5px] text-[#8a929d]">{ago(transaction.updatedAt)}</span></Link>;
      }) : <div className="grid min-h-[250px] place-items-center px-5 py-10 text-center"><div><span className="mx-auto flex h-10 w-10 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><GitDiff size={18} /></span><h2 className="mt-4 text-[14px] font-semibold text-[#151922]">No transactions yet</h2><p className="mx-auto mt-2 max-w-[420px] text-[10.5px] leading-5 text-[#687180]">Keep protecting individual actions today. Add the transaction API when one agent task spans multiple external changes.</p><Link href="/app/quickstart" className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#2e49c8] hover:underline">View integration paths <ArrowRight size={11} /></Link></div></div>}
    </section>
  </div>;
}
