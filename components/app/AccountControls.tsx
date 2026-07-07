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

export function ApiKeyManager({ keys, projects }: {
  keys: Array<{ id: string; name: string; prefix: string; createdAt: number; expiresAt?: number; revokedAt?: number; projectId: string; role: "viewer" | "operator" | "admin" }>;
  projects: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [role, setRole] = useState<"viewer" | "operator" | "admin">("operator");
  const [error, setError] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError(""); setRevealed("");
    const response = await fetch("/api/workspaces/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, projectId, role, expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || "Could not create API key");
    setName(""); setRevealed(payload.key); router.refresh();
  }
  async function revoke(keyId: string) {
    const response = await fetch("/api/workspaces/api-keys", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId }) });
    if (response.ok) router.refresh();
  }
  return <div>
    <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_140px_auto] lg:items-end"><Field label="Key name" value={name} onChange={setName} placeholder="Production SDK" /><label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">Project</span><select required value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">Role</span><select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select></label><label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">Expires</span><select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="never">No expiration</option></select></label><button disabled={!projectId} className="h-10 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white disabled:opacity-50">Create API key</button></form>
    {error && <p className="mt-3 text-[10px] text-[#af4039]">{error}</p>}
    {revealed && <div className="mt-4 border border-[#4967f2] bg-[#edf0ff] p-4"><div className="text-[10.5px] font-semibold text-[#2e49c8]">Copy this key now. It is stored only as a SHA-256 hash.</div><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto border border-[#c7cff9] bg-[#fbfcf8] px-3 py-2 font-mono text-[9px]">{revealed}</code><button type="button" onClick={() => navigator.clipboard.writeText(revealed)} className="border border-[#151922] px-3 text-[9.5px] font-semibold">Copy</button></div></div>}
    <div className="mt-5 border-t border-[#d8dde3]">{keys.length ? keys.map((key) => { const expired = Boolean(key.expiresAt && key.expiresAt <= Date.now()); const project = projects.find((item) => item.id === key.projectId); return <div key={key.id} className="grid gap-2 border-b border-[#e1e5ea] py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[10.5px] font-semibold">{key.name}</span><span className="border border-[#c7cff9] bg-[#edf0ff] px-1.5 py-0.5 font-mono text-[7.5px] uppercase text-[#3f55b5]">{key.role}</span></div><div className="mt-1 font-mono text-[8px] text-[#8a929d]">{key.prefix}... · {project?.name || key.projectId}</div></div><div className="text-[9px] leading-4 text-[#687180]"><div>Created {new Date(key.createdAt).toLocaleDateString()}</div><div>{key.expiresAt ? `Expires ${new Date(key.expiresAt).toLocaleDateString()}` : "No expiration"}</div></div>{key.revokedAt ? <span className="text-[9px] font-semibold text-[#af4039]">Revoked</span> : expired ? <span className="text-[9px] font-semibold text-[#af4039]">Expired</span> : <button onClick={() => revoke(key.id)} className="text-left text-[9px] font-semibold text-[#af4039] sm:text-right">Revoke</button>}</div>; }) : <p className="py-6 text-[10.5px] text-[#687180]">No API keys have been created for this workspace.</p>}</div>
  </div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-1.5 block text-[9.5px] font-semibold text-[#596273]">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full border border-[#bfc5cc] bg-[#fbfcf8] px-3 text-[11px] outline-none focus:border-[#4967f2]" /></label>;
}
