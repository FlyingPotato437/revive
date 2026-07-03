import { QuickstartFlow } from "@/components/app/QuickstartFlow";
import { PageHeader } from "@/components/app/ConsolePrimitives";

export default function QuickstartPage() {
  return <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Operations" title="Quickstart" description="Protect one provider action, route reauthorization, and verify the recovery contract." />
    <div className="mt-6"><QuickstartFlow /></div>
    <div className="mt-8 grid gap-4 border-t border-[#bfc5cc] pt-6 sm:grid-cols-2"><RuntimeLink name="LangGraph" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/langgraph.py" body="Parks with the runtime's native interrupt and resumes through its checkpointer." /><RuntimeLink name="Temporal" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/temporal.py" body="Signals the existing workflow with an opaque connection and lease generation." /></div>
  </div>;
}

function RuntimeLink({ name, href, body }: { name: string; href: string; body: string }) { return <a href={href} className="group grid gap-2 border-l-[3px] border-[#bfc5cc] pl-4 transition hover:border-[#4967f2]"><span className="text-[12px] font-semibold group-hover:text-[#2e49c8]">{name}</span><span className="max-w-[460px] text-[10px] leading-5 text-[#687180]">{body}</span></a>; }
