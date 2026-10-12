"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { Badge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

type Option = { id: string; name: string };

export type ExpenseRow = {
  id: string;
  employeeName: string;
  employeeId: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  expenseDate: Date;
  receiptName: string | null;
  status: string;
  reviewNotes: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reimbursedAt: Date | null;
};

const TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REIMBURSED: "blue",
};

/** Row actions: detail modal with approve / reject, plus delete. */
export function ExpenseRowActions({ expense }: { expense: ExpenseRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pending = expense.status === "PENDING";

  async function act(action: "approve" | "reject") {
    if (action === "reject" && reason.trim().length < 3) {
      toast.error("Add a reason before rejecting");
      return;
    }
    setBusy(true);
    const res = await apiCall(`/api/org/expenses/${expense.id}`, "PATCH", {
      action,
      ...(action === "reject" ? { reason: reason.trim() } : {}),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(action === "approve" ? "Expense approved" : "Expense rejected");
      setOpen(false);
      setRejecting(false);
      setReason("");
      router.refresh();
    }
  }

  async function remove() {
    setBusy(true);
    const res = await apiCall(`/api/org/expenses/${expense.id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success("Expense deleted");
      setConfirmDelete(false);
      router.refresh();
    }
  }

  const details: Array<[string, string]> = [
    ["Employee", expense.employeeName],
    ["Category", expense.category],
    ["Description", expense.description],
    ["Amount", `${formatMoney(expense.amount)} ${expense.currency}`],
    ["Expense date", formatDate(expense.expenseDate)],
    ["Receipt", expense.receiptName ?? "No receipt attached"],
    ["Submitted", expense.submittedAt ? formatDate(expense.submittedAt) : "—"],
    ["Reviewed", expense.reviewedAt ? formatDate(expense.reviewedAt) : "—"],
    ["Reimbursed", expense.reimbursedAt ? formatDate(expense.reimbursedAt) : "—"],
  ];

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={() => {
          setOpen(true);
          setRejecting(false);
          setReason("");
        }}
      >
        View
      </button>
      {expense.status !== "REIMBURSED" && (
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </button>
      )}

      {/* ── Detail / decision modal ── */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Expense claim"
        subtitle={expense.description}
        width="max-w-xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={TONE[expense.status] ?? "slate"}>{expense.status}</Badge>
            <span className="text-lg font-semibold tabular-nums text-slate-900">
              {formatMoney(expense.amount)}
            </span>
          </div>

          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {details.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-right text-sm text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>

          {expense.reviewNotes && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <span className="font-semibold">Review note:</span> {expense.reviewNotes}
            </div>
          )}

          {pending && !rejecting && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                Reject
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => act("approve")}
              >
                {busy ? "Saving…" : "Approve"}
              </button>
            </div>
          )}

          {pending && rejecting && (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="ex-reason">Reason for rejection</label>
                <textarea
                  id="ex-reason"
                  rows={3}
                  className="input"
                  placeholder="Explain why this claim cannot be approved…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => setRejecting(false)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => act("reject")}
                >
                  {busy ? "Rejecting…" : "Reject claim"}
                </button>
              </div>
            </div>
          )}

          {!pending && (
            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete expense claim?"
        subtitle={`${expense.employeeName} · ${formatMoney(expense.amount)}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            The claim will be removed permanently. Reimbursed claims cannot be deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete claim"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Header button that lodges an expense on behalf of an employee. */
export function NewExpenseButton({ employees }: { employees: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? "",
    category: "Travel",
    description: "",
    amount: "",
    expenseDate: "",
    receiptName: "",
    status: "PENDING",
  });

  async function submit() {
    if (!form.employeeId || !form.description.trim() || !form.amount || !form.expenseDate) {
      setError("Employee, description, amount and date are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/org/expenses",
      "POST",
      {
        employeeId: form.employeeId,
        category: form.category,
        description: form.description.trim(),
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        receiptName: form.receiptName.trim() || null,
        status: form.status,
      },
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success("Expense lodged");
      setOpen(false);
      setForm({ ...form, description: "", amount: "", expenseDate: "", receiptName: "" });
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  if (employees.length === 0) return null;

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New expense
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New expense claim"
        subtitle="Lodge a claim on behalf of an employee"
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="ne-emp">Employee</label>
            <select
              id="ne-emp"
              className="input"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ne-cat">Category</label>
              <select
                id="ne-cat"
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {["Travel", "Meals", "Fuel", "Equipment", "Training", "Software", "Office Supplies", "Parking", "Other"].map(
                  (c) => (
                    <option key={c} value={c}>{c}</option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ne-amt">Amount (AUD)</label>
              <input
                id="ne-amt"
                type="number"
                min="0"
                step="0.01"
                className="input"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ne-date">Expense date</label>
              <input
                id="ne-date"
                type="date"
                className="input"
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="ne-receipt">Receipt file name</label>
              <input
                id="ne-receipt"
                className="input"
                placeholder="receipt-1042.pdf"
                value={form.receiptName}
                onChange={(e) => setForm({ ...form, receiptName: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="ne-desc">Description</label>
            <textarea
              id="ne-desc"
              rows={2}
              className="input"
              placeholder="What was this for?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="ne-status">Status</label>
            <select
              id="ne-status"
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="PENDING">PENDING — needs approval</option>
              <option value="DRAFT">DRAFT — save for later</option>
            </select>
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Lodging…" : "Lodge claim"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
