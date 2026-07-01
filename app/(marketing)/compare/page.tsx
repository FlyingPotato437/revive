import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";

const systems = [
  {
    title: "Credential provider",
    examples: "Nango, Auth0, Scalekit",
    responsibility: "Maintains connections, refreshes tokens and runs provider authorization flows.",
    handoff: "Connection identity and the provider error",
  },
  {
    title: "Revive",
    examples: "Recovery control plane",
    responsibility: "Links the failed connection to the exact run, checkpoint and pending action.",
    handoff: "Verified lease generation and a resume signal",
    active: true,
  },
  {
    title: "Workflow runtime",
    examples: "LangGraph, Temporal",
    responsibility: "Persists workflow state, schedules work and resumes the existing execution.",
    handoff: "Run ID, checkpoint and action context",
  },
];

const changes = [
  {
    event: "A refresh token is revoked",
    without: "The worker retries a credential that cannot recover or exits without a reconnect path.",
    with: "Revive classifies the failure, parks the run and sends the account owner a scoped reconnect request.",
  },
  {
    event: "A different account reconnects",
    without: "The workflow can resume under the wrong provider identity.",
    with: "The provider subject and tenant must match the original connection before the request is consumed.",
  },
  {
    event: "The worker times out after a mutation",
    without: "A blind retry may send the email, create the ticket or submit the payment twice.",
    with: "The action ledger requires reconciliation before an ambiguous mutation can execute again.",
  },
  {
    event: "The original worker disappears",
    without: "Recovery context is trapped inside a process that no longer exists.",
    with: "A replacement worker reads the durable case and resumes the same logical run from its checkpoint.",
  },
];

export default function Compare() {
  return <div className="bg-[#f4f5f1] text-[#151922]">
    <section className="border-b border-[#151922]"><div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28"><Reveal><p className="text-[11px] font-semibold text-[#4967f2]">Why Revive</p><h1 className="mt-5 max-w-[900px] text-[clamp(42px,6vw,72px)] font-semibold leading-[.94] tracking-[-.065em]">Credential reconnect should resume work, not restart it.</h1><p className="mt-7 max-w-[720px] text-[15px] leading-7 text-[#5f6876]">Revive coordinates the recovery step between your credential provider and durable workflow runtime.</p></Reveal></div></section>

    <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
      <Reveal><h2 className="max-w-[700px] text-[36px] font-semibold leading-[1] tracking-[-.05em]">One recovery path across three systems.</h2></Reveal>
      <Stagger className="mt-10 grid border border-[#151922] bg-[#fbfcf8] lg:grid-cols-3">{systems.map((system) => <StaggerItem key={system.title}><article className={`h-full border-b border-[#c8cdd2] p-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${system.active ? "bg-[#edf0ff]" : ""}`}><div className={`text-[12px] font-semibold ${system.active ? "text-[#2e49c8]" : "text-[#151922]"}`}>{system.title}</div><div className="mt-2 font-mono text-[8.5px] text-[#7b8491]">{system.examples}</div><p className="mt-7 text-[12px] leading-6 text-[#596273]">{system.responsibility}</p><div className="mt-8 border-t border-[#d7dce2] pt-4"><div className="font-mono text-[8px] tracking-[.08em] text-[#8a929d]">RECOVERY HANDOFF</div><div className="mt-2 text-[10.5px] font-medium leading-5 text-[#303640]">{system.handoff}</div></div></article></StaggerItem>)}</Stagger>
    </section>

    <section className="border-y border-[#151922] bg-[#eef0eb]"><div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28"><Reveal><h2 className="max-w-[760px] text-[36px] font-semibold leading-[1] tracking-[-.05em]">What changes during a real failure.</h2><p className="mt-4 max-w-[620px] text-[13px] leading-6 text-[#687180]">The difference is visible at the point where a workflow would normally stall, restart or replay an action.</p></Reveal><div className="mt-10 border-t border-[#151922]">{changes.map((change) => <Reveal key={change.event} className="grid gap-5 border-b border-[#c8cdd2] py-7 lg:grid-cols-[.72fr_1fr_1fr]"><h3 className="text-[14px] font-semibold tracking-[-.02em]">{change.event}</h3><div><div className="text-[9px] font-semibold text-[#9a5c15]">Without recovery coordination</div><p className="mt-2 text-[11px] leading-5 text-[#687180]">{change.without}</p></div><div className="border-l-[3px] border-[#4967f2] pl-4"><div className="text-[9px] font-semibold text-[#2e49c8]">With Revive</div><p className="mt-2 text-[11px] leading-5 text-[#4f5866]">{change.with}</p></div></Reveal>)}</div></div></section>

    <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28"><Reveal className="grid gap-8 border border-[#151922] bg-[#fbfcf8] p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end"><div><h2 className="max-w-[720px] text-[34px] font-semibold leading-[1] tracking-[-.045em]">Inspect the full recovery record.</h2><p className="mt-4 max-w-[620px] text-[12px] leading-6 text-[#687180]">The lab shows the provider signal, saved checkpoint, verified credential generation and action ledger in one timeline.</p></div><Link href="/app" className="inline-flex h-11 w-fit items-center border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white active:translate-y-px">Open recovery lab</Link></Reveal></section>
  </div>;
}
