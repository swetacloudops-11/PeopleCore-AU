"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

/** Start / complete / cancel controls for a single review row. */
export default function ReviewActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rating, setRating] = useState("4");
  const [comments, setComments] = useState("");

  const patch = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/reviews/${id}`, "PATCH", body);
    setBusy(false);
    if (res.ok) {
      toast.success(message);
      setOpen(false);
      setConfirmCancel(false);
      router.refresh();
    }
  };

  if (status === "COMPLETED" || status === "CANCELLED") {
    return (
      <span
        className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ${
          status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
        }`}
      >
        ✓ {status === "COMPLETED" ? "Closed" : "Cancelled"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status === "DRAFT" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ action: "start" }, "Review started")}
          className="btn-secondary !px-2 !py-1 text-[11px]"
        >
          Start
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="btn-primary !px-2 !py-1 text-[11px]"
      >
        Complete
      </button>
      {!confirmCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmCancel(true)}
          className="btn-secondary !px-2 !py-1 text-[11px]"
        >
          Cancel
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ action: "cancel" }, "Review cancelled")}
            className="btn-danger !px-2 !py-1 text-[11px]"
          >
            Sure?
          </button>
          <button
            type="button"
            onClick={() => setConfirmCancel(false)}
            className="btn-secondary !px-2 !py-1 text-[11px]"
          >
            No
          </button>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Complete review"
        subtitle="Record the overall rating and reviewer comments."
      >
        <div className="space-y-4">
          <div>
            <label className="label">Overall rating (1–5)</label>
            <select className="input" value={rating} onChange={(e) => setRating(e.target.value)}>
              {["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"].map((r) => (
                <option key={r} value={r}>
                  {r} / 5
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reviewer comments</label>
            <textarea
              className="input min-h-28"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Summarise performance, wins and development areas…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                patch(
                  {
                    action: "complete",
                    overallRating: Number(rating),
                    reviewerComments: comments.trim() || undefined,
                  },
                  "Review completed"
                )
              }
            >
              {busy ? "Saving…" : "Mark completed"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const REVIEW_TYPES = ["ANNUAL", "PROBATION", "QUARTERLY", "MID_YEAR", "CUSTOM"] as const;

/** "New review" button + create modal. */
export function NewReviewButton({
  employees,
}: {
  employees: Array<{ id: string; name: string; isManager: boolean }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const iso = (offset: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const [form, setForm] = useState({
    employeeId: "",
    reviewerId: "",
    type: "ANNUAL" as (typeof REVIEW_TYPES)[number],
    title: `${new Date().getFullYear()} Performance Review`,
    periodStart: iso(-180),
    periodEnd: iso(0),
    dueDate: iso(30),
  });

  const submit = async () => {
    if (!form.employeeId) {
      toast.error("Select an employee");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/org/reviews", "POST", {
      ...form,
      reviewerId: form.reviewerId || null,
      dueDate: form.dueDate || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Review created");
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New review
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create review"
        subtitle="New reviews start as a draft until you start them."
        width="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <label className="label">Reviewer</label>
              <select
                className="input"
                value={form.reviewerId}
                onChange={(e) => setForm({ ...form, reviewerId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {employees
                  .filter((e) => e.isManager || e.id === form.employeeId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as (typeof REVIEW_TYPES)[number] })}
              >
                {REVIEW_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
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
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Period start</label>
              <input
                type="date"
                className="input"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Period end</label>
              <input
                type="date"
                className="input"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
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
              {busy ? "Creating…" : "Create review"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
