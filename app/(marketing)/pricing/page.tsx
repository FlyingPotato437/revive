import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";

const plans = [
  {
    name: "Dev",
    price: "$10",
    cadence: "per workspace / month",
    description: "For one builder protecting the first real workflow outside the sandbox.",
    features: [
      "3 credential connections",
      "Revive TypeScript SDK",
      "Recovery case timeline",
      "LangGraph and Temporal adapters",
    ],
    cta: "Start Dev",
    href: "/signup?next=%2Fapp%2Fusage",
    featured: false,
  },
  {
    name: "Team",
    price: "$49",
    cadence: "per workspace / month",
    description: "For a team operating credential recovery across production agent runs.",
    features: [
      "25 credential connections",
      "Signed runtime callbacks",
      "Microsoft Graph reconciliation",
      "Workspace roles and audit records",
    ],
    cta: "Start Team",
    href: "/signup?next=%2Fapp%2Fusage",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual contract",
    description: "For controlled deployments with custom infrastructure, providers, and operating requirements.",
    features: [
      "Custom connection limits",
      "Deployment architecture review",
      "Custom provider and runtime work",
      "Security and retention configuration",
    ],
    cta: "Contact us",
    href: "mailto:founders@revivelabs.app?subject=Revive%20Enterprise",
    featured: false,
  },
] as const;

export default function Pricing() {
  return (
    <div className="mx-auto max-w-[1260px] px-5 py-20 sm:px-7 lg:py-28">
      <Reveal className="border-b border-[#151922] pb-12">
        <div className="font-mono text-[9px] tracking-[.14em] text-[#2e49c8]">WORKSPACE PRICING</div>
        <h1 className="mt-6 max-w-[820px] text-[clamp(42px,6.4vw,78px)] font-semibold leading-[.92] tracking-[-.065em] text-[#151922]">Start small. Scale safely.</h1>
        <p className="mt-6 max-w-[580px] text-[13px] leading-6 text-[#66707e]">The sandbox stays free. Paid plans begin when Revive protects a connected workflow.</p>
      </Reveal>

      <Stagger className="mt-12 grid items-stretch gap-3 lg:grid-cols-[.82fr_1.05fr_.92fr] lg:gap-0">
        {plans.map((plan) => (
          <StaggerItem key={plan.name} className={plan.featured ? "lg:-my-3 lg:relative lg:z-[1]" : ""}>
            <article className={`flex h-full min-h-[500px] flex-col border border-[#151922] p-7 sm:p-9 ${plan.featured ? "bg-[#e9ecff] lg:min-h-[548px] lg:p-11" : "bg-[#fbfcf8] lg:border-r-0 last:lg:border-r"}`}>
              <h2 className="text-[17px] font-semibold tracking-[-.035em]">{plan.name}</h2>
              <div className="mt-10">
                <span className={`${plan.name === "Enterprise" ? "text-[clamp(44px,5vw,62px)]" : "text-[clamp(54px,7vw,76px)]"} font-semibold leading-none tracking-[-.07em]`}>{plan.price}</span>
                <div className="mt-2 font-mono text-[8px] tracking-[.08em] text-[#7b8491]">{plan.cadence.toUpperCase()}</div>
              </div>
              <p className="mt-7 max-w-[42ch] text-[11.5px] leading-5 text-[#66707e]">{plan.description}</p>
              <ul className="mt-8 space-y-4 border-t border-[#bfc5cc] pt-7">
                {plan.features.map((feature) => <li key={feature} className="flex items-center gap-3 text-[11px] text-[#4f5866]"><Check size={13} weight="bold" className="shrink-0 text-[#2e49c8]" />{feature}</li>)}
              </ul>
              <Link href={plan.href} className={`mt-auto inline-flex h-11 items-center justify-center border px-5 text-[11px] font-semibold transition active:translate-y-px ${plan.featured ? "border-[#151922] bg-[#151922] text-white hover:bg-[#2b3340]" : "border-[#bfc5cc] bg-[#f4f5f1] text-[#151922] hover:border-[#151922]"}`}>{plan.cta}</Link>
            </article>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal className="mt-10 max-w-[720px] text-[10.5px] leading-5 text-[#687180]">
        All paid plans use Stripe subscriptions. Upgrade, cancellation, invoices, and payment methods stay in Stripe&apos;s billing portal.
      </Reveal>
    </div>
  );
}
