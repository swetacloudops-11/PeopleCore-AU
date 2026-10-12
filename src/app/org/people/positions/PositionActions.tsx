"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; name: string };

export type PositionRow = {
  id: string;
  title: string;
  code: string | null;
  level: number;
  description: string | null;
  departmentId: string | null;
};

export function PositionActions({
  position,
  departments,
}: {
  position?: PositionRow;
  departments: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: position?.title ?? "",
    code: position?.code ?? "",
    level: String(position?.level ?? 1),
    description: position?.description ?? "",
    departmentId: position?.departmentId ?? "",
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      position ? `/api/org/org-units/${position.id}?kind=POSITION` : "/api/org/org-units",
      position ? "PATCH" : "POST",
      {
        kind: "POSITION",
        title: form.title,
        code: form.code,
        level: Number(form.level) || 1,
        description: form.description,
        departmentId: form.departmentId,
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(position ? "Position updated" : "Position created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={position ? "text-xs font-medium text-slate-600 hover:text-slate-900" : "btn-primary"}
        onClick={() => setOpen(true)}
      >
        {position ? "Edit" : "+ New position"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={position ? `Edit ${position.title}` : "New position"}
        subtitle="Positions define roles employees are hired into."
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Title</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            {errors.title && <span className="mt-1 block text-[11px] text-rose-600">{errors.title}</span>}
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">Code</span>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. SUP-1"
              />
            </label>
            <label className="block">
              <span className="label">Level (1–10)</span>
              <input
                type="number"
                min={1}
                max={10}
                className="input"
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="label">Department</span>
              <select
                className="input"
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {errors.departmentId && (
                <span className="mt-1 block text-[11px] text-rose-600">{errors.departmentId}</span>
              )}
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
              {busy ? "Saving…" : position ? "Save changes" : "Create position"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeletePositionButton({ position }: { position: PositionRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete position "${position.title}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/org/org-units/${position.id}?kind=POSITION`,
      "DELETE"
    );
    setBusy(false);
    if (!res.ok) return;
    toast.success("Position deleted");
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
