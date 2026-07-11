import Link from "next/link";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";

const actionTypes = [
  ["Detect · free", "Watch existing interrupts. Classify dead runs, blocker mix, wasted tokens and abandoned jobs without contacting users."],
  ["Resolve · paid", "Compress context into smallest ask, deliver secure action to deterministic recipient, validate response resolves blocker."],
  ["Resume · moat", "Check staleness, then resume or replan exact checkpoint with signed callback, generation fencing and replay safety."],
];

const examples = [
  ["Recruiting", "Salary exceeds band", "Compensation owner edits the maximum", "Agent resumes outreach"],
  ["Bookkeeping", "QuickBooks access revoked", "Customer reconnects their account", "Reconciliation continues"],
  ["Travel", "Passenger name conflicts", "Traveler confirms the legal name", "Booking continues"],
  ["Procurement", "Purchase exceeds limit", "Budget owner approves or modifies", "Order resumes once"],
];

const faqs = [
  ["What is free?", "Dead-run detection and analytics. Send terminal run failures and see blocker mix, wasted tokens, reported model cost and recoverable-run rate before resolving anything."],
  ["Is this just approvals?", "No. Approval is one action type. Revive also collects missing information, restores access, verifies uncertain effects, routes permission requests and hands browser steps to users."],
  ["Why not use a workflow engine interrupt?", "LangGraph and Temporal can pause a run. Revive owns the customer-facing request: recipient routing, one-use link, structured response, identity mode, expiry, delivery and signed continuation."],
  ["Does the user need a Revive account?", "Not for secure-link mode. Authenticated mode can require the selected email to sign in when stronger identity proof is needed."],
  ["What prevents a stale run from continuing?", "Each response is bound to the original run, checkpoint and generation. A newer worker generation cannot consume an older response as current."],
  ["What happened to transactions and recovery?", "They remain underneath Revive Actions. Exactly-once writes, reconciliation, outcome contracts and credential recovery protect what happens before and after a person intervenes."],
];

