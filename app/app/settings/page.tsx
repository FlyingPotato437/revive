import Link from "next/link";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { ResumeEndpointManager } from "@/components/app/ResumeEndpointManager";
import { ApprovalPolicyEditor } from "@/components/app/ApprovalPolicyEditor";

export const dynamic = "force-dynamic";

export default function WorkspaceSettingsPage() {
  return (
    <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Workspace"
        title="Workspace settings"
        description="Decide which actions wait for people and where verified recoveries return."
        actions={<StatusBadge tone="cobalt">signed callbacks</StatusBadge>}
      />
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Resume endpoint" meta="optional until recovery" />
        <div className="p-5">
          <ResumeEndpointManager />
          <details className="mt-4 border-t border-[#e2e3df] pt-3">
            <summary className="cursor-pointer text-[10px] font-semibold text-[#596273]">How signed recovery callbacks work</summary>
            <p className="mt-2 max-w-[690px] text-[10px] leading-5 text-[#687180]">After the original provider identity is verified, Revive posts the checkpoint and new credential generation to your endpoint. Verify the signature, return 2xx, then resume the saved run.</p>
          </details>
        </div>
      </section>
      <section className="instrument-panel mt-5 overflow-hidden">
        <SectionHeading title="Approval policy" meta="choose when a person decides" action={<Link href="/app/action-contracts" className="text-[9.5px] font-semibold text-[#2e49c8] hover:underline">What Revive recognizes</Link>} />
        <div className="border-b border-[#e2e3df] px-5 py-3 text-[10.5px] leading-5 text-[#687180]">The recommended default pauses high-risk writes. Pending decisions appear in <Link href="/app/approvals" className="font-semibold text-[#2e49c8] hover:underline">Approvals</Link>.</div>
        <ApprovalPolicyEditor />
      </section>
      <details className="mt-5 border border-[#e2e3df] bg-[#f7f8f5] px-4 py-3 text-[#596273]">
        <summary className="cursor-pointer text-[10px] font-semibold">Callback verification details</summary>
        <p className="mt-2 text-[10px] leading-5">Callbacks include webhook-id, webhook-timestamp, and webhook-signature headers. Verify the signature and reply 2xx. The resume test never resumes a run.</p>
      </details>
    </div>
  );
}
