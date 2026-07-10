import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ConnectionManager } from "@/components/app/ConnectionManager";

export const dynamic = "force-dynamic";

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Recovery"
        title="Connections"
        description="Connect the accounts your agents act as when they need credential recovery."
        actions={<StatusBadge tone="neutral">vault managed</StatusBadge>}
      />
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Workspace connections" meta="verified on recovery" />
        <div className="p-5">
          <ConnectionManager />
        </div>
      </section>
      <details className="mt-5 border border-[#e2e3df] bg-[#f7f8f5] px-4 py-3 text-[#596273]">
        <summary className="cursor-pointer text-[10px] font-semibold">Supported providers and token custody</summary>
        <p className="mt-2 text-[10px] leading-5">Microsoft 365, Gmail, GitHub, and Slack can be connected when configured in your vault. Revive stores an identity binding, not a raw provider token. Custom connectors are marked provisional; Microsoft Entra is the certified recovery path.</p>
      </details>
    </div>
  );
}
