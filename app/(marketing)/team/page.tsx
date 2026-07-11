import type { Metadata } from "next";
import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/Motion";

export const metadata: Metadata = {
  title: "Team | Revive",
  description: "The founders building credential recovery infrastructure for durable AI agent workflows.",
};

const founders = [
  {
    name: "Srikanth Samy",
    school: "UC Berkeley",
    role: "CEO & Founder",
    initials: "SS",
  },
  {
    name: "Revanth Guda",
    school: "UCLA",
    role: "CTO & Co-Founder",
    initials: "RG",
  },
  {
    name: "Aarush Parekh",
    school: "UC Santa Cruz",
    role: "CMO & Co-Founder",
    initials: "AP",
  },
];

export default function TeamPage() {
  return (
    <div className="bg-[#f4f5f1] text-[#151922]">
      <section className="border-b border-[#151922]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
          <Reveal>
            <p className="text-[11px] font-semibold text-[#4967f2]">Revive Labs · Team</p>
            <h1 className="mt-5 max-w-[900px] text-[clamp(42px,6vw,72px)] font-semibold leading-[.94] tracking-[-.065em]">
              Built by operators who have seen workflows fail at scale.
            </h1>
            <p className="mt-7 max-w-[720px] text-[15px] leading-7 text-[#5f6876]">
              Revive Labs is a team of three founders from UC Berkeley, UCLA, and UC Santa Cruz building the recovery
              layer between credential providers and durable agent runtimes.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <h2 className="max-w-[700px] text-[36px] font-semibold leading-[1] tracking-[-.05em]">Founders</h2>
          <p className="mt-4 max-w-[620px] text-[13px] leading-6 text-[#687180]">
            Three engineers and operators focused on the gap between credential failure and workflow recovery.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid border border-[#151922] bg-[#fbfcf8] lg:grid-cols-3">
          {founders.map((founder, index) => (
            <StaggerItem key={founder.name}>
              <article
                className={`h-full border-b border-[#c8cdd2] p-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${index === 0 ? "bg-[#edf0ff]" : ""}`}
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border border-[#151922] text-[14px] font-semibold tracking-[-.02em] ${index === 0 ? "bg-[#4967f2] text-white" : "bg-[#eef0eb] text-[#151922]"}`}
                  aria-hidden
                >
                  {founder.initials}
                </div>
                <h3 className="mt-6 text-[18px] font-semibold tracking-[-.03em]">{founder.name}</h3>
                <div className="mt-1 font-mono text-[8.5px] tracking-[.08em] text-[#7b8491]">{founder.school}</div>
                <div className={`mt-4 text-[12px] font-semibold ${index === 0 ? "text-[#2e49c8]" : "text-[#151922]"}`}>
                  {founder.role}
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="border-t border-[#151922] bg-[#eef0eb]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
          <Reveal className="grid gap-8 border border-[#151922] bg-[#fbfcf8] p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="max-w-[720px] text-[34px] font-semibold leading-[1] tracking-[-.045em]">
                Talk to the founders.
              </h2>
              <p className="mt-4 max-w-[620px] text-[12px] leading-6 text-[#687180]">
                For partnerships, architecture reviews, or early access to the recovery control plane.
              </p>
            </div>
            <Link
              href="mailto:founders@revivelabs.app"
              className="inline-flex h-11 w-fit items-center border border-[#151922] bg-[#151922] px-5 text-[11px] font-semibold text-white active:translate-y-px"
            >
              founders@revivelabs.app
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
