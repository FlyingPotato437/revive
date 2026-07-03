import Link from "next/link";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";
import { IntegrationPanel } from "@/components/marketing/IntegrationPanel";

const recoveryStages = [
  { title: "Know why it stopped", body: "Revive separates retryable failures from grants that need a person to reconnect, before another tool call runs.", system: "Identity" },
  { title: "Park the work safely", body: "The run pauses at its last checkpoint instead of crashing. Nothing is lost, and nothing gets repeated while you wait.", system: "Revive" },
  { title: "Bring back the account owner", body: "A secure, single-use link routes reauthorization to the bound account. No shared password or exposed credential.", system: "Account owner" },
  { title: "Pick up exactly where it left off", body: "The same run continues from its checkpoint. The email that already went out stays sent once.", system: "Runtime" },
];

const invariants = [
  ["Same logical run", "Recovery advances the existing execution instead of spawning a replacement job."],
  ["Generation fencing", "Workers holding the rejected credential generation cannot race the resumed run."],
  ["Process-independent checkpoint", "The original worker can disappear while recovery remains actionable."],
  ["Replay evidence", "Every mutating action keeps its idempotency key and reconciliation state."],
];

const faqs = [
  ["Why can't we just retry?", "A rejected grant fails again, while blind replay can duplicate work that already committed. Revive reconnects the account and checks the action ledger first."],
  ["Is Revive another token vault?", "No. Nango, Auth0, or your provider vault keeps token custody. Revive coordinates the in-flight run around that credential change."],
  ["Does recovery survive a worker restart?", "Yes. The recovery case and checkpoint are durable, so another worker can continue the same run later."],
  ["Which runtimes can Revive coordinate?", "LangGraph and Temporal adapters ship in the repo today (adapter preview). The contract is designed to support more durable runtimes."],
];

