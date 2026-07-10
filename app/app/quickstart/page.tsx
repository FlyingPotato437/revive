import { QuickstartFlow } from "@/components/app/QuickstartFlow";
import { PageHeader } from "@/components/app/ConsolePrimitives";

export default function QuickstartPage() {
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Setup" title="Quickstart" description="Choose one integration path. Your first protected write proves setup." />
    <div className="mt-6"><QuickstartFlow /></div>
    <details className="mt-5 border border-[#e2e3df] bg-[#f7f8f5] px-4 py-3 text-[#596273]"><summary className="cursor-pointer text-[10px] font-semibold">Runtime adapters</summary><div className="mt-3 grid gap-3 text-[10px] leading-5 sm:grid-cols-2"><RuntimeLink name="LangGraph" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/langgraph.py" body="Uses the runtime interrupt and its checkpointer." /><RuntimeLink name="Temporal" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/temporal.py" body="Signals the existing workflow with the lease generation." /></div></details>
  </div>;
}

function RuntimeLink({ name, href, body }: { name: string; href: string; body: string }) { return <a href={href} className="group border-l-[3px] border-[#bfc5cc] pl-3 transition hover:border-[#4967f2]"><span className="text-[10px] font-semibold group-hover:text-[#2e49c8]">{name}</span><span className="mt-0.5 block text-[9.5px] text-[#687180]">{body}</span></a>; }
