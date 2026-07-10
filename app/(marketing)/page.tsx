import Link from "next/link";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";
import { IntegrationPanel } from "@/components/marketing/IntegrationPanel";
import { SavingsMath } from "@/components/marketing/SavingsMath";

const recoveryStages = [
  { title: "Know why it stopped", body: "Revive separates retryable failures from grants that need a person to reconnect, before another tool call runs.", system: "Identity" },
  { title: "Park the work safely", body: "The run pauses at its last checkpoint instead of crashing. Nothing is lost, and nothing gets repeated while you wait.", system: "Revive" },
  { title: "Bring back the account owner", body: "A secure, single-use link routes reauthorization to the bound account. No shared password or exposed credential.", system: "Account owner" },
  { title: "Pick up exactly where it left off", body: "The same run continues from its checkpoint. The email that already went out stays sent once.", system: "Runtime" },
];

const invariants = [
  ["Same job, continued", "The interrupted run picks up where it stopped. No replacement job, no starting over."],
  ["Old copies locked out", "A crashed worker still holding the dead login can't wake up and repeat the work."],
  ["Survives restarts", "The saved progress lives outside the worker, so recovery works even if the machine is gone."],
  ["Receipts for everything", "Every action keeps a record of whether it ran, so a retry can check before acting."],
];

const faqs = [
  ["Why can't we just retry?", "A rejected grant fails again, while blind replay can duplicate work that already committed. Revive reconnects the account and checks the action ledger first."],
  ["Is Revive another token vault?", "No. Nango, Auth0, or your provider vault keeps token custody. Revive coordinates the in-flight run around that credential change."],
  ["Does recovery survive a worker restart?", "Yes. The recovery case and checkpoint are durable, so another worker can continue the same run later."],
  ["Which runtimes can Revive coordinate?", "LangGraph and Temporal adapters ship in the repo today (adapter preview). The contract is designed to support more durable runtimes."],
];

