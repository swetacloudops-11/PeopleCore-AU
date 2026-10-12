"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

type Stage = "ONBOARDING" | "OFFBOARDING";

/** Row actions for an onboarding/offboarding task: start · complete · block · waive. */
export default function TaskActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const set = async (next: string, message: string) => {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/hr/tasks/${id}`, "PATCH", {
      status: next,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(message);
      router.refresh();
    }
  };

  if (status === "COMPLETED" || status === "WAIVED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
        ✓ {status === "WAIVED" ? "Waived" : "Done"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status !== "IN_PROGRESS" && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            set("IN_PROGRESS", status === "BLOCKED" ? "Task resumed" : "Task started")
          }
          className="btn-secondary !px-2 !py-1 text-[11px]"
        >
          {status === "BLOCKED" ? "Resume" : "Start"}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => set("COMPLETED", "Task completed")}
        className="btn-primary !px-2 !py-1 text-[11px]"
      >
        Complete
      </button>
      {status !== "BLOCKED" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => set("BLOCKED", "Task blocked")}
          className="btn-secondary !px-2 !py-1 text-[11px]"
        >
          Block
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => set("WAIVED", "Task waived")}
        className="btn-secondary !px-2 !py-1 text-[11px]"
      >
        Waive
      </button>
    </div>
  );
}

/** Opens the "new task" modal and POSTs an OnboardingTask to /api/hr/tasks. */
export function NewTaskButton({
  employees,
  checklists = [],
  defaultStage = "ONBOARDING",
  defaultEmployeeId,
  buttonLabel = "New task",
}: {
  employees: Array<{ id: string; name: string }>;
  checklists?: Array<{ id: string; name: string }>;
  defaultStage?: Stage;
  defaultEmployeeId?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "",
    employeeId: defaultEmployeeId ?? "",
    checklistId: "",
    stage: defaultStage as Stage,
    category: "Admin",
    dueDate: "",
  });

  const submit = async () => {
    if (!form.title.trim()) {
      setErrors({ title: "Give the task a title" });
      return;
    }
    setBusy(true);
    setErrors({});
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/hr/tasks",
      "POST",
      {
        title: form.title.trim(),
        employeeId: form.employeeId || null,
        checklistId: form.checklistId || null,
        stage: form.stage,
        category: form.category || "Admin",
        dueDate: form.dueDate || null,
      }
    );
    setBusy(false);
    if (res.ok) {
      toast.success("Task created");
      setOpen(false);
      setForm((f) => ({ ...f, title: "", dueDate: "" }));
      router.refresh();
    } else if (res.data?.fields) {
      setErrors(res.data.fields);
    }
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + {buttonLabel}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New onboarding task"
        subtitle="Tasks are scoped to this organisation and appear on the Tasks lists."
      >
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Order laptop and accessories"
            />
            {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
          </div>

          <div>
            <label className="label">Employee</label>
            <select
              className="input"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              <option value="">— Unassigned template task —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {errors.employeeId && (
              <p className="mt-1 text-xs text-rose-600">{errors.employeeId}</p>
            )}
          </div>

          {checklists.length > 0 && (
            <div>
              <label className="label">Checklist</label>
              <select
                className="input"
                value={form.checklistId}
                onChange={(e) => setForm({ ...form, checklistId: e.target.value })}
              >
                <option value="">— No checklist —</option>
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stage</label>
              <select
                className="input"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as Stage })}
              >
                <option value="ONBOARDING">Onboarding</option>
                <option value="OFFBOARDING">Offboarding</option>
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {["Admin", "Payroll", "IT", "Training", "HR", "Equipment", "Finance"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            {errors.dueDate && <p className="mt-1 text-xs text-rose-600">{errors.dueDate}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
              {busy ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
