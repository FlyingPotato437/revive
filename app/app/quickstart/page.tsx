import Link from "next/link";
import { QuickstartFlow } from "@/components/app/QuickstartFlow";
import { PageHeader } from "@/components/app/ConsolePrimitives";

export default function QuickstartPage() {
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader
      eyebrow="Setup"
      title="Five minutes to a protected agent"
      description="One config line. After that every action your agent takes runs exactly once, waits for approval when it should, and recovers when it fails."
      actions={<Link href="/app/api-keys" className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a]">Get an API key</Link>}
    />

    <div className="mt-5 grid gap-px border border-[#151922] bg-[#e1e2de] sm:grid-cols-3">
      {[
        ["1", "Grab a key", "Create a workspace API key. Ten seconds."],
        ["2", "Paste one line", "Wrap your MCP server below, or drop the SDK into your runtime."],
        ["3", "Watch it work", "Run your agent. The first protected action lands in the ledger."],
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
    <details className="mt-5 border border-[#e2e3df] bg-[#f7f8f5] px-4 py-3 text-[#596273]"><summary className="cursor-pointer text-[10px] font-semibold">Runtime adapters</summary><div className="mt-3 grid gap-3 text-[10px] leading-5 sm:grid-cols-2"><RuntimeLink name="LangGraph" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/langgraph.py" body="Uses the runtime interrupt and its checkpointer." /><RuntimeLink name="Temporal" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/temporal.py" body="Signals the existing workflow with the lease generation." /></div></details>
  </div>;
}

function RuntimeLink({ name, href, body }: { name: string; href: string; body: string }) { return <a href={href} className="group border-l-[3px] border-[#bfc5cc] pl-3 transition hover:border-[#4967f2]"><span className="text-[10px] font-semibold group-hover:text-[#2e49c8]">{name}</span><span className="mt-0.5 block text-[9.5px] text-[#687180]">{body}</span></a>; }
