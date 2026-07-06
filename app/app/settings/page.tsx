import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ResumeEndpointManager } from "@/components/app/ResumeEndpointManager";

export const dynamic = "force-dynamic";

export default function WorkspaceSettingsPage() {
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Runtime systems"
        title="Workspace settings"
        description="Runtime integration for this workspace. The resume endpoint is the callback Revive signs when an identity-verified case is ready to resume — register it, then confirm signature verification with a test event before a real recovery depends on it."
        actions={<StatusBadge tone="cobalt">signed callbacks</StatusBadge>}
      />
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Resume endpoint" meta="recovery.resume_requested" />
        <div className="p-5">
          <ResumeEndpointManager />
        </div>
      </section>
      <div className="mt-5 border border-[#f0e2c0] bg-[#fdf7e7] p-4 text-[10.5px] leading-5 text-[#7a6224]">
        Callbacks are signed with the shared secret (webhook-id / webhook-timestamp / webhook-signature headers). Verify
        the signature and reply 2xx; the test event carries type <span className="font-mono">recovery.resume_test</span> and
        must not resume anything. Registering and clearing require the admin role.
      </div>
    </div>
  );
}
