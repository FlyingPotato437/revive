import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";

const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "for evaluation",
    description: "Prove the recovery contract on one connected account before committing infrastructure budget.",
    features: ["1 credential connection", "100 recovery cases per month", "Action ledger and audit timeline", "Local and hosted sandbox"],
    cta: "Open the lab",
    href: "/app",
    featured: false,
  },
  {
    name: "Pro",
    price: "$199",
    cadence: "per workspace / month",
    description: "Operate credential recovery for a production workflow with durable evidence and higher limits.",
    features: ["25 credential connections", "10,000 recovery cases per month", "Signed runtime callbacks", "Provider reconciliation and priority support"],
    cta: "Start with Pro",
    href: "/signup?next=/app/usage",
    featured: true,
  },
] as const;

export default function Pricing() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-7 lg:py-28">
      <Reveal className="grid gap-8 border-b border-[#151922] pb-12 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
        <div className="font-mono text-[9px] tracking-[.14em] text-[#2e49c8]">PRICING / WORKSPACE</div>
        <div>
          <h1 className="max-w-[760px] text-[clamp(42px,6.4vw,78px)] font-semibold leading-[.92] tracking-[-.065em] text-[#151922]">Pay for the recovery boundary you operate.</h1>
          <p className="mt-6 max-w-[620px] text-[13px] leading-6 text-[#66707e]">Start with one account. Upgrade when Revive protects a real workflow. Billing is monthly through Stripe and can be managed from the console.</p>
        </div>
      </Reveal>

      <Stagger className="mt-10 grid gap-0 border border-[#151922] lg:grid-cols-2">
        {plans.map((plan) => (
          <StaggerItem key={plan.name}>
            <article className={`flex min-h-[520px] flex-col p-7 sm:p-10 lg:p-12 ${plan.featured ? "bg-[#e9ecff] lg:border-l lg:border-[#151922]" : "bg-[#fbfcf8]"}`}>
              <div className="flex items-center justify-between gap-4"><h2 className="text-[15px] font-semibold tracking-[-.03em]">{plan.name}</h2>{plan.featured && <span className="border border-[#4967f2] px-2.5 py-1 font-mono text-[8px] tracking-[.1em] text-[#2e49c8]">PRODUCTION</span>}</div>
              <div className="mt-10"><span className="text-[clamp(54px,8vw,82px)] font-semibold leading-none tracking-[-.07em]">{plan.price}</span><div className="mt-2 font-mono text-[8px] tracking-[.08em] text-[#7b8491]">{plan.cadence.toUpperCase()}</div></div>
              <p className="mt-7 max-w-[48ch] text-[11.5px] leading-5 text-[#66707e]">{plan.description}</p>
              <ul className="mt-8 space-y-4 border-t border-[#bfc5cc] pt-7">{plan.features.map((feature) => <li key={feature} className="flex items-center gap-3 text-[11px] text-[#4f5866]"><Check size={13} weight="bold" className="text-[#2e49c8]" />{feature}</li>)}</ul>
              <Link href={plan.href} className={`mt-auto inline-flex h-11 items-center justify-center border px-5 text-[11px] font-semibold transition active:translate-y-px ${plan.featured ? "border-[#151922] bg-[#151922] text-white hover:bg-[#2b3340]" : "border-[#bfc5cc] bg-[#f4f5f1] text-[#151922] hover:border-[#151922]"}`}>{plan.cta}</Link>
            </article>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal className="mt-8 grid gap-4 border border-[#c7ccd2] bg-[#eef0eb] p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div><div className="text-[12px] font-semibold">Need a design-partner deployment?</div><p className="mt-1 text-[10.5px] leading-5 text-[#687180]">For custom providers, deployment review, or higher limits, scope a pilot around one production recovery path.</p></div>
        <Link href="mailto:founders@revivelabs.app?subject=Revive%20design%20partner" className="text-[10.5px] font-semibold text-[#2e49c8]">Discuss a pilot</Link>
      </Reveal>
    </div>
  );
}
