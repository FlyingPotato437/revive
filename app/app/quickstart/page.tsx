import Link from "next/link";
import { QuickstartFlow } from "@/components/app/QuickstartFlow";
import { PageHeader } from "@/components/app/ConsolePrimitives";

export default function QuickstartPage() {
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader
      eyebrow="Setup"
      title="Point your interrupt at Revive"
      description="Free detector measures dead runs first. Resolve only human-dependent blockers worth recovering."
      actions={<Link href="/app/api-keys" className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a]">Get an API key</Link>}
    />

    <div className="mt-5 grid gap-px border border-[#151922] bg-[#e1e2de] sm:grid-cols-3">
      {[
        ["1", "Add one handler", "Use current interrupt or failure boundary."],
        ["2", "Measure loss", "See blocker mix, jobs and wasted model cost."],
        ["3", "Revive selected runs", "Reach person, validate fix, resume or replan."],
      ].map(([n, title, body]) => (
        <div key={n} className="bg-[#fbfcf8] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center border border-[#4967f2] bg-[#edf0ff] font-mono text-[10px] font-semibold text-[#2e49c8]">{n}</span>
            <span className="text-[11.5px] font-semibold text-[#151922]">{title}</span>
          </div>
          <p className="mt-2 text-[10.5px] leading-4 text-[#687180]">{body}</p>
        </div>
      ))}
    </div>

    <div className="mt-5"><QuickstartFlow /></div>
    <details className="group mt-5 border border-[#e2e3df] bg-[#f7f8f5] text-[#596273]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
        <span className="text-[10.5px] font-semibold text-[#151922]">Runtime adapters</span>
        <span className="font-mono text-[9px] text-[#8a929d] transition group-open:rotate-45">+</span>
      </summary>
      <div className="grid gap-4 border-t border-[#e2e3df] px-5 py-4 text-[10px] leading-5 sm:grid-cols-2">
        <RuntimeLink name="LangGraph" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/langgraph.py" body="Uses the runtime interrupt and its checkpointer." />
        <RuntimeLink name="Temporal" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/temporal.py" body="Signals the existing workflow with the lease generation." />
      </div>
    </details>
  </div>;
}

function RuntimeLink({ name, href, body }: { name: string; href: string; body: string }) { return <a href={href} className="group border-l-[3px] border-[#bfc5cc] pl-3 transition hover:border-[#4967f2]"><span className="text-[10px] font-semibold group-hover:text-[#2e49c8]">{name}</span><span className="mt-0.5 block text-[9.5px] text-[#687180]">{body}</span></a>; }
