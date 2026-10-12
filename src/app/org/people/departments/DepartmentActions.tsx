"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type DepartmentRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  costCentre: string | null;
};

export function DepartmentActions({ department }: { department?: DepartmentRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: department?.name ?? "",
    code: department?.code ?? "",
    description: department?.description ?? "",
    costCentre: department?.costCentre ?? "",
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      department ? `/api/org/org-units/${department.id}?kind=DEPARTMENT` : "/api/org/org-units",
      department ? "PATCH" : "POST",
      { kind: "DEPARTMENT", ...form }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(department ? "Department updated" : "Department created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={department ? "text-xs font-medium text-slate-600 hover:text-slate-900" : "btn-primary"}
        onClick={() => setOpen(true)}
      >
        {department ? "Edit" : "+ New department"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={department ? `Edit ${department.name}` : "New department"}
        subtitle="Departments group employees for reporting and cost centres."
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {errors.name && <span className="mt-1 block text-[11px] text-rose-600">{errors.name}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Code</span>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. OPS"
              />
            </label>
            <label className="block">
              <span className="label">Cost centre</span>
              <input
                className="input"
                value={form.costCentre}
                onChange={(e) => setForm((f) => ({ ...f, costCentre: e.target.value }))}
                placeholder="e.g. CC-1001"
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Description</span>
            <textarea
              rows={3}
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : department ? "Save changes" : "Create department"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteDepartmentButton({ department }: { department: DepartmentRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete department "${department.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/org/org-units/${department.id}?kind=DEPARTMENT`,
      "DELETE"
    );
    setBusy(false);
    if (!res.ok) return;
    toast.success("Department deleted");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
