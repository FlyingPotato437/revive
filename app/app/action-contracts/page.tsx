import Link from "next/link";
import { ShieldCheck, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ACTION_CONTRACTS } from "@/lib/action-contracts";

export default function ActionContractsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Policy system"
        title="Action contracts"
        description="A common vocabulary for what an agent is about to do. Contracts provide policy facts and provider-aware recovery hints without copying raw tool arguments into Revive."
        actions={<StatusBadge tone="cobalt">privacy preserving</StatusBadge>}
      />

      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Built-in contracts" meta="gateway and SDK ready" />
        <div className="grid gap-px bg-[#d8dde3] md:grid-cols-2">
          {ACTION_CONTRACTS.map((contract, index) => (
            <article key={contract.id} className={`relative min-h-[190px] bg-[#fbfcf8] p-5 ${index === 0 ? "md:col-span-2 md:grid md:grid-cols-[.9fr_1.1fr] md:gap-8" : ""}`}>
              <div>
                <span className="flex h-9 w-9 items-center justify-center border border-[#4967f2] bg-[#edf0ff] text-[#2e49c8]"><ShieldCheck size={18} weight="duotone" /></span>
                <h2 className="mt-5 text-[17px] font-semibold tracking-[-.035em] text-[#151922]">{contract.title}</h2>
                <p className="mt-2 max-w-[340px] text-[10.5px] leading-5 text-[#687180]">{contract.examples}</p>
              </div>
              <dl className="mt-5 grid gap-3 border-l-0 border-[#d8dde3] pt-4 md:mt-0 md:border-l md:pl-6 md:pt-0">
                <div><dt className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Recorded fact</dt><dd className="mt-1 text-[10.5px] font-semibold text-[#151922]">{contract.facts}</dd></div>
                <div><dt className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Policy behavior</dt><dd className="mt-1 text-[10.5px] leading-5 text-[#596273]">{contract.policy}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="instrument-panel p-5">
          <h2 className="text-[15px] font-semibold tracking-[-.03em] text-[#151922]">What reaches the ledger</h2>
          <p className="mt-2 max-w-[660px] text-[10.5px] leading-5 text-[#687180]">The MCP gateway registers the action key, idempotency key, replay status, and compact contract facts. Its approval summary is generated from those facts, so the gateway does not send message text or recipient addresses to Revive.</p>
          <pre className="mt-5 overflow-x-auto border border-[#151922] bg-[#f7f8f5] p-4 font-mono text-[10px] leading-5 text-[#151922]">{`{
  "operation": "outbound_message",
  "recipientCount": 42
}`}</pre>
        </section>
        <aside className="recorder-panel border border-[#151922] p-5">
          <h2 className="text-[15px] font-semibold tracking-[-.03em] text-[#151922]">Turn facts into policy</h2>
          <p className="mt-2 text-[10.5px] leading-5 text-[#596273]">Set a bulk threshold, require every send, and test the exact decision before an agent reaches the provider.</p>
          <Link href="/app/settings" className="mt-6 inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Configure policy <ArrowRight size={13} /></Link>
        </aside>
      </div>
    </div>
  );
}
