import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ResumeEndpointManager } from "@/components/app/ResumeEndpointManager";
import { ApprovalPolicyEditor } from "@/components/app/ApprovalPolicyEditor";

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
        <div className="grid border-b border-[#e2e3df] sm:grid-cols-3">
          {[
            ["01", "Identity verified", "Revive confirms the returning provider subject and tenant."],
            ["02", "Signed callback", "Revive posts the saved checkpoint and new lease generation to your endpoint."],
            ["03", "Runtime acknowledges", "Your worker resumes that checkpoint and returns 2xx; Revive advances the case."],
          ].map(([step, title, detail]) => <div key={step} className="border-b border-[#e2e3df] p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="font-mono text-[8px] text-[#4967f2]">{step}</div><div className="mt-1.5 text-[10.5px] font-semibold text-[#151922]">{title}</div><p className="mt-1 text-[9.5px] leading-4 text-[#737c89]">{detail}</p></div>)}
        </div>
        <div className="p-5">
          <ResumeEndpointManager />
        </div>
      </section>
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Approval policy" meta="you decide which actions pause" />
        <div className="border-b border-[#e2e3df] px-5 py-3 text-[10.5px] leading-5 text-[#687180]">
          High-risk agent actions can pause for a human before they run. Choose which actions require approval
          for this workspace — pending ones land in <span className="font-mono text-[10px]">Approvals</span>. Changing
          the policy needs the admin role.
        </div>
        <ApprovalPolicyEditor />
      </section>
      <div className="mt-5 border border-[#f0e2c0] bg-[#fdf7e7] p-4 text-[10.5px] leading-5 text-[#7a6224]">
        Callbacks are signed with the shared secret (webhook-id / webhook-timestamp / webhook-signature headers). Verify
        the signature and reply 2xx; the test event carries type <span className="font-mono">recovery.resume_test</span> and
        must not resume anything. Registering and clearing require the admin role.
      </div>
    </div>
  );
}
