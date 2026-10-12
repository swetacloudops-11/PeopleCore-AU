"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

type RoleOption = { key: string; name: string };

export default function UserRowActions({
  id,
  name,
  email,
  status,
  roleKey,
  isSelf,
  roles,
  employeeLabel,
}: {
  id: string;
  name: string;
  email: string;
  status: string;
  roleKey: string | null;
  isSelf: boolean;
  roles: RoleOption[];
  employeeLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftRole, setDraftRole] = useState(roleKey ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});

  const suspended = status !== "ACTIVE";

  async function save() {
    setBusy(true);
    setFields({});
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/org/users/${id}`,
      "PATCH",
      { name: draftName, roleKey: draftRole || null }
    );
    setBusy(false);
    if (res.ok) {
      toast.success(`Updated ${email}`);
      setOpen(false);
      router.refresh();
    } else if (res.data?.fields) {
      setFields(res.data.fields);
    }
  }

  async function toggleStatus() {
    const verb = suspended ? "Activate" : "Suspend";
    if (!window.confirm(`${verb} ${email}?${suspended ? "" : " Their sessions will be revoked immediately."}`))
      return;
    setBusy(true);
    const res = await apiCall(`/api/org/users/${id}`, "PATCH", {
      status: suspended ? "ACTIVE" : "SUSPENDED",
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`${verb}ed ${email}`);
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return;
    if (!window.confirm("All their sessions and role assignments will be removed. Continue?"))
      return;
    setBusy(true);
    const res = await apiCall(`/api/org/users/${id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success(`Deleted ${email}`);
      router.refresh();
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        onClick={() => {
          setDraftName(name);
          setDraftRole(roleKey ?? "");
          setFields({});
          setOpen(true);
        }}
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={toggleStatus}
        disabled={busy || isSelf}
        title={isSelf ? "You cannot suspend your own account" : undefined}
        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
          suspended
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            : "border-amber-200 text-amber-700 hover:bg-amber-50"
        }`}
      >
        {suspended ? "Activate" : "Suspend"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy || isSelf}
        title={isSelf ? "You cannot delete your own account" : undefined}
        className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Delete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit user"
        subtitle={`${email}${employeeLabel ? ` · ${employeeLabel}` : ""}`}
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor={`name-${id}`}>
              Name
            </label>
            <input
              id={`name-${id}`}
              className="input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            {fields.name && <p className="mt-1 text-xs text-rose-600">{fields.name}</p>}
          </div>

          <div>
            <label className="label" htmlFor={`role-${id}`}>
              Organisation role
            </label>
            <select
              id={`role-${id}`}
              className="input"
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value)}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
            {fields.roleKey && <p className="mt-1 text-xs text-rose-600">{fields.roleKey}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
