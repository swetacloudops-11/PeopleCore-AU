"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { formatDate, formatMoney } from "@/lib/format";

export type PendingItem = {
  id: string;
  employeeName: string;
  employeeNumber: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  expenseDate: Date;
  receiptName: string | null;
  submittedAt: Date | null;
};

/** Focused approve / reject queue with bulk approval and a running total. */
export default function ApprovalQueue({
  items,
  totalValue,
}: {
  items: PendingItem[];
  totalValue: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingItem | null>(null);
  const [reason, setReason] = useState("");

  const selectedTotal = useMemo(
    () =>
      items.filter((i) => selected.has(i.id)).reduce((sum, i) => sum + i.amount, 0),
    [items, selected]
  );

  const allSelected = items.length > 0 && selected.size === items.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function approveOne(id: string): Promise<boolean> {
    const res = await apiCall(`/api/org/expenses/${id}`, "PATCH", { action: "approve" });
    return res.ok;
  }

  async function approveSelected() {
    const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (ids.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const id of ids) {
      if (await approveOne(id)) ok += 1;
    }
    setBusy(false);
    if (ok === ids.length) {
      toast.success(`${ok} expense${ok === 1 ? "" : "s"} approved`);
    } else {
      toast.error(`${ok} of ${ids.length} approved — the rest were already actioned`);
    }
    setSelected(new Set());
    router.refresh();
  }

  async function approveRow(id: string) {
    setBusy(true);
    const ok = await approveOne(id);
    setBusy(false);
    if (ok) {
      toast.success("Expense approved");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    }
  }

  async function rejectRow() {
    if (!rejectTarget) return;
    if (reason.trim().length < 3) {
      toast.error("A reason is required to reject a claim");
      return;
    }
    setBusy(true);
    const res = await apiCall(`/api/org/expenses/${rejectTarget.id}`, "PATCH", {
      action: "reject",
      reason: reason.trim(),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Expense rejected");
      setRejectTarget(null);
      setReason("");
      router.refresh();
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
        <div className="text-sm text-amber-800">
          <span className="font-semibold">{formatMoney(totalValue)}</span> waiting on a
          decision across {items.length} claim{items.length === 1 ? "" : "s"}.
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-amber-700">
            Selected: {selected.size} · {formatMoney(selectedTotal)}
          </span>
          <button
            type="button"
            className="btn-primary !py-1.5 text-xs"
            disabled={busy || selected.size === 0}
            onClick={approveSelected}
          >
            {busy ? "Working…" : `Approve selected (${selected.size})`}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="th">Employee</th>
              <th className="th">Claim</th>
              <th className="th">Expense date</th>
              <th className="th">Receipt</th>
              <th className="th">Submitted</th>
              <th className="th text-right">Amount</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <input
                    type="checkbox"
                    checked={selected.has(i.id)}
                    onChange={() => toggle(i.id)}
                    aria-label={`Select claim from ${i.employeeName}`}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </td>
                <td className="td font-medium text-slate-800">
                  {i.employeeName}
                  <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                    {i.employeeNumber}
                  </span>
                </td>
                <td className="td max-w-[18rem]">
                  <div className="truncate text-slate-700">{i.description}</div>
                  <div className="text-[11px] text-slate-400">{i.category}</div>
                </td>
                <td className="td text-slate-500">{formatDate(i.expenseDate)}</td>
                <td className="td max-w-[9rem] truncate text-slate-500">
                  {i.receiptName ?? "—"}
                </td>
                <td className="td text-slate-500">
                  {i.submittedAt ? formatDate(i.submittedAt) : "—"}
                </td>
                <td className="td text-right font-medium tabular-nums text-slate-800">
                  {formatMoney(i.amount)}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    {i.currency}
                  </span>
                </td>
                <td className="td">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRejectTarget(i);
                        setReason("");
                      }}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => approveRow(i.id)}
                      className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Reject expense claim"
        subtitle={
          rejectTarget
            ? `${rejectTarget.employeeName} · ${formatMoney(rejectTarget.amount)} · ${rejectTarget.description}`
            : undefined
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="aq-reason">Reason (required)</label>
            <textarea
              id="aq-reason"
              rows={3}
              className="input"
              placeholder="Tell the employee why this claim cannot be approved…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejectTarget(null)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={rejectRow}>
              {busy ? "Rejecting…" : "Reject claim"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
