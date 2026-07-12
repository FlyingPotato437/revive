import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Clock, FingerprintSimple, Path } from "@phosphor-icons/react/dist/ssr";
import { UserActionForm } from "@/components/actions/UserActionForm";
import { getUserActionRequestByToken, toPublicUserAction } from "@/lib/action-requests";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UserActionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await getUserActionRequestByToken(token);
  if (!request) notFound();
  if (request.identityMode === "authenticated") {
    const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
    if (session?.email.toLowerCase() !== request.recipient.email) redirect(`/login?next=${encodeURIComponent(`/actions/${token}`)}`);
  }
  const publicRequest = toPublicUserAction(request);
  const context = Object.entries(publicRequest.context).slice(0, 8);
  return <main className="min-h-[100dvh] bg-[#eef0eb] text-[#151922]">
    <div className="mx-auto flex min-h-[100dvh] max-w-[1180px] flex-col px-5 py-6 sm:px-8 sm:py-9">
      <header className="flex items-center justify-between border-b border-[#151922] pb-5">
        <Link href="/" className="flex items-center gap-3"><span className="revive-mark" aria-hidden><span className="revive-mark-ring" /><span className="revive-mark-core" /></span><span className="text-[15px] font-semibold tracking-[-.035em]">Revive</span></Link>
        <span className="font-mono text-[8px] tracking-[.12em] text-[#687180]">SECURE USER ACTION</span>
      </header>
      <div className="grid flex-1 gap-10 py-10 lg:grid-cols-[.82fr_1.18fr] lg:items-start lg:gap-16 lg:py-16">
        <section>
          <div className="text-[10px] font-semibold text-[#2e49c8]">{publicRequest.actionType.replaceAll("_", " ").toUpperCase()}</div>
          <h1 className="mt-4 max-w-[520px] text-[clamp(34px,4.6vw,58px)] font-semibold leading-[1.02] tracking-[-.05em] text-balance">{publicRequest.title}</h1>
          <p className="mt-5 max-w-[520px] text-[14px] leading-6 text-[#596273]">{publicRequest.description || "This agent is paused until you complete the requested action."}</p>
          <div className="mt-8 border-y border-[#cbd0ca] py-4">
            <Fact icon={FingerprintSimple} label="Requested recipient" value={publicRequest.recipientHint} />
            <Fact icon={Path} label="Paused run" value={`${publicRequest.runId}${publicRequest.checkpointId ? ` / ${publicRequest.checkpointId}` : ""}`} />
            <Fact icon={Clock} label="Continuity" value={`Generation ${publicRequest.generation} · stale runs blocked`} />
          </div>
          {context.length > 0 && <div className="mt-8"><h2 className="font-mono text-[9px] tracking-[.1em] text-[#7b8491]">CONTEXT FROM THE AGENT</h2><dl className="mt-3 border-t border-[#cbd0ca]">{context.map(([key, value]) => <div key={key} className="grid grid-cols-[120px_1fr] gap-4 border-b border-[#d7dbd5] py-3"><dt className="font-mono text-[8.5px] text-[#7b8491]">{key.replaceAll("_", " ").toUpperCase()}</dt><dd className="break-words text-[11px] leading-5 text-[#333943]">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></div>}
        </section>
        <UserActionForm token={token} initial={publicRequest} />
      </div>
      <footer className="border-t border-[#cbd0ca] pt-4 text-[9px] leading-5 text-[#7b8491]">Revive binds this response to one recipient, run, checkpoint and generation. The link expires and cannot complete twice.</footer>
    </div>
  </main>;
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return <div className="grid grid-cols-[18px_120px_1fr] items-start gap-2 py-2"><Icon size={14} className="mt-0.5 text-[#4967f2]" /><span className="text-[10px] text-[#7b8491]">{label}</span><span className="break-all font-mono text-[9px] text-[#333943]">{value}</span></div>;
}
