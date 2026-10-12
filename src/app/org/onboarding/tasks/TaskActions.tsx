"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

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
    const res = await apiCall<{ error?: string }>(
      `/api/org/onboarding/${id}`,
      "PATCH",
      { status: next }
    );
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
          onClick={() => set("IN_PROGRESS", status === "BLOCKED" ? "Task resumed" : "Task started")}
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

/** Opens the "new task" modal and POSTs an OnboardingTask. */
export function NewTaskButton({
  employees,
  defaultStage = "ONBOARDING",
  defaultEmployeeId,
  buttonLabel = "New task",
}: {
  employees: Array<{ id: string; name: string }>;
  defaultStage?: "ONBOARDING" | "OFFBOARDING";
  defaultEmployeeId?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    employeeId: defaultEmployeeId ?? "",
    stage: defaultStage,
    category: "Admin",
    dueDate: "",
  });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/org/onboarding", "POST", {
      title: form.title.trim(),
      employeeId: form.employeeId || null,
      stage: form.stage,
      category: form.category || "Admin",
      dueDate: form.dueDate || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Task created");
      setOpen(false);
      setForm((f) => ({ ...f, title: "", dueDate: "" }));
      router.refresh();
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
        subtitle="Tasks are scoped to this organisation and appear on the Tasks list."
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stage</label>
              <select
                className="input"
                value={form.stage}
                onChange={(e) =>
                  setForm({ ...form, stage: e.target.value as "ONBOARDING" | "OFFBOARDING" })
                }
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
