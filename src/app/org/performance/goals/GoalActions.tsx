"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

const STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "AT_RISK",
  "COMPLETED",
  "CANCELLED",
] as const;

/** Update progress / status (and delete) for a goal. */
export default function GoalRowActions({
  id,
  progress,
  status,
  dueDate,
}: {
  id: string;
  progress: number;
  status: string;
  dueDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({
    progress: String(progress),
    status,
    dueDate,
  });

  const save = async () => {
    const pct = Number(form.progress);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Progress must be between 0 and 100");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/goals/${id}`, "PATCH", {
      progress: Math.round(pct),
      status: form.status,
      dueDate: form.dueDate || undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Goal updated");
      setOpen(false);
      setConfirming(false);
      router.refresh();
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/goals/${id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success("Goal deleted");
      setOpen(false);
      setConfirming(false);
      router.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-secondary !px-2 !py-1 text-[11px]"
        onClick={() => setOpen(true)}
      >
        Update
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Update goal"
        subtitle="Adjust progress, status or the due date."
      >
        <div className="space-y-4">
          <div>
            <label className="label">Progress (%)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
                className="flex-1 accent-indigo-600"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
                className="input !w-20 text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {!confirming ? (
              <button
                type="button"
                className="btn-danger !py-1.5 text-xs"
                onClick={() => setConfirming(true)}
              >
                Delete goal
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-600">Delete permanently?</span>
                <button
                  type="button"
                  className="btn-danger !py-1.5 text-xs"
                  disabled={busy}
                  onClick={remove}
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="btn-secondary !py-1.5 text-xs"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

const CATEGORIES = ["Performance", "Development", "Compliance", "Team", "Sales", "Safety"];

/** "New goal" button + create modal. */
export function NewGoalButton({
  employees,
  defaultEmployeeId,
}: {
  employees: Array<{ id: string; name: string }>;
  defaultEmployeeId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    employeeId: defaultEmployeeId ?? "",
    title: "",
    description: "",
    category: "Performance",
    status: "NOT_STARTED",
    progress: "0",
    dueDate: "",
  });

  const submit = async () => {
    if (!form.employeeId) {
      toast.error("Select an employee");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Goal title is required");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/org/goals", "POST", {
      employeeId: form.employeeId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      status: form.status,
      progress: Number(form.progress) || 0,
      dueDate: form.dueDate || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Goal created");
      setOpen(false);
      setForm((f) => ({ ...f, title: "", description: "", dueDate: "" }));
      router.refresh();
    }
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New goal
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create goal"
        subtitle="Goals show up on the employee performance overview."
        width="max-w-xl"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Employee</label>
            <select
              className="input"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Improve on-time delivery to 97%"
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-20"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Starting progress (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                className="input"
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Due date</label>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
              {busy ? "Creating…" : "Create goal"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
