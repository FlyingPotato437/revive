import { cookies } from "next/headers";
import { CheckCircle, GitDiff, Path, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { OutcomeContractBuilder } from "@/components/app/OutcomeContractBuilder";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { BUILT_IN_OUTCOME_CONTRACTS, listOutcomeContracts } from "@/lib/outcome-transactions";

export const dynamic = "force-dynamic";

export default async function OutcomeContractsPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const contracts = await listOutcomeContracts(workspace.id).catch(() => []);

  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Outcome integrity" title="Outcome contracts" description="Define the final state Revive must prove before an agent operation can be called complete." actions={<OutcomeContractBuilder />} />

    {contracts.length > 0 && <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Workspace contracts" meta={`${contracts.length} version${contracts.length === 1 ? "" : "s"}`} /><div className="divide-y divide-[#e1e2de]">{contracts.map((contract) => <article key={contract.id} className="grid gap-5 px-5 py-5 lg:grid-cols-[.85fr_1.15fr]"><div><div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold tracking-[-.03em] text-[#151922]">{contract.name}</h2><StatusBadge tone={contract.status === "active" ? "ok" : "neutral"}>{contract.status}</StatusBadge></div><p className="mt-2 max-w-[420px] text-[10.5px] leading-5 text-[#687180]">{contract.description || "No description provided."}</p><div className="mt-3 font-mono text-[8.5px] text-[#8a929d]">{contract.key} · v{contract.version} · approval {contract.approvalMode}</div></div><div className="grid gap-3 sm:grid-cols-3"><RuleCount icon={Path} label="Preconditions" value={contract.preconditions.length} /><RuleCount icon={CheckCircle} label="Required outcomes" value={contract.requiredOutcomes.length} /><RuleCount icon={GitDiff} label="Recovery rules" value={contract.compensation.length} /></div></article>)}</div></section>}

    <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Starting contracts" meta="copy the pattern, then make it yours" /><div className="grid gap-px bg-[#d8dde3] lg:grid-cols-3">{BUILT_IN_OUTCOME_CONTRACTS.map((contract) => <article key={contract.key} className="flex min-h-[270px] flex-col bg-[#fbfcf8] p-5"><span className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><ShieldCheck size={18} weight="duotone" /></span><h2 className="mt-5 text-[16px] font-semibold tracking-[-.035em] text-[#151922]">{contract.name}</h2><p className="mt-2 text-[10.5px] leading-5 text-[#687180]">{contract.description}</p><dl className="mt-auto grid grid-cols-3 gap-2 border-t border-[#e1e2de] pt-4"><SmallMetric label="Before" value={contract.preconditions.length} /><SmallMetric label="Prove" value={contract.requiredOutcomes.length} /><SmallMetric label="Recover" value={contract.compensation.length} /></dl></article>)}</div></section>

    <aside className="mt-5 border-l-[4px] border-[#4967f2] bg-[#edf0ff] px-5 py-4"><h2 className="text-[11px] font-semibold text-[#2e49c8]">Contracts describe outcomes, not prompts</h2><p className="mt-1 max-w-[760px] text-[10.5px] leading-5 text-[#596273]">The agent may choose its path. Revive checks the provider state, preserves exactly-once action records, and keeps the transaction open until the required outcome is verified or safely escalated.</p></aside>
  </div>;
}

function RuleCount({ icon: Icon, label, value }: { icon: typeof Path; label: string; value: number }) { return <div className="border border-[#dfe3df] bg-[#f7f8f5] p-3"><Icon size={14} className="text-[#4967f2]" /><div className="mt-3 text-[18px] font-semibold tabular-nums text-[#151922]">{value}</div><div className="mt-0.5 font-mono text-[8px] text-[#7b8491]">{label}</div></div>; }
function SmallMetric({ label, value }: { label: string; value: number }) { return <div><dt className="font-mono text-[7.5px] uppercase tracking-[.08em] text-[#8a929d]">{label}</dt><dd className="mt-1 text-[14px] font-semibold text-[#151922]">{value}</dd></div>; }