export default function Home() {
  return <div className="revive-home">
    <section className="relative border-b border-[#151922]">
      <div className="hero-index" aria-hidden="true">RECOVERY<br />WITHOUT<br />REPLAY</div>
      <div className="relative mx-auto grid min-h-[calc(100dvh-63px)] max-w-[1380px] items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[.94fr_1.06fr] lg:gap-16 lg:py-14">
        <div className="relative z-10 max-w-[690px]">
          <div className="text-[10px] font-semibold tracking-[.08em] text-[#2e49c8]">Agent recovery control plane</div>
          <h1 className="mt-7 text-[clamp(48px,5.5vw,78px)] font-semibold leading-[.91] tracking-[-.07em] text-[#151922]"><span className="block">Keep the run.</span><span className="block sm:whitespace-nowrap">Replace the credential.</span></h1>
          <p className="mt-7 max-w-[500px] text-[16px] leading-7 text-[#5f6876]">Revive parks failed agents, verifies side effects, and resumes the same run after the account reconnects.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/app" className="inline-flex h-12 items-center border border-[#151922] bg-[#151922] px-5 text-[12px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">See it recover</Link>
            <Link href="#architecture" className="inline-flex h-12 items-center border border-[#151922] px-5 text-[12px] font-semibold text-[#151922] transition hover:bg-white active:translate-y-px">Read architecture</Link>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>

    <section aria-label="Recovery boundary" className="border-b border-[#151922] bg-[#eef0eb]">
      <div className="mx-auto grid max-w-[1380px] sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <BoundaryCell label="Credential system" title="Grant rejected" detail="Entra / Nango / Auth0" tone="fail" />
        <BoundaryArrow />
        <BoundaryCell label="Continuity layer" title="Run correlated" detail="lease / checkpoint / action" tone="active" />
        <BoundaryArrow />
        <BoundaryCell label="Durable runtime" title="Execution resumed" detail="LangGraph / Temporal" tone="ok" />
      </div>
    </section>

    <div className="recovery-ticker font-mono" aria-hidden="true">
      <div className="recovery-ticker-track">
        <TickerRun />
        <TickerRun />
      </div>
    </div>

    <section id="product" className="mx-auto grid max-w-[1380px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:py-36">
      <Reveal className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-[11px] font-semibold text-[#4967f2]">What actually broke</p>
        <h2 className="mt-5 max-w-[520px] text-[clamp(38px,5vw,64px)] font-semibold leading-[.96] tracking-[-.06em] text-[#151922]">A credential failure is not a workflow failure.</h2>
        <p className="mt-6 max-w-[430px] text-[14px] leading-6 text-[#697281]">Retry cannot repair a revoked grant. Revive parks the run, routes the account owner, and preserves every committed action.</p>
      </Reveal>
      <Stagger className="stage-stack">
        {recoveryStages.map((stage) => <StaggerItem key={stage.title}>
          <article className="stage-row group grid gap-4 py-7 sm:grid-cols-[130px_1fr] sm:py-9">
            <div className="font-mono text-[9px] tracking-[.08em] text-[#7b8491] group-hover:text-[#2e49c8]">{stage.system.toUpperCase()}</div>
            <div><h3 className="text-[23px] font-semibold tracking-[-.04em] text-[#151922]">{stage.title}</h3><p className="mt-2 max-w-[570px] text-[13px] leading-6 text-[#697281]">{stage.body}</p></div>
          </article>
        </StaggerItem>)}
      </Stagger>
    </section>

    <section id="architecture" className="border-y border-[#151922] bg-[#eef0eb]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal><p className="text-[11px] font-semibold text-[#4967f2]">The recovery contract</p><h2 className="mt-5 max-w-[860px] text-[clamp(40px,5.7vw,72px)] font-semibold leading-[.93] tracking-[-.065em] text-[#151922]">Same run ID.<br />New credential generation.</h2></Reveal>
        <div className="continuity-sheet mt-16 grid border border-[#151922] bg-[#fbfcf8] lg:grid-cols-[1.08fr_.92fr]">
          <Reveal className="relative min-h-[440px] overflow-hidden border-b border-[#151922] p-7 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="continuity-ruler" aria-hidden="true" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between font-mono text-[9px] tracking-[.1em] text-[#727b89]"><span>LOGICAL EXECUTION</span><span>PROTECTED</span></div>
              <div className="py-16">
                <div className="text-[clamp(64px,9vw,120px)] font-semibold leading-none tracking-[-.085em] text-[#151922]">run_7f2</div>
                <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-4"><span className="font-mono text-[10px] font-medium text-[#c2413a]">GRANT REJECTED</span><span className="h-px bg-[#aeb5bd]" /><span className="font-mono text-[10px] font-medium text-[#2e49c8]">GENERATION 02</span></div>
              </div>
              <div className="font-mono text-[9px] text-[#737c89]">CHECKPOINT + ACTION KEY PRESERVED</div>
            </div>
          </Reveal>
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-1">
            {invariants.map(([title, body]) => <StaggerItem key={title} className="invariant-row">
              <div className="min-h-[110px] p-6 sm:p-7"><h3 className="text-[15px] font-semibold tracking-[-.025em] text-[#151922]">{title}</h3><p className="mt-3 max-w-[440px] text-[11.5px] leading-5 text-[#687180]">{body}</p></div>
            </StaggerItem>)}
          </Stagger>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
      <Reveal><h2 className="max-w-[760px] text-[clamp(36px,4.8vw,60px)] font-semibold leading-[.98] tracking-[-.055em] text-[#151922]">Built between systems that already do their jobs well.</h2></Reveal>
      <Reveal className="systems-ledger mt-14 border-t border-[#151922]">
        <SystemRow label="Credential custody" systems="Microsoft Entra, Nango, Auth0" detail="Tokens stay with the identity layer." />
        <SystemRow label="Recovery contract" systems="Revive" detail="Correlates identity, execution and replay evidence." active />
        <SystemRow label="Durable execution" systems="LangGraph, Temporal" detail="The runtime handles checkpointing and scheduling." />
      </Reveal>
    </section>

    <section className="border-y border-[#151922] bg-[#eef0eb]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal><h2 className="max-w-[780px] text-[clamp(36px,4.8vw,60px)] font-semibold leading-[.98] tracking-[-.055em] text-[#151922]">Add recovery at the action boundary.</h2><p className="mt-5 max-w-[620px] text-[13px] leading-6 text-[#687180]">Use the runtime and credential system already in production. Revive records the contract between them.</p></Reveal>
        <Reveal delay={.06} className="mt-12"><IntegrationPanel /></Reveal>
      </div>
    </section>

    <section id="faq" className="border-y border-[#151922] bg-[#eef0eb]">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[.65fr_1.35fr] lg:py-28">
        <Reveal><h2 className="text-[42px] font-semibold tracking-[-.05em] text-[#151922]">Clear boundaries.</h2><p className="mt-4 max-w-[300px] text-[13px] leading-6 text-[#687180]">How Revive fits with the infrastructure already running your workflows.</p></Reveal>
        <Reveal delay={.06} className="border-t border-[#151922]">{faqs.map(([question, answer]) => <details key={question} className="group border-b border-[#c7ccd2] py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[14px] font-semibold text-[#151922]"><span>{question}</span><span className="font-mono text-[18px] font-normal text-[#737c89] transition group-open:rotate-45 group-open:text-[#2e49c8]">+</span></summary><p className="mt-3 max-w-[680px] pr-10 text-[12px] leading-6 text-[#687180]">{answer}</p></details>)}</Reveal>
      </div>
    </section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-36">
      <Reveal className="relative border-l-[6px] border-[#4967f2] pl-6 sm:pl-10">
        <p className="absolute right-0 top-0 hidden font-mono text-[9px] tracking-[.1em] text-[#8a93a0] lg:block">FAULT INJECTION / LOCAL SANDBOX</p>
        <h2 className="max-w-[880px] text-[clamp(44px,6vw,82px)] font-semibold leading-[.91] tracking-[-.07em] text-[#151922]">Break the credential.<br />Keep the execution.</h2>
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center"><p className="max-w-[550px] text-[14px] leading-6 text-[#687180]">Run the local fault injection and inspect every recovery transition.</p><Link href="/app" className="inline-flex h-12 w-fit items-center border border-[#151922] bg-[#151922] px-6 text-[12px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Open recovery lab</Link></div>
      </Reveal>
    </section>
  </div>;
}

function TickerRun() {
  const items = [
    ["CHECKPOINT", "PRESERVED"], ["CREDENTIAL GENERATION", "01 → 02"], ["STALE WORKER", "FENCED"],
    ["SIDE EFFECT", "RECONCILED"], ["IDENTITY", "SAME SUBJECT · SAME TENANT"], ["REPLAY VERDICT", "ALREADY_COMMITTED"],
    ["DUPLICATE SENDS", "0 OBSERVED"], ["RUN", "RESUMED AT CKPT_05"],
  ] as const;
  return <>{items.map(([label, value]) => <span key={label}>{label} <em>{value}</em></span>)}</>;
}

function BoundaryCell({ label, title, detail, tone }: { label: string; title: string; detail: string; tone: "fail" | "active" | "ok" }) {
  const color = tone === "fail" ? "text-[#c2413a]" : tone === "ok" ? "text-[#148060]" : "text-[#2e49c8]";
  return <div className="px-5 py-6 sm:px-7"><div className={`font-mono text-[8px] tracking-[.1em] ${color}`}>{label.toUpperCase()}</div><div className="mt-2 text-[15px] font-semibold text-[#151922]">{title}</div><div className="mt-1 font-mono text-[8px] text-[#7b8491]">{detail}</div></div>;
}

function BoundaryArrow() {
  return <div className="hidden items-center sm:flex" aria-hidden="true"><span className="h-px w-8 bg-[#9ca4ae]" /><span className="h-2 w-2 rotate-45 border-r border-t border-[#9ca4ae]" /></div>;
}

function SystemRow({ label, systems, detail, active = false }: { label: string; systems: string; detail: string; active?: boolean }) {
  return <div className={`grid gap-4 border-b border-[#c8cdd2] px-1 py-6 sm:grid-cols-[190px_1fr_1fr] sm:items-center ${active ? "bg-[#edf0ff] px-5" : ""}`}><div className="font-mono text-[9px] tracking-[.09em] text-[#737c89]">{label.toUpperCase()}</div><div className={`text-[15px] font-semibold ${active ? "text-[#2e49c8]" : "text-[#151922]"}`}>{systems}</div><p className="text-[11px] leading-5 text-[#687180]">{detail}</p></div>;
}
