"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Schedule = { id: string; name: string };

type PayRunRow = { id: string; label: string; status: string };

const NEXT_ACTION: Record<string, { action: string; label: string }> = {
  DRAFT: { action: "SUBMIT", label: "Submit" },
  PENDING_APPROVAL: { action: "APPROVE", label: "Approve" },
  APPROVED: { action: "MARK_PAID", label: "Mark paid" },
};

const SUCCESS: Record<string, string> = {
  SUBMIT: "Pay run submitted for approval",
  APPROVE: "Pay run approved",
  MARK_PAID: "Pay run marked as paid",
};

/** Row actions: the single legal next transition plus draft deletion. */
export function PayRunRowActions({ run }: { run: PayRunRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const next = NEXT_ACTION[run.status];

  async function act(action: string) {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/org/pay-runs/${run.id}`,
      "PATCH",
      { action }
    );
    setBusy(false);
    if (res.ok) {
      toast.success(SUCCESS[action] ?? "Pay run updated");
      router.refresh();
    }
  }

  async function remove() {
    setBusy(true);
    const res = await apiCall(`/api/org/pay-runs/${run.id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success("Draft pay run deleted");
      setConfirmDelete(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(next.action)}
          className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          {next.label}
        </button>
      )}
      {run.status === "DRAFT" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Delete
        </button>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete draft pay run?"
        subtitle={run.label}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This draft will be removed permanently. Approved or paid runs cannot be
            deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete run"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Header button that creates a new draft pay run. */
export function NewPayRunButton({ schedules }: { schedules: Schedule[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    label: "",
    periodStart: "",
    periodEnd: "",
    payDate: "",
    payScheduleId: "",
    notes: "",
  });

  async function submit() {
    if (!form.label.trim() || !form.periodStart || !form.periodEnd || !form.payDate) {
      setError("Label and all three dates are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/org/pay-runs",
      "POST",
      {
        label: form.label.trim(),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        payDate: form.payDate,
        payScheduleId: form.payScheduleId || undefined,
        notes: form.notes.trim() || null,
      },
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success("Draft pay run created");
      setOpen(false);
      setForm({ label: "", periodStart: "", periodEnd: "", payDate: "", payScheduleId: "", notes: "" });
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save" : res.data?.error ?? "Could not save"
      );
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New pay run
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New pay run"
        subtitle="Creates a draft you can submit once lines are ready"
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="pr-label">Label</label>
            <input
              id="pr-label"
              className="input"
              placeholder="e.g. Pay run 19 — week ending 16 Oct"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="pr-start">Period start</label>
              <input
                id="pr-start"
                type="date"
                className="input"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-end">Period end</label>
              <input
                id="pr-end"
                type="date"
                className="input"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-pay">Pay date</label>
              <input
                id="pr-pay"
                type="date"
                className="input"
                value={form.payDate}
                onChange={(e) => setForm({ ...form, payDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pr-sched">Pay schedule</label>
            <select
              id="pr-sched"
              className="input"
              value={form.payScheduleId}
              onChange={(e) => setForm({ ...form, payScheduleId: e.target.value })}
            >
              <option value="">No linked schedule</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="pr-notes">Notes</label>
            <textarea
              id="pr-notes"
              rows={2}
              className="input"
              placeholder="Optional…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Creating…" : "Create draft"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
