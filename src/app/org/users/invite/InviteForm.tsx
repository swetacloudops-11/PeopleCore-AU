"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type RoleOption = { key: string; name: string };

type InviteResult = {
  name: string;
  email: string;
  role: string;
  tempPassword: string | null;
};

export default function InviteForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState<InviteResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});

    const res = await apiCall<{
      error?: string;
      fields?: Record<string, string>;
      invite?: InviteResult;
    }>("/api/org/users", "POST", {
      name,
      email,
      roleKey: roleKey || null,
      ...(password ? { password } : {}),
    });

    setBusy(false);

    if (res.ok && res.data?.invite) {
      setInvite(res.data.invite);
      toast.success(`Invite created for ${res.data.invite.email}`);
      setName("");
      setEmail("");
      setPassword("");
      router.refresh();
    } else if (res.data?.fields) {
      setFields(res.data.fields);
    }
  }

  function reset() {
    setInvite(null);
  }

  if (invite) {
    return (
      <div className="card overflow-hidden">
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <h2 className="text-sm font-semibold text-emerald-800">Invite ready</h2>
          </div>
          <p className="mt-1 text-xs text-emerald-700">
            Share these details with {invite.name} over a secure channel. The generated password is
            shown only once.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {[
            ["Name", invite.name],
            ["Email", invite.email],
            ["Role", invite.role],
            ["Password", invite.tempPassword ?? "The password you provided"],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-24 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </span>
              <span
                className={`flex-1 text-sm text-slate-800 ${
                  label === "Password" ? "font-mono tracking-wide" : ""
                }`}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" className="btn-primary" onClick={reset}>
            Invite another user
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Create an account</h2>
      <p className="mt-1 text-xs text-slate-500">
        Leave the password blank and we&apos;ll generate a one-time invite password.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="invite-name">
            Full name
          </label>
          <input
            id="invite-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Taylor"
            required
          />
          {fields.name && <p className="mt-1 text-xs text-rose-600">{fields.name}</p>}
        </div>

        <div>
          <label className="label" htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@company.com.au"
            required
          />
          {fields.email && <p className="mt-1 text-xs text-rose-600">{fields.email}</p>}
        </div>

        <div>
          <label className="label" htmlFor="invite-role">
            Organisation role
          </label>
          <select
            id="invite-role"
            className="input"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
          >
            <option value="">No role yet</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          {fields.roleKey && <p className="mt-1 text-xs text-rose-600">{fields.roleKey}</p>}
        </div>

        <div>
          <label className="label" htmlFor="invite-password">
            Password <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            id="invite-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Generate an invite password"
            minLength={10}
          />
          {fields.password && <p className="mt-1 text-xs text-rose-600">{fields.password}</p>}
        </div>
      </div>

      {fields.form && <p className="mt-3 text-xs text-rose-600">{fields.form}</p>}

      <div className="mt-5 flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create invite"}
        </button>
      </div>
    </form>
  );
}