export default function Home() {
  return <div className="revive-home">
    <section className="border-b border-[#e0e3dd]">
      <div className="grid lg:grid-cols-[minmax(0,1.04fr)_minmax(460px,.96fr)] lg:items-stretch">
        <div className="relative flex min-w-0 items-center px-5 py-16 sm:px-8 lg:px-[max(3.5rem,calc((100vw-1380px)/2+2rem))] lg:py-28">
          <div className="hero-intro-content max-w-[620px]">
            <div className="inline-flex items-center gap-2.5 border border-[#151922] bg-[#fbfcf8] px-3 py-2 shadow-[3px_3px_0_rgba(21,25,34,.12)]">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4967f2] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4967f2]" />
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#151922]">Agent action control plane</span>
            </div>
            <h1 className="mt-6 text-[clamp(42px,5vw,64px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]"><span className="block">Agents take actions.</span><span className="block">Revive makes them safe.</span></h1>
            <p className="mt-6 max-w-[460px] text-[17px] leading-[1.6] text-[#5f6876]">Exactly-once execution, human approvals, and automatic recovery for every action your agents take. One line in front of any MCP server.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/app" className="inline-flex h-12 items-center rounded-[8px] bg-[#4967f2] px-5 text-[13px] font-semibold text-white transition hover:bg-[#3954d9] active:translate-y-px">See it work</Link>
              <Link href="#product" className="inline-flex h-12 items-center rounded-[8px] border border-[#d9ddd6] bg-transparent px-5 text-[13px] font-semibold text-[#151922] transition hover:border-[#151922] hover:bg-white active:translate-y-px">How it works</Link>
            </div>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>

    <section aria-label="What Revive guarantees" className="border-b border-[#e0e3dd] bg-[#eef0eb]">
      <div className="mx-auto grid max-w-[1380px] divide-y divide-[#dcdfd8] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <GuaranteeCell label="Exactly-once" title="Never runs twice" detail="duplicate calls return the stored result" tone="cobalt" />
        <GuaranteeCell label="Approvals" title="Human in the loop" detail="high-risk actions pause for a yes" tone="warn" />
        <GuaranteeCell label="Recovery" title="Resumes after failure" detail="reconnect the account, continue the run" tone="ok" />
        <GuaranteeCell label="Audit" title="Every action logged" detail="verdict, approval, reconciliation" tone="ink" />
      </div>
    </section>

    <section id="product" className="mx-auto grid max-w-[1380px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:py-36">
      <Reveal className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-[11px] font-semibold text-[#4967f2]">What actually happens</p>
        <h2 className="mt-5 max-w-[520px] text-[clamp(34px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]">When a login dies mid-task, the work shouldn&apos;t die with it.</h2>
        <p className="mt-6 max-w-[430px] text-[14px] leading-6 text-[#697281]">Retrying blind can send the same email twice or charge the same card again. Revive pauses the job safely, brings the right person back, and finishes it — once.</p>
      </Reveal>
      <Stagger className="stage-stack">
        {recoveryStages.map((stage) => <StaggerItem key={stage.title}>
          <article className="stage-row group grid gap-4 py-7 sm:grid-cols-[130px_1fr] sm:py-9">
            <div className="font-mono text-[10px] tracking-[.08em] text-[#7b8491] group-hover:text-[#2e49c8]">{stage.system.toUpperCase()}</div>
            <div><h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#151922]">{stage.title}</h3><p className="mt-2 max-w-[570px] text-[14px] leading-6 text-[#697281]">{stage.body}</p></div>
          </article>
        </StaggerItem>)}
      </Stagger>
    </section>

    <section id="value" className="border-y border-[#e0e3dd] bg-[#eef0eb]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal>
          <p className="text-[11px] font-semibold text-[#4967f2]">What this is worth</p>
          <h2 className="mt-5 max-w-[760px] text-[clamp(34px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]">Every failed action is money on the table. Count yours.</h2>
          <p className="mt-5 max-w-[560px] text-[14px] leading-6 text-[#687180]">Move the sliders to your scale. The math is computed live from your inputs — we don&apos;t invent customer numbers.</p>
        </Reveal>
        <Reveal delay={.06} className="mt-12"><SavingsMath /></Reveal>
        <Reveal delay={.1} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["5 min", "to install: one line in front of the tools your agent already uses"],
            ["0", "code changes — remove the line and Revive is gone"],
            ["1×", "every action runs exactly once, even when everything retries"],
            ["100%", "of actions logged: who did what, what was approved, what was blocked"],
          ].map(([n, body]) => (
            <div key={n} className="border border-[#d9ddd6] bg-[#fbfcf8] p-5">
              <div className="font-mono text-[26px] font-semibold tracking-[-.03em] text-[#2e49c8]">{n}</div>
              <p className="mt-2 text-[11.5px] leading-5 text-[#687180]">{body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>

    <section id="architecture" className="border-y border-[#e0e3dd] bg-[#eef0eb]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal><p className="text-[11px] font-semibold text-[#4967f2]">The recovery contract</p><h2 className="mt-5 max-w-[860px] text-[clamp(38px,5vw,60px)] font-semibold leading-[1.0] tracking-[-0.03em] text-[#151922]">Same run ID.<br />New credential generation.</h2></Reveal>
        <div className="continuity-sheet mt-16 grid overflow-hidden rounded-[14px] border border-[#151922] bg-[#fbfcf8] lg:grid-cols-[1.08fr_.92fr]">
          <Reveal className="relative min-h-[440px] overflow-hidden border-b border-[#d9ddd6] p-7 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="continuity-ruler" aria-hidden="true" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[.1em] text-[#727b89]"><span>LOGICAL EXECUTION</span><span>PROTECTED</span></div>
              <div className="py-16">
                <div className="font-mono text-[clamp(58px,8vw,104px)] font-semibold leading-none tracking-[-.04em] text-[#151922]">run_7f2</div>
                <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-4"><span className="font-mono text-[10px] font-medium text-[#c2413a]">GRANT REJECTED</span><span className="h-px bg-[#cbd0d5]" /><span className="font-mono text-[10px] font-medium text-[#2e49c8]">GENERATION 02</span></div>
              </div>
              <div className="font-mono text-[10px] text-[#737c89]">CHECKPOINT + ACTION KEY PRESERVED</div>
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
      <Reveal><h2 className="max-w-[760px] text-[clamp(34px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]">Built between systems that already do their jobs well.</h2></Reveal>
      <Reveal className="systems-ledger mt-14 border-t border-[#d9ddd6]">
        <SystemRow label="Credential custody" systems="Microsoft Entra, Nango, Auth0" detail="Tokens stay with the identity layer." />
        <SystemRow label="Recovery contract" systems="Revive" detail="Correlates identity, execution and replay evidence." active />
        <SystemRow label="Durable execution" systems="LangGraph, Temporal" detail="The runtime handles checkpointing and scheduling." />
      </Reveal>
    </section>

    <section id="security" className="border-y border-[#e0e3dd]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal>
          <p className="text-[11px] font-semibold text-[#4967f2]">How reauthorization is delivered</p>
          <h2 className="mt-5 max-w-[720px] text-[clamp(34px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]">A single-use link, verified against the same identity.</h2>
          <p className="mt-5 max-w-[620px] text-[14px] leading-6 text-[#687180]">No iframe, no shared password, no session to hijack. The link is a signed, one-time capability that expires in 15 minutes and only completes if the reconnecting account matches the one originally bound to the run.</p>
        </Reveal>
        <Reveal delay={.06} className="mt-14 grid gap-px border border-[#151922] bg-[#151922] sm:grid-cols-3">
          {[
            ["01", "Agent fails", "A credential is rejected mid-run. Revive parks the run at its checkpoint and opens a recovery case."],
            ["02", "Owner reconnects", "The account owner opens a single-use link (email or Slack) and signs in through the provider's own OAuth."],
            ["03", "Run resumes", "Revive verifies the same subject and tenant, rotates the credential lease, and continues the original run once."],
          ].map(([n, title, body]) => (
            <div key={n} className="bg-[#fbfcf8] p-6 sm:p-8">
              <div className="font-mono text-[10px] text-[#2e49c8]">{n}</div>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-.02em] text-[#151922]">{title}</h3>
              <p className="mt-2 text-[12px] leading-6 text-[#687180]">{body}</p>
            </div>
          ))}
        </Reveal>
        <Reveal delay={.1} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["No token custody", "Provider tokens stay in your vault (Nango, Auth0, Entra). Revive never stores raw refresh tokens."],
            ["Identity-verified recovery", "The reconnecting account's subject and tenant must match the run's creation-time binding, or resume is blocked."],
            ["Tenant isolation", "Postgres row-level security, forced and fail-closed, scopes every read and write to one workspace."],
            ["Hashed, scoped keys", "API keys are SHA-256 hashed with constant-time comparison; the control plane is rate-limited per workspace."],
          ].map(([title, body]) => (
            <div key={title} className="border border-[#d9ddd6] bg-[#fbfcf8] p-5">
              <div className="text-[12px] font-semibold text-[#151922]">{title}</div>
              <p className="mt-2 text-[10.5px] leading-5 text-[#687180]">{body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>

    <section className="border-b border-[#e0e3dd] bg-[#eef0eb]">
      <div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32">
        <Reveal><h2 className="max-w-[780px] text-[clamp(34px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]">Add recovery at the action boundary.</h2><p className="mt-5 max-w-[620px] text-[14px] leading-6 text-[#687180]">Use the runtime and credential system already in production. Revive records the contract between them.</p></Reveal>
        <Reveal delay={.06} className="mt-12"><IntegrationPanel /></Reveal>
      </div>
    </section>

    <section id="faq" className="border-y border-[#e0e3dd] bg-[#eef0eb]">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[.65fr_1.35fr] lg:py-28">
        <Reveal><h2 className="text-[clamp(32px,3.4vw,42px)] font-semibold tracking-[-0.03em] text-[#151922]">Clear boundaries.</h2><p className="mt-4 max-w-[300px] text-[14px] leading-6 text-[#687180]">How Revive fits with the infrastructure already running your workflows.</p></Reveal>
        <Reveal delay={.06} className="border-t border-[#d9ddd6]">{faqs.map(([question, answer]) => <details key={question} className="group border-b border-[#dcdfd8] py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-semibold text-[#151922]"><span>{question}</span><span className="font-mono text-[18px] font-normal text-[#737c89] transition group-open:rotate-45 group-open:text-[#2e49c8]">+</span></summary><p className="mt-3 max-w-[680px] pr-10 text-[13px] leading-6 text-[#687180]">{answer}</p></details>)}</Reveal>
      </div>
    </section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-36">
      <Reveal className="relative border-l-[4px] border-[#4967f2] pl-6 sm:pl-10">
        <h2 className="max-w-[880px] text-[clamp(40px,5.2vw,68px)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#151922]">Break the credential.<br />Keep the execution.</h2>
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center"><p className="max-w-[550px] text-[15px] leading-6 text-[#687180]">Run the local fault injection and inspect every recovery transition.</p><Link href="/app" className="inline-flex h-12 w-fit items-center rounded-[8px] bg-[#151922] px-6 text-[13px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Open recovery lab</Link></div>
      </Reveal>
    </section>
  </div>;
}

function GuaranteeCell({ label, title, detail, tone }: { label: string; title: string; detail: string; tone: "cobalt" | "warn" | "ok" | "ink" }) {
  const dot = tone === "cobalt" ? "#4967f2" : tone === "warn" ? "#9a5c15" : tone === "ok" ? "#148060" : "#151922";
  const color = tone === "cobalt" ? "text-[#2e49c8]" : tone === "warn" ? "text-[#9a5c15]" : tone === "ok" ? "text-[#148060]" : "text-[#151922]";
  return <div className="px-5 py-7 sm:px-7"><div className="flex items-center gap-2"><span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} /><span className={`font-mono text-[10px] tracking-[.08em] ${color}`}>{label.toUpperCase()}</span></div><div className="mt-2.5 text-[16px] font-semibold text-[#151922]">{title}</div><div className="mt-1 font-mono text-[10px] leading-4 text-[#7b8491]">{detail}</div></div>;
}

function SystemRow({ label, systems, detail, active = false }: { label: string; systems: string; detail: string; active?: boolean }) {
  return <div className={`grid gap-4 border-b border-[#d9ddd6] px-1 py-6 sm:grid-cols-[190px_1fr_1fr] sm:items-center ${active ? "rounded-[8px] border-b-transparent bg-[#edf0ff] px-5" : ""}`}><div className="font-mono text-[10px] tracking-[.08em] text-[#737c89]">{label.toUpperCase()}</div><div className={`text-[16px] font-semibold ${active ? "text-[#2e49c8]" : "text-[#151922]"}`}>{systems}</div><p className="text-[12px] leading-5 text-[#687180]">{detail}</p></div>;
}
