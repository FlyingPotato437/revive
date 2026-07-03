import { cookies } from "next/headers";
import { PageHeader, SectionHeading, StatusBadge } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export default async function AccountPage() {
  const jar = await cookies(); const session = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const mode = session.authMode === "clerk" ? "Clerk hosted SSO" : session.authMode === "sandbox" ? "Sandbox access" : "Password";
  return <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8"><PageHeader eyebrow="Account" title="Profile" description="The identity currently authorized to access this Revive console." actions={<StatusBadge tone={session.authMode === "clerk" ? "ok" : "neutral"}>{mode}</StatusBadge>} /><section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Account identity" /><Row label="Email" value={session.email} mono /><Row label="Session" value="HMAC-signed, 7-day expiry" /><Row label="Authentication mode" value={mode} /></section><div className="mt-5 border border-[#ead9ba] bg-[#fff7e8] p-4 text-[10.5px] leading-5 text-[#7a551e]">Workspace roles are enforced in Revive. MFA policy, SCIM provisioning, and SSO domain rules must still be configured and tested in the hosted identity tenant before an enterprise pilot.</div></div>;
}
function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="grid gap-2 border-b border-[#e1e5ea] px-5 py-4 last:border-0 sm:grid-cols-[180px_1fr]"><span className="text-[10px] text-[#687180]">{label}</span><span className={`text-[10.5px] font-medium ${mono ? "font-mono" : ""}`}>{value}</span></div>; }
