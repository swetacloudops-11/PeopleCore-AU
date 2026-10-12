"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Permission = { id: string; key: string; module: string; description: string | null };
type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
};

type Mode = { kind: "create" } | { kind: "edit"; role: Role };

export default function RoleManager({
  permissions,
  showCreate,
}: {
  permissions: Permission[];
  showCreate?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  function openCreate() {
    setName("");
    setKey("");
    setDescription("");
    setSelected(new Set());
    setError(null);
    setFieldErrors({});
    setMode({ kind: "create" });
  }

  function openEdit(r: Role) {
    setName(r.name);
    setKey(r.key);
    setDescription(r.description ?? "");
    setSelected(new Set(r.permissionKeys));
    setError(null);
    setFieldErrors({});
    setMode({ kind: "edit", role: r });
  }

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<Role>).detail;
      if (detail) openEdit(detail);
    };
    window.addEventListener("pc-edit-role", listener);
    return () => window.removeEventListener("pc-edit-role", listener);
  }, []);

  function togglePermission(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleModule(module: string) {
    const perms = grouped[module] ?? [];
    const allOn = perms.every((p) => selected.has(p.key));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (allOn) next.delete(p.key);
        else next.add(p.key);
      }
      return next;
    });
  }

  const activeModule = Object.keys(grouped)[0];
  const [openModule, setOpenModule] = useState<string | null>(null);
  const currentModule = openModule ?? activeModule;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      permissionKeys: Array.from(selected),
      ...(mode?.kind === "create" ? { key: key.trim() } : {}),
    };

    const url = mode?.kind === "edit" ? `/api/roles/${mode.role.id}` : "/api/roles";
    const method = mode?.kind === "edit" ? "PATCH" : "POST";

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      url,
      method,
      payload,
      { silent: true }
    );

    if (res.ok) {
      toast.success(
        mode?.kind === "edit"
          ? `Role updated — ${selected.size} permission(s) granted`
          : "Role created"
      );
      setMode(null);
      router.refresh();
      return;
    }

    if (res.data?.fields) setFieldErrors(res.data.fields);
    setError(res.data?.error ?? "Could not save role");
    setBusy(false);
  }

  const err = (k: string) =>
    fieldErrors[k] ? <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p> : null;

  return (
    <>
      {showCreate && (
        <button type="button" onClick={openCreate} className="btn-primary">
          + New role
        </button>
      )}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode?.kind === "edit" ? `Edit ${mode.role.name}` : "Create role"}
        subtitle="Define which platform capabilities this role grants."
        width="max-w-3xl"
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="r-name">Role name *</label>
              <input
                id="r-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {err("name")}
            </div>
            <div>
              <label className="label" htmlFor="r-key">Key *</label>
              <input
                id="r-key"
                className="input uppercase"
                placeholder="REGIONAL_MANAGER"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={mode?.kind === "edit"}
                required
              />
              {err("key")}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="r-desc">Description</label>
            <input
              id="r-desc"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for"
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-slate-700">
                Permissions{" "}
                <span className="text-slate-400">
                  ({selected.size} of {permissions.length} selected)
                </span>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(permissions.map((p) => p.key)))}
                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2">
              {Object.keys(grouped).map((m) => {
                const perms = grouped[m] ?? [];
                const count = perms.filter((p) => selected.has(p.key)).length;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setOpenModule(m)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      m === currentModule
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {m} · {count}/{perms.length}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {currentModule && (
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={(grouped[currentModule] ?? []).every((p) => selected.has(p.key))}
                    onChange={() => toggleModule(currentModule)}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
                  />
                  Toggle all in {currentModule}
                </label>
              )}
              {(grouped[currentModule] ?? []).map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={() => togglePermission(p.key)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] text-slate-700">
                      {p.description ?? p.key}
                    </span>
                    <code className="text-[11px] text-slate-400">{p.key}</code>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : mode?.kind === "edit" ? "Save changes" : "Create role"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