export default function Home() {
  return <div className="revive-home">
    <section className="border-b border-[#e0e3dd]">
      <div className="grid lg:grid-cols-[minmax(0,1.04fr)_minmax(460px,.96fr)] lg:items-stretch">
        <div className="relative flex min-w-0 items-center px-5 py-16 sm:px-8 lg:px-[max(3.5rem,calc((100vw-1380px)/2+2rem))] lg:py-28">
          <div className="hero-intro-content max-w-[650px]">
            <div className="inline-flex items-center gap-2.5 border border-[#151922] bg-[#fbfcf8] px-3 py-2 shadow-[3px_3px_0_rgba(21,25,34,.12)]"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4967f2] opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4967f2]" /></span><span className="font-mono text-[10px] font-medium uppercase tracking-[.1em]">Dead-run recovery for AI agents</span></div>
            <h1 className="mt-6 text-[clamp(44px,5.3vw,70px)] font-semibold leading-[.99] tracking-[-.045em] text-[#151922] text-balance">Recover the agent runs you&apos;re already paying for and losing.</h1>
            <p className="mt-6 max-w-[570px] text-[17px] leading-[1.6] text-[#5f6876]">Revive detects runs that died because they needed a human, gets the right person to fix the blocker, then resumes the exact same run.</p>
            <div className="mt-9 flex flex-wrap gap-3"><Link href="/app/quickstart" className="inline-flex h-12 items-center rounded-[8px] bg-[#4967f2] px-5 text-[13px] font-semibold text-white transition hover:bg-[#3954d9] active:translate-y-px">Install free detector</Link><Link href="/app/detector" className="inline-flex h-12 items-center rounded-[8px] border border-[#d9ddd6] px-5 text-[13px] font-semibold text-[#151922] transition hover:border-[#151922] hover:bg-white active:translate-y-px">Paste a dead trace</Link></div>
            <p className="mt-6 font-mono text-[9px] leading-5 text-[#7b8491]">DETECT FREE · RESOLVE PER ACTION · RESUME OR REPLAN SAFELY</p>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>

    <section aria-label="What Revive guarantees" className="border-b border-[#e0e3dd] bg-[#eef0eb]"><div className="mx-auto grid max-w-[1380px] divide-y divide-[#dcdfd8] sm:grid-cols-4 sm:divide-x sm:divide-y-0"><Guarantee label="Detect" title="See preventable loss" detail="blockers, wasted tokens and abandoned jobs" /><Guarantee label="Resolve" title="Smallest human ask" detail="secure link to deterministic recipient" /><Guarantee label="Validate" title="Prove blocker fixed" detail="Claude assists; schema and auth stay deterministic" /><Guarantee label="Resume" title="Continue exact run" detail="resume, replan or hold for review" /></div></section>

    <section id="product" className="mx-auto grid max-w-[1380px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[.74fr_1.26fr] lg:py-36">
      <Reveal className="lg:sticky lg:top-28 lg:self-start"><p className="text-[11px] font-semibold text-[#4967f2]">Hook, revenue, moat</p><h2 className="mt-5 max-w-[500px] text-[clamp(36px,4.5vw,56px)] font-semibold leading-[1.01] tracking-[-.04em] text-[#151922]">Measure dead runs first. Recover only the ones a person can save.</h2><p className="mt-6 max-w-[440px] text-[14px] leading-6 text-[#687180]">Detector gives solo developer value on day one. Secure resolution turns measured loss into recovered work.</p></Reveal>
      <Stagger className="border-t border-[#151922]">{actionTypes.map(([title, body], index) => <StaggerItem key={title}><article className="group grid gap-4 border-b border-[#d9ddd6] py-9 sm:grid-cols-[58px_160px_1fr] sm:items-start"><span className="font-mono text-[9px] text-[#9aa1aa]">0{index + 1}</span><h3 className="text-[20px] font-semibold tracking-[-.03em] text-[#151922] group-hover:text-[#2e49c8]">{title}</h3><p className="max-w-[520px] text-[13px] leading-6 text-[#687180]">{body}</p></article></StaggerItem>)}</Stagger>
    </section>

    <section className="border-y border-[#e0e3dd] bg-[#eef0eb]"><div className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32"><Reveal><p className="text-[11px] font-semibold text-[#4967f2]">Secure continuity protocol</p><h2 className="mt-5 max-w-[820px] text-[clamp(36px,4.6vw,58px)] font-semibold leading-[1.01] tracking-[-.04em]">A form is easy. Resuming the correct autonomous run is the product.</h2></Reveal><div className="mt-14 grid overflow-hidden border border-[#151922] bg-[#151922] lg:grid-cols-[1.08fr_.92fr]">
      <Reveal className="bg-[#fbfcf8] p-6 sm:p-9"><div className="font-mono text-[9px] tracking-[.1em] text-[#7b8491]">ACTION REQUEST · uar_92hdf3</div><div className="mt-10 grid gap-3">{[["RECIPIENT", "usr_comp_owner_29"], ["RUN", "run_recruiting_4821"], ["CHECKPOINT", "candidate-compensation-review"], ["GENERATION", "8 · current"], ["EXPIRES", "48 hours · single use"]].map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] border-b border-[#d9ddd6] py-3"><span className="font-mono text-[9px] text-[#8a929d]">{label}</span><span className="font-mono text-[11px] text-[#151922]">{value}</span></div>)}</div><div className="mt-8 border-l-[3px] border-[#18724e] bg-[#edf8f2] px-4 py-3 font-mono text-[10px] text-[#345b4b]">RESPONSE VALIDATED → CONTINUATION SIGNED</div></Reveal>
      <Stagger className="grid bg-[#f4f5f1]">{[["Identity-bound", "The request goes to the selected subject. Authenticated mode can enforce the selected email."], ["Replay-safe", "A completed or expired link cannot apply a second response."], ["Generation-fenced", "Responses from superseded workers cannot resume a newer generation."], ["Structured", "Only declared fields and valid options enter the agent context."], ["Auditable", "Request, delivery, actor, response fields and resume acknowledgement stay together."]].map(([title, body]) => <StaggerItem key={title} className="border-b border-[#d9ddd6] last:border-b-0"><div className="p-5 sm:p-6"><h3 className="text-[14px] font-semibold tracking-[-.02em]">{title}</h3><p className="mt-2 text-[11.5px] leading-5 text-[#687180]">{body}</p></div></StaggerItem>)}</Stagger>
    </div></div></section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32"><Reveal><p className="text-[11px] font-semibold text-[#4967f2]">Customer-facing intervention</p><h2 className="mt-5 max-w-[760px] text-[clamp(36px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-.04em]">The person who can unblock the agent is often not on your engineering team.</h2></Reveal><div className="mt-14 overflow-x-auto border-t border-[#151922]"><div className="min-w-[760px]">{examples.map(([agent, blocker, action, outcome]) => <div key={agent} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-5 border-b border-[#d9ddd6] py-5 text-[11.5px] leading-5"><span className="font-semibold text-[#151922]">{agent}</span><span className="text-[#687180]">{blocker}</span><span className="text-[#2e49c8]">{action}</span><span className="text-[#18724e]">{outcome}</span></div>)}</div></div></section>

    <section className="border-y border-[#e0e3dd] bg-[#151922] text-white"><div className="mx-auto grid max-w-[1380px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[.78fr_1.22fr] lg:py-32"><Reveal><p className="text-[11px] font-semibold text-[#93a5ff]">Drop-in detector</p><h2 className="mt-5 max-w-[460px] text-[clamp(34px,4vw,50px)] font-semibold leading-[1.03] tracking-[-.04em]">Point the interrupt you already have at Revive.</h2><p className="mt-5 max-w-[440px] text-[13px] leading-6 text-[#aeb6c2]">Keep LangGraph, Temporal, MCP, Nango and Auth0. Detector observes terminal failures. Resolution starts only when you choose to recover a run.</p></Reveal><Reveal delay={.06} className="overflow-hidden border border-[#3d4653] bg-[#0d1118]"><div className="border-b border-[#3d4653] px-5 py-3 font-mono text-[9px] text-[#808b9a]">interrupt.ts</div><pre className="overflow-x-auto p-5 font-mono text-[11px] leading-6 text-[#d8dde5] sm:p-7"><code>{`const detect = createLangGraphInterruptHandler(revive);

await detect({
  runId: run.id,
  checkpointId: run.checkpoint,
  generation: run.generation,
  failureMessage: error.message,
  trace,
  inputTokens: usage.input,
  outputTokens: usage.output,
  estimatedCostUsd: usage.costUsd,
});`}</code></pre></Reveal></div></section>

    <section id="security" className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-32"><Reveal><p className="text-[11px] font-semibold text-[#4967f2]">Clear product boundary</p><h2 className="mt-5 max-w-[800px] text-[clamp(34px,4.3vw,54px)] font-semibold leading-[1.02] tracking-[-.04em]">Workflow engines pause. Notification tools deliver. Revive completes the human dependency.</h2></Reveal><div className="mt-14 grid gap-px border border-[#151922] bg-[#151922] sm:grid-cols-3">{[["Your runtime", "Owns agent logic, durable execution and checkpoints."], ["Revive", "Owns the request, recipient, secure action, response contract and continuation."], ["Your identity + providers", "Own authentication, credentials and external system truth."]].map(([title, body], index) => <div key={title} className={`${index === 1 ? "bg-[#edf0ff]" : "bg-[#fbfcf8]"} p-6 sm:p-8`}><div className="font-mono text-[9px] text-[#4967f2]">0{index + 1}</div><h3 className="mt-4 text-[17px] font-semibold tracking-[-.025em]">{title}</h3><p className="mt-3 text-[12px] leading-6 text-[#687180]">{body}</p></div>)}</div></section>

    <section id="faq" className="border-y border-[#e0e3dd] bg-[#eef0eb]"><div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[.62fr_1.38fr]"><Reveal><h2 className="text-[clamp(32px,3.5vw,44px)] font-semibold tracking-[-.04em]">Clear answers.</h2><p className="mt-4 max-w-[300px] text-[13px] leading-6 text-[#687180]">Where Revive Actions fits—and where it does not.</p></Reveal><Reveal delay={.05} className="border-t border-[#cfd4ce]">{faqs.map(([question, answer]) => <details key={question} className="group border-b border-[#d9ddd6] py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-semibold"><span>{question}</span><span className="font-mono text-[18px] font-normal text-[#7b8491] transition group-open:rotate-45">+</span></summary><p className="mt-3 max-w-[680px] pr-10 text-[13px] leading-6 text-[#687180]">{answer}</p></details>)}</Reveal></div></section>

    <section className="mx-auto max-w-[1380px] px-5 py-24 sm:px-8 lg:py-36"><Reveal className="border-l-[4px] border-[#4967f2] pl-6 sm:pl-10"><h2 className="max-w-[900px] text-[clamp(42px,5.4vw,70px)] font-semibold leading-[1.0] tracking-[-.045em]">Find out how many paid agent runs die waiting for people.</h2><div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center"><p className="max-w-[560px] text-[15px] leading-6 text-[#687180]">Install free detector. Keep every existing runtime, model and provider.</p><Link href="/app/quickstart" className="inline-flex h-12 w-fit items-center rounded-[8px] bg-[#151922] px-6 text-[13px] font-semibold text-white transition hover:bg-[#2b3340] active:translate-y-px">Install detector</Link></div></Reveal></section>
  </div>;
}

function Guarantee({ label, title, detail }: { label: string; title: string; detail: string }) { return <div className="px-5 py-7 sm:px-7"><div className="flex items-center gap-2"><span className="h-[7px] w-[7px] rounded-full bg-[#4967f2]" /><span className="font-mono text-[10px] tracking-[.08em] text-[#2e49c8]">{label.toUpperCase()}</span></div><div className="mt-2.5 text-[16px] font-semibold">{title}</div><div className="mt-1 font-mono text-[9.5px] leading-4 text-[#7b8491]">{detail}</div></div>; }
