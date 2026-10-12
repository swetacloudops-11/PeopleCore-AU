"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

const TYPES = ["POSITIVE", "CONSTRUCTIVE", "RECOGNITION", "GENERAL"] as const;
const VISIBILITIES = ["PRIVATE", "MANAGER_ONLY", "PUBLIC"] as const;

/** "New feedback" button + create modal. */
export default function FeedbackComposer({
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
    type: "POSITIVE" as (typeof TYPES)[number],
    visibility: "PRIVATE" as (typeof VISIBILITIES)[number],
    comment: "",
  });

  const submit = async () => {
    if (!form.employeeId) {
      toast.error("Select who the feedback is for");
      return;
    }
    if (form.comment.trim().length < 3) {
      toast.error("Feedback comment is required");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/org/feedback", "POST", {
      employeeId: form.employeeId,
      type: form.type,
      visibility: form.visibility,
      comment: form.comment.trim(),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Feedback recorded");
      setOpen(false);
      setForm((f) => ({ ...f, comment: "" }));
      router.refresh();
    }
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New feedback
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Give feedback"
        subtitle="Logged against the recipient's performance history."
        width="max-w-xl"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Recipient</label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as (typeof TYPES)[number] })}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Visibility</label>
              <select
                className="input"
                value={form.visibility}
                onChange={(e) =>
                  setForm({ ...form, visibility: e.target.value as (typeof VISIBILITIES)[number] })
                }
              >
                {VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {v.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Comment</label>
            <textarea
              className="input min-h-28"
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Be specific: what happened, and the impact."
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
              {busy ? "Saving…" : "Save feedback"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
