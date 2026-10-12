"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";
import { Badge, TableWrap } from "@/components/ui";

type RoleDto = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissionCount: number;
  permissionKeys: string[];
};

type PermissionGroup = {
  module: string;
  permissions: Array<{ key: string; description: string | null }>;
};

type Draft = { mode: "create" | "edit"; role?: RoleDto };

export default function RoleManager({
  roles,
  permissionGroups,
}: {
  roles: RoleDto[];
  permissionGroups: PermissionGroup[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  function openCreate() {
    setDraft({ mode: "create" });
    setName("");
    setDescription("");
    setSelected([]);
    setFields({});
  }

  function openEdit(role: RoleDto) {
    setDraft({ mode: "edit", role });
    setName(role.name);
    setDescription(role.description ?? "");
    setSelected(role.permissionKeys);
    setFields({});
  }

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleModule(module: string, keys: string[]) {
    setSelected((prev) => {
      const allIn = keys.every((k) => prev.includes(k));
      if (allIn) return prev.filter((k) => !keys.includes(k));
      return Array.from(new Set([...prev, ...keys]));
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setFields({});

    const body = {
      name,
      description: description || null,
      permissionKeys: selected,
    };
    const res =
      draft.mode === "create"
        ? await apiCall<{ fields?: Record<string, string>; error?: string }>(
            "/api/org/org-roles",
            "POST",
            body
          )
        : await apiCall<{ fields?: Record<string, string>; error?: string }>(
            `/api/org/org-roles/${draft.role!.id}`,
            "PATCH",
            body
          );

    setBusy(false);
    if (res.ok) {
      toast.success(draft.mode === "create" ? "Role created" : "Role updated");
      setDraft(null);
      router.refresh();
    } else if (res.data?.fields) {
      setFields(res.data.fields);
    }
  }

  async function remove(role: RoleDto) {
    if (!window.confirm(`Delete the role '${role.name}'?`)) return;
    const res = await apiCall(`/api/org/org-roles/${role.id}`, "DELETE");
    if (res.ok) {
      toast.success(`Deleted '${role.name}'`);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Roles are scoped to this organisation. Deleting is blocked while members are assigned or
          for built-in system roles.
        </p>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + New role
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="card grid place-items-center px-6 py-12 text-center">
          <div className="mb-2 text-2xl">🛡️</div>
          <p className="text-sm font-medium text-slate-700">No roles yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Create a role to control what each group of users can see and do.
          </p>
        </div>
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Role</th>
              <th className="th">Description</th>
              <th className="th">Members</th>
              <th className="th">Permissions</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{r.name}</span>
                    {r.isSystem && <Badge tone="purple">SYSTEM</Badge>}
                  </div>
                  <code className="text-[11px] text-slate-400">{r.key}</code>
                </td>
                <td className="td max-w-[280px] text-slate-500">{r.description ?? "—"}</td>
                <td className="td">
                  <Badge tone={r.memberCount ? "blue" : "slate"}>{r.memberCount}</Badge>
                </td>
                <td className="td">
                  <Badge tone={r.permissionCount ? "green" : "slate"}>
                    {r.permissionCount} granted
                  </Badge>
                </td>
                <td className="td">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={r.isSystem || r.memberCount > 0}
                      title={
                        r.isSystem
                          ? "System roles cannot be deleted"
                          : r.memberCount > 0
                          ? "Reassign members first"
                          : undefined
                      }
                      className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.mode === "edit" ? `Edit ${draft.role?.name}` : "Create role"}
        subtitle={`${selected.length} of ${permissionGroups.reduce((n, g) => n + g.permissions.length, 0)} permissions selected`}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="role-name">
                Name
              </label>
              <input
                id="role-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Payroll Officer"
              />
              {fields.name && <p className="mt-1 text-xs text-rose-600">{fields.name}</p>}
            </div>
            <div>
              <label className="label" htmlFor="role-desc">
                Description
              </label>
              <input
                id="role-desc"
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this role is for"
              />
              {fields.description && (
                <p className="mt-1 text-xs text-rose-600">{fields.description}</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Permissions</span>
              <button
                type="button"
                className="text-xs text-indigo-600 hover:underline"
                onClick={() =>
                  setSelected(
                    selected.length ===
                      permissionGroups.reduce((n, g) => n + g.permissions.length, 0)
                      ? []
                      : permissionGroups.flatMap((g) => g.permissions.map((p) => p.key))
                  )
                }
              >
                {selected.length ? "Clear all" : "Select all"}
              </button>
            </div>

            <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {permissionGroups.map((g) => {
                const keys = g.permissions.map((p) => p.key);
                const allIn = keys.every((k) => selected.includes(k));
                return (
                  <div key={g.module}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {g.module}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] text-indigo-600 hover:underline"
                        onClick={() => toggleModule(g.module, keys)}
                      >
                        {allIn ? "None" : "All"}
                      </button>
                    </div>
                    <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                      {g.permissions.map((p) => (
                        <label
                          key={p.key}
                          className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-indigo-600"
                            checked={selected.includes(p.key)}
                            onChange={() => toggle(p.key)}
                          />
                          <span>
                            <span className="block font-medium text-slate-700">
                              {p.description ?? p.key}
                            </span>
                            <code className="text-[10px] text-slate-400">{p.key}</code>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : draft?.mode === "edit" ? "Save changes" : "Create role"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
