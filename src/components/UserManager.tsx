"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Role = { key: string; name: string };
type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  roleKey: string | null;
};

export default function UserManager({
  roles,
  currentUserId,
}: {
  roles: Role[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", roleKey: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", roleKey: roles[0]?.key ?? "" });
    setError(null);
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", roleKey: u.roleKey ?? "" });
    setError(null);
    setFieldErrors({});
    setOpen(true);
  }

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<User>).detail;
      if (detail) openEdit(detail);
    };
    window.addEventListener("pc-edit-user", listener);
    return () => window.removeEventListener("pc-edit-user", listener);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      editing ? `/api/users/${editing.id}` : "/api/users",
      editing ? "PATCH" : "POST",
      editing
        ? { name: form.name.trim(), roleKey: form.roleKey || null }
        : {
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            roleKey: form.roleKey || undefined,
          },
      { silent: true }
    );

    if (res.ok) {
      toast.success(editing ? "User updated" : "User created");
      setOpen(false);
      router.refresh();
      return;
    }

    if (res.data?.fields) setFieldErrors(res.data.fields);
    setError(res.data?.error ?? "Could not save user");
    setBusy(false);
  }

  const err = (k: string) =>
    fieldErrors[k] ? <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p> : null;

  return (
    <>
      <button type="button" onClick={openCreate} className="btn-primary">
        + Add user
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add console user"}
        subtitle={
          editing
            ? "Change the display name or assigned role."
            : "Create credentials for another platform administrator."
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="u-name">Full name *</label>
            <input
              id="u-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {err("name")}
          </div>

          <div>
            <label className="label" htmlFor="u-email">Email *</label>
            <input
              id="u-email"
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={!!editing}
              placeholder="name@jabit.com"
              required={!editing}
            />
            {err("email")}
            {editing && (
              <p className="mt-1 text-[11px] text-slate-400">Email cannot be changed.</p>
            )}
          </div>

          {!editing && (
            <div>
              <label className="label" htmlFor="u-pass">Temporary password *</label>
              <input
                id="u-pass"
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Minimum 10 characters"
                autoComplete="new-password"
                required
              />
              {err("password")}
            </div>
          )}

          <div>
            <label className="label" htmlFor="u-role">Role</label>
            <select
              id="u-role"
              className="input"
              value={form.roleKey}
              onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value }))}
            >
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : editing ? "Save changes" : "Create user"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <UserActionsBridge currentUserId={currentUserId} />
    </>
  );
}

/** Separate child so the bridge re-mounts with a stable handler identity. */
function UserActionsBridge({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();

  useEffect(() => {
    const listener = async (e: Event) => {
      const detail = (e as CustomEvent<User>).detail;
      if (!detail) return;

      if (detail.id === currentUserId) {
        toast.error("You cannot modify your own account here");
        return;
      }

      const next = detail.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      const prompt =
        next === "SUSPENDED"
          ? `Suspend ${detail.email}?\n\nTheir sessions are revoked immediately.`
          : `Re-activate ${detail.email}?`;

      if (!window.confirm(prompt)) return;

      const res = await apiCall(`/api/users/${detail.id}`, "PATCH", { status: next });
      if (res.ok) {
        toast.success(next === "SUSPENDED" ? "User suspended" : "User re-activated");
        router.refresh();
      }
    };
    window.addEventListener("pc-toggle-user", listener);
    return () => window.removeEventListener("pc-toggle-user", listener);
  }, [currentUserId, router]);

  return null;
}
