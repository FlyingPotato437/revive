import Link from "next/link";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";

const recoveryStages = [
  { title: "Classify the failure", body: "Separate a dead grant from a refreshable token or transient provider error.", system: "Identity" },
  { title: "Bind the affected run", body: "Join the credential lease, logical run, checkpoint and failed action.", system: "Revive" },
  { title: "Reauthorize the right account", body: "Issue a short-lived recovery capability without exposing credentials to the worker.", system: "User" },
  { title: "Resume the original execution", body: "Rotate the lease generation, reconcile side effects and continue from the checkpoint.", system: "Runtime" },
];

const invariants = [
  { title: "Same logical run", body: "Recovery advances the existing execution instead of spawning a replacement job." },
  { title: "Credential generation fencing", body: "Workers holding the rejected generation cannot race the resumed run." },
  { title: "Checkpoint outside the process", body: "The original worker can disappear while recovery remains actionable." },
  { title: "Replay with evidence", body: "Every mutating action keeps its idempotency key and reconciliation state." },
];

const faqs = [
  { q: "Is Revive another token vault?", a: "No. Nango, Auth0 and provider vaults own token custody. Revive owns the recovery contract around the affected run." },
  { q: "Why is normal workflow retry insufficient?", a: "Retrying with the rejected credential fails again. Blind replay can also repeat a remote side effect that already committed." },
  { q: "Does recovery survive a worker restart?", a: "Yes. The recovery case and checkpoint are durable, so another worker can resume the same logical run." },
  { q: "Which runtimes can Revive coordinate?", a: "The repository includes LangGraph and Temporal adapters. The contract is designed to support additional durable runtimes." },
];

