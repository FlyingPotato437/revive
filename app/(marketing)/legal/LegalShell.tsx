import Link from "next/link";
import type { ReactNode } from "react";

// Shared editorial frame for legal documents: same paper surface and column
// as the marketing pages, readable measure, section anchors.
export function LegalShell({
  title, updated, intro, children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-20 sm:px-8 lg:py-28">
      <div className="font-mono text-[9px] tracking-[.14em] text-[#2e49c8]">REVIVE LABS · LEGAL</div>
      <h1 className="mt-5 text-[clamp(34px,5vw,56px)] font-semibold leading-[.98] tracking-[-.05em] text-[#151922]">{title}</h1>
      <p className="mt-4 font-mono text-[10px] tracking-[.06em] text-[#7b8491]">LAST UPDATED {updated}</p>
      <p className="mt-8 max-w-[62ch] text-[14px] leading-7 text-[#4f5866]">{intro}</p>
      <div className="legal-body mt-12 space-y-10">{children}</div>
      <div className="mt-16 border-t border-[#cbd0d5] pt-6 text-[11px] leading-6 text-[#687180]">
        Questions? <Link href="mailto:founders@revivelabs.app" className="font-semibold text-[#2e49c8]">founders@revivelabs.app</Link>.
        See also our <Link href="/terms" className="font-semibold text-[#2e49c8]">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-[#2e49c8]">Privacy Policy</Link>.
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-semibold tracking-[-.02em] text-[#151922]">{heading}</h2>
      <div className="mt-3 space-y-3 text-[13px] leading-7 text-[#4f5866]">{children}</div>
    </section>
  );
}
