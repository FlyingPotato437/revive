import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ConnectionManager } from "@/components/app/ConnectionManager";

export const dynamic = "force-dynamic";

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Credential systems"
        title="Connections"
        description="Accounts your agents act as. Token custody stays with the credential vault; Revive records the creation-time identity binding and verifies it on every recovery."
        actions={<StatusBadge tone="neutral">nango custody</StatusBadge>}
      />
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Workspace connections" meta="identity bindings" />
        <div className="p-5">
          <ConnectionManager />
        </div>
      </section>
      <div className="mt-5 border border-[#f0e2c0] bg-[#fdf7e7] p-4 text-[10.5px] leading-5 text-[#7a6224]">
        The allowlist of connectable integrations is server-configured (NANGO_ALLOWED_INTEGRATIONS). Microsoft Entra is
        the certified provider today; more vault integrations are open work.
      </div>
    </div>
  );
}
