"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import type { WorkspaceMember, WorkspaceRole } from "@/lib/rbac";

export function MemberManager({ members, canManage }: { members: WorkspaceMember[]; canManage: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/workspaces/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Could not update member");
    else {
      setEmail("");
      router.refresh();
    }
    setBusy(false);
  }

  async function remove(memberEmail: string) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/workspaces/members", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: memberEmail }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Could not remove member");
    else router.refresh();
    setBusy(false);
  }

  return (
    <div>
      {canManage && (
        <form onSubmit={add} className="grid gap-3 border-b border-[#c7ccd2] p-5 sm:grid-cols-[1fr_150px_auto] sm:items-end">
          <label><span className="mb-1.5 block font-mono text-[8px] tracking-[.1em] text-[#8a929d]">MEMBER EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="operator@company.com" className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]" /></label>
          <label><span className="mb-1.5 block font-mono text-[8px] tracking-[.1em] text-[#8a929d]">ROLE</span><select value={role} onChange={(event) => setRole(event.target.value as Exclude<WorkspaceRole, "owner">)} className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select></label>
          <button disabled={busy} className="h-10 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50">{busy ? "Saving" : "Add member"}</button>
          {error && <p className="text-[10px] text-[#af4039] sm:col-span-3">{error}</p>}
        </form>
      )}
      <div>
        {members.map((member) => (
          <div key={member.email} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-[#e1e5ea] px-5 py-4 last:border-0">
            <div><div className="text-[10.5px] font-semibold">{member.email}</div><div className="mt-1 font-mono text-[8px] text-[#8a929d]">Added {new Date(member.createdAt).toLocaleDateString()}</div></div>
            <span className="border border-[#bfc5cc] bg-[#eef0eb] px-2 py-1 font-mono text-[8px] text-[#596273]">{member.role.toUpperCase()}</span>
            {canManage && member.role !== "owner" ? <button aria-label={`Remove ${member.email}`} onClick={() => remove(member.email)} disabled={busy} className="flex h-8 w-8 items-center justify-center border border-[#bfc5cc] text-[#687180] hover:border-[#af4039] hover:text-[#af4039] disabled:opacity-50"><Trash size={13} /></button> : <span className="h-8 w-8" />}
          </div>
        ))}
      </div>
    </div>
  );
}
