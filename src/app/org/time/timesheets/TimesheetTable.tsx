"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, TableWrap } from "@/components/ui";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type TimesheetRow = {
  id: string;
  employee: string;
  employeeNumber: string;
  period: string;
  totalHours: number;
  overtimeHours: number;
  status: string;
  submittedAt: string | null;
  approvedBy: string | null;
  rejectedReason: string | null;
};

const TONE: Record<string, string> = {
  DRAFT: "slate",
  SUBMITTED: "amber",
  APPROVED: "green",
  REJECTED: "red",
  PAID: "purple",
};

export default function TimesheetTable({ rows }: { rows: TimesheetRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const submittable = rows.filter((r) => r.status === "SUBMITTED");
  const allSelected = submittable.length > 0 && selected.length === submittable.length;

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function toggleAll() {
    setSelected(allSelected ? [] : submittable.map((r) => r.id));
  }

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await apiCall(`/api/org/time/${id}`, "PATCH", {
      type: "timesheet",
      action,
      ...extra,
    });
    if (res.ok) {
      const verb =
        { APPROVE: "approved", REJECT: "rejected", SUBMIT: "submitted", PAY: "marked as paid", REOPEN: "reopened" }[
          action
        ] ?? action.toLowerCase();
      toast.success(`Timesheet ${verb}`);
      router.refresh();
    }
    return res.ok;
  }

  async function approveOne(row: TimesheetRow) {
    if (!window.confirm(`Approve ${row.employee}'s timesheet (${row.period}, ${row.totalHours}h)?`)) return;
    await act(row.id, "APPROVE");
  }

  async function submitOne(row: TimesheetRow) {
    await act(row.id, "SUBMIT");
  }

  async function bulkApprove() {
    if (selected.length === 0) return;
    if (
      !window.confirm(
        `Approve ${selected.length} selected timesheet${selected.length === 1 ? "" : "s"}?`
      )
    )
      return;
    setBusy(true);
    let okCount = 0;
    for (const id of selected) {
      const res = await apiCall(
        `/api/org/time/${id}`,
        "PATCH",
        { type: "timesheet", action: "APPROVE" },
        { silent: true }
      );
      if (res.ok) okCount++;
    }
    setBusy(false);
    setSelected([]);
    if (okCount) {
      toast.success(`${okCount} timesheet${okCount === 1 ? "" : "s"} approved`);
      router.refresh();
    } else {
      toast.error("Could not approve the selected timesheets");
    }
  }

  async function confirmReject() {
    if (!rejectId) return;
    if (!reason.trim()) {
      setReasonError("A reason is required");
      return;
    }
    setBusy(true);
    const ok = await act(rejectId, "REJECT", { reason: reason.trim() });
    setBusy(false);
    if (ok) {
      setRejectId(null);
      setReason("");
      setReasonError("");
    }
  }

  const rejectTarget = rows.find((r) => r.id === rejectId);

  return (
    <>
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm font-medium text-indigo-800">
            {selected.length} timesheet{selected.length === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setSelected([])}>
              Clear
            </button>
            <button type="button" className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={bulkApprove}>
              {busy ? "Approving…" : `Approve selected (${selected.length})`}
            </button>
          </div>
        </div>
      )}

      <TableWrap>
        <thead className="bg-slate-50">
          <tr>
            <th className="th w-10">
              <input
                type="checkbox"
                aria-label="Select all submitted"
                checked={allSelected}
                onChange={toggleAll}
                disabled={submittable.length === 0}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
              />
            </th>
            <th className="th">Employee</th>
            <th className="th">Period</th>
            <th className="th">Total</th>
            <th className="th">Overtime</th>
            <th className="th">Status</th>
            <th className="th">Submitted</th>
            <th className="th">Approved by</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const checked = selected.includes(r.id);
            return (
              <tr key={r.id} className={checked ? "bg-indigo-50/60" : "hover:bg-slate-50/70"}>
                <td className="td">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.employee}'s timesheet`}
                    checked={checked}
                    onChange={() => toggle(r.id)}
                    disabled={r.status !== "SUBMITTED"}
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                  />
                </td>
                <td className="td font-medium text-slate-800">
                  {r.employee}
                  <span className="ml-1.5 text-[11px] text-slate-400">{r.employeeNumber}</span>
                  {r.status === "REJECTED" && r.rejectedReason && (
                    <div className="mt-0.5 text-[11px] text-rose-500">Reason: {r.rejectedReason}</div>
                  )}
                </td>
                <td className="td text-slate-500">{r.period}</td>
                <td className="td font-medium tabular-nums">{r.totalHours.toFixed(2)}h</td>
                <td className="td tabular-nums">
                  {r.overtimeHours > 0 ? (
                    <span className="font-medium text-amber-600">{r.overtimeHours.toFixed(2)}h</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="td">
                  <Badge tone={TONE[r.status] ?? "slate"}>{r.status}</Badge>
                </td>
                <td className="td text-slate-500">{r.submittedAt ?? "—"}</td>
                <td className="td text-slate-500">{r.approvedBy ?? "—"}</td>
                <td className="td">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {(r.status === "DRAFT" || r.status === "REJECTED") && (
                      <button
                        type="button"
                        className="btn-secondary !px-2 !py-1 text-[11px]"
                        onClick={() => submitOne(r)}
                      >
                        Submit
                      </button>
                    )}
                    {r.status === "SUBMITTED" && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary !px-2 !py-1 text-[11px] !text-rose-600"
                          onClick={() => {
                            setRejectId(r.id);
                            setReason("");
                            setReasonError("");
                          }}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="btn-primary !px-2 !py-1 text-[11px]"
                          onClick={() => approveOne(r)}
                        >
                          Approve
                        </button>
                      </>
                    )}
                    {r.status === "APPROVED" && (
                      <button
                        type="button"
                        className="btn-secondary !px-2 !py-1 text-[11px]"
                        onClick={() => act(r.id, "PAY")}
                      >
                        Mark paid
                      </button>
                    )}
                    {r.status === "PAID" && <span className="text-[11px] text-slate-400">Closed</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>

      <Modal
        open={Boolean(rejectId)}
        onClose={() => setRejectId(null)}
        title="Reject timesheet"
        subtitle={rejectTarget ? `${rejectTarget.employee} · ${rejectTarget.period}` : undefined}
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="reject-reason">Reason</label>
            <textarea
              id="reject-reason"
              rows={3}
              className="input"
              placeholder="Explain what needs to change…"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError("");
              }}
            />
            {reasonError && <p className="mt-1 text-xs font-medium text-rose-600">{reasonError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejectId(null)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={confirmReject}>
              {busy ? "Rejecting…" : "Reject timesheet"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