export default function Home() {
  return <div className="revive-home">
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="home-hero-grid pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] lg:block" />
      <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] max-w-[1380px] items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[.88fr_1.12fr] lg:gap-10 lg:py-14">
        <div className="relative z-10 max-w-[650px]">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[.16em] text-[#8294ff]">Credential recovery infrastructure</div>
          <h1 className="mt-6 text-[clamp(44px,4.6vw,66px)] font-semibold leading-[.94] tracking-[-.06em] text-[#f2f3ef]"><span className="block">Keep the run.</span><span className="block sm:whitespace-nowrap">Replace the credential.</span></h1>
          <p className="mt-7 max-w-[580px] text-[16px] leading-7 text-[#a7adb8]">Revive reconnects identity to the exact checkpoint, then resumes the original run without repeating committed work.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/app" className="inline-flex h-12 items-center rounded-[8px] bg-[#6f83ff] px-5 text-[12px] font-semibold text-[#0d1118] transition hover:bg-[#8394ff] active:translate-y-px">Run the failure</Link>
            <Link href="#architecture" className="inline-flex h-12 items-center rounded-[8px] border border-white/15 px-5 text-[12px] font-semibold text-[#e5e7e8] transition hover:border-white/30 hover:bg-white/[.04] active:translate-y-px">Read architecture</Link>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>

    <section aria-label="Recovery boundary" className="border-b border-white/10">
      <div className="mx-auto grid max-w-[1380px] px-5 sm:px-8 md:grid-cols-[1fr_1.18fr_1fr] md:px-8">
        <BoundaryCell label="Credential system" title="Grant rejected" detail="Entra, Nango, Auth0" tone="fail" />
        <BoundaryCell label="Revive continuity layer" title="Run correlated" detail="lease / run / checkpoint / action" tone="active" />
        <BoundaryCell label="Durable runtime" title="Execution resumed" detail="LangGraph, Temporal" tone="ok" />
      </div>
    </section>

    <section id="product" className="mx-auto grid max-w-[1380px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:py-36">
      <Reveal className="lg:sticky lg:top-28 lg:self-start">
        <h2 className="max-w-[520px] text-[clamp(36px,5vw,62px)] font-semibold leading-[.98] tracking-[-.055em] text-[#eef0ed]">A credential failure is not a workflow failure.</h2>
        <p className="mt-6 max-w-[480px] text-[14px] leading-6 text-[#8e96a3]">The missing layer is a durable record connecting the broken identity to the exact work that stopped.</p>
      </Reveal>
      <Stagger className="border-t border-white/12">
        {recoveryStages.map((stage) => <StaggerItem key={stage.title}>
          <article className="group grid gap-5 border-b border-white/12 py-7 sm:grid-cols-[120px_1fr] sm:py-9">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-[#697180] group-hover:text-[#8294ff]">{stage.system}</div>
            <div><h3 className="text-[22px] font-semibold tracking-[-.035em] text-[#e9ebe9]">{stage.title}</h3><p className="mt-2 max-w-[590px] text-[13px] leading-6 text-[#8e96a3]">{stage.body}</p></div>
          </article>
        </StaggerItem>)}
      </Stagger>
    </section>

    <section id="architecture" className="border-y border-white/10 bg-[#111722]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal><div className="max-w-[760px]"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-[#8294ff]">The recovery contract</div><h2 className="mt-5 text-[clamp(36px,5vw,64px)] font-semibold leading-[.98] tracking-[-.055em] text-[#eef0ed]">Same run ID. New credential generation.</h2></div></Reveal>
        <div className="mt-14 grid overflow-hidden rounded-[12px] border border-white/12 bg-[#0d121b] lg:grid-cols-[1.15fr_.85fr]">
          <Reveal className="relative min-h-[430px] overflow-hidden border-b border-white/10 p-7 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="home-coordinate-field absolute inset-0 opacity-40" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[.12em] text-[#697180]"><span>Logical execution</span><span>protected</span></div>
              <div className="py-16">
                <div className="text-[clamp(56px,8vw,104px)] font-semibold leading-none tracking-[-.075em] text-[#f0f2ef]">run_7f2</div>
                <div className="mt-5 flex items-center gap-4"><span className="font-mono text-[11px] text-[#d15d57]">grant rejected</span><span className="h-px flex-1 bg-white/12" /><span className="font-mono text-[11px] text-[#8294ff]">generation 2</span></div>
              </div>
              <div className="font-mono text-[10px] text-[#7f8794]">checkpoint: files / action key preserved</div>
            </div>
          </Reveal>
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-1">
            {invariants.map((item) => <StaggerItem key={item.title} className="border-b border-white/10 last:border-0 sm:odd:border-r lg:odd:border-r-0">
              <div className="min-h-[150px] p-6 sm:p-7"><h3 className="text-[15px] font-semibold tracking-[-.025em] text-[#e7e9e7]">{item.title}</h3><p className="mt-3 text-[11.5px] leading-5 text-[#7f8794]">{item.body}</p></div>
            </StaggerItem>)}
          </Stagger>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
      <Reveal><h2 className="max-w-[720px] text-[clamp(34px,4.5vw,56px)] font-semibold leading-[1] tracking-[-.05em] text-[#eef0ed]">Built between systems that already do their jobs well.</h2></Reveal>
      <div className="mt-14 overflow-hidden rounded-[12px] border border-white/12">
        <SystemRow label="Credential custody" systems={["Microsoft Entra", "Nango", "Auth0 Token Vault"]} detail="Tokens stay with the identity layer." />
        <SystemRow label="Recovery contract" systems={["Revive"]} detail="Correlates identity, execution and replay evidence." active />
        <SystemRow label="Durable execution" systems={["LangGraph", "Temporal"]} detail="The runtime owns checkpointing and scheduling." />
      </div>
    </section>

    <section id="faq" className="border-y border-white/10 bg-[#111722]">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[.65fr_1.35fr] lg:py-28">
        <Reveal><h2 className="text-[38px] font-semibold tracking-[-.045em] text-[#eef0ed]">Clear boundaries.</h2><p className="mt-4 max-w-[300px] text-[13px] leading-6 text-[#858d99]">What Revive owns, and what it deliberately leaves to other infrastructure.</p></Reveal>
        <Reveal delay={.06} className="border-t border-white/12">{faqs.map((faq) => <details key={faq.q} className="group border-b border-white/12 py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[14px] font-semibold text-[#e2e5e3]"><span>{faq.q}</span><span className="font-mono text-[16px] font-normal text-[#697180] transition group-open:rotate-45 group-open:text-[#8294ff]">+</span></summary><p className="mt-3 max-w-[680px] pr-10 text-[12px] leading-6 text-[#858d99]">{faq.a}</p></details>)}</Reveal>
      </div>
    </section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-36">
      <Reveal className="grid gap-10 border-l-2 border-[#6f83ff] pl-6 sm:pl-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><h2 className="max-w-[820px] text-[clamp(40px,6vw,76px)] font-semibold leading-[.95] tracking-[-.06em] text-[#eef0ed]">Break the credential.<br />Keep the execution.</h2><p className="mt-5 max-w-[560px] text-[14px] leading-6 text-[#8e96a3]">Run the local fault injection and inspect every recovery transition.</p></div>
        <Link href="/app" className="inline-flex h-12 w-fit items-center rounded-[8px] bg-[#6f83ff] px-6 text-[12px] font-semibold text-[#0d1118] transition hover:bg-[#8394ff] active:translate-y-px">Open recovery lab</Link>
      </Reveal>
    </section>
  </div>;
}

function BoundaryCell({ label, title, detail, tone }: { label: string; title: string; detail: string; tone: "fail" | "active" | "ok" }) {
  const color = tone === "fail" ? "text-[#d76a64]" : tone === "ok" ? "text-[#65bb91]" : "text-[#8294ff]";
  return <div className={`relative border-white/10 py-6 md:border-r md:px-7 md:last:border-0 ${tone === "active" ? "bg-[#111722]" : ""}`}><div className={`font-mono text-[9px] uppercase tracking-[.12em] ${color}`}>{label}</div><div className="mt-2 text-[15px] font-semibold text-[#e3e5e3]">{title}</div><div className="mt-1 font-mono text-[9px] text-[#68707d]">{detail}</div></div>;
}

function SystemRow({ label, systems, detail, active = false }: { label: string; systems: string[]; detail: string; active?: boolean }) {
  return <div className={`grid gap-5 border-b border-white/10 p-5 last:border-0 sm:grid-cols-[170px_1fr_1fr] sm:items-center sm:p-6 ${active ? "bg-[#172039]" : "bg-[#0f141d]"}`}><div className="font-mono text-[9px] uppercase tracking-[.12em] text-[#77808d]">{label}</div><div className="flex flex-wrap gap-x-5 gap-y-2">{systems.map((system) => <span key={system} className={`text-[14px] font-semibold ${active ? "text-[#91a0ff]" : "text-[#e1e4e1]"}`}>{system}</span>)}</div><p className="text-[11px] leading-5 text-[#7f8794]">{detail}</p></div>;
}
