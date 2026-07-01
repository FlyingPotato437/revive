"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WorkspaceCreator() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, organization }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(payload.error || "Could not create workspace");
    setName(""); setOrganization(""); router.refresh();
  }
  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field label="Workspace name" value={name} onChange={setName} placeholder="production" /><Field label="Organization" value={organization} onChange={setOrganization} placeholder="Your company" /><button disabled={busy} className="h-10 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50">{busy ? "Creating" : "Create workspace"}</button>{error && <p className="text-[10px] text-[#af4039] sm:col-span-3">{error}</p>}</form>;
}

export function ProjectCreator() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/workspaces/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || "Could not create project");
    setName(""); router.refresh();
  }
  return <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Project name" value={name} onChange={setName} placeholder="Customer support agent" /></div><button className="h-10 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white">Create project</button>{error && <p className="text-[10px] text-[#af4039]">{error}</p>}</form>;
}

export function ApiKeyManager({ keys }: { keys: Array<{ id: string; name: string; prefix: string; createdAt: number; revokedAt?: number }> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState("");
  const [error, setError] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError(""); setRevealed("");
    const response = await fetch("/api/workspaces/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || "Could not create API key");
    setName(""); setRevealed(payload.key); router.refresh();
  }
  async function revoke(keyId: string) {
    const response = await fetch("/api/workspaces/api-keys", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId }) });
    if (response.ok) router.refresh();
  }
  return <div>
    <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Key name" value={name} onChange={setName} placeholder="Local SDK" /></div><button className="h-10 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white">Create API key</button></form>
    {error && <p className="mt-3 text-[10px] text-[#af4039]">{error}</p>}
    {revealed && <div className="mt-4 border border-[#4967f2] bg-[#edf0ff] p-4"><div className="text-[10.5px] font-semibold text-[#2e49c8]">Copy this key now. It is stored only as a SHA-256 hash.</div><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto border border-[#c7cff9] bg-[#fbfcf8] px-3 py-2 font-mono text-[9px]">{revealed}</code><button type="button" onClick={() => navigator.clipboard.writeText(revealed)} className="border border-[#151922] px-3 text-[9.5px] font-semibold">Copy</button></div></div>}
    <div className="mt-5 border-t border-[#d8dde3]">{keys.length ? keys.map((key) => <div key={key.id} className="grid gap-2 border-b border-[#e1e5ea] py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><div className="text-[10.5px] font-semibold">{key.name}</div><div className="mt-1 font-mono text-[8px] text-[#8a929d]">{key.prefix}...</div></div><div className="text-[9px] text-[#687180]">Created {new Date(key.createdAt).toLocaleDateString()}</div>{key.revokedAt ? <span className="text-[9px] font-semibold text-[#af4039]">Revoked</span> : <button onClick={() => revoke(key.id)} className="text-left text-[9px] font-semibold text-[#af4039] sm:text-right">Revoke</button>}</div>) : <p className="py-6 text-[10.5px] text-[#687180]">No API keys have been created for this workspace.</p>}</div>
  </div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]" /></label>;
}
