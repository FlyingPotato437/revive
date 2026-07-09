import { PageHeader, SectionHeading } from "@/components/app/ConsolePrimitives";
import { ApprovalsPanel } from "@/components/app/ApprovalsPanel";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Operations"
        title="Approvals"
        description="High-risk agent actions pause here until a human decides. Approved actions run exactly once; denied actions never run."
      />
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Inbox" meta="pending first" />
        <ApprovalsPanel />
      </section>
    </div>
  );
}
