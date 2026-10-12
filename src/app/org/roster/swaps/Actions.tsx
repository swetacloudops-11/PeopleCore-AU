"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Approve / reject buttons plus the notes modal for one swap request. */
export default function SwapActions({
  request,
}: {
  request: { id: string; status: string; label: string };
}) {
  const router = useRouter();
  const [action, setAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (request.status !== "PENDING") return null;

  async function confirm() {
    if (!action) return;
    setSaving(true);
    const res = await apiCall(`/api/org/swaps/${request.id}`, "PATCH", {
      action,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success(action === "APPROVE" ? "Swap approved — shift marked as swapped" : "Swap rejected");
      setAction(null);
      setNotes("");
      router.refresh();
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
          onClick={() => {
            setAction("REJECT");
            setNotes("");
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50"
          onClick={() => {
            setAction("APPROVE");
            setNotes("");
          }}
        >
          Approve
        </button>
      </div>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action === "APPROVE" ? "Approve swap" : "Reject swap"}
        subtitle={request.label}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {action === "APPROVE"
              ? "The shift will be marked as SWAPPED and both employees can see the change."
              : "The requester will be notified that this swap was declined."}
          </p>
          <div>
            <label className="label" htmlFor="swap-notes">Notes</label>
            <textarea
              id="swap-notes"
              rows={3}
              className="input"
              placeholder="Optional note…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={action === "APPROVE" ? "btn-primary" : "btn-danger"}
              disabled={saving}
              onClick={confirm}
            >
              {saving ? "Saving…" : action === "APPROVE" ? "Approve swap" : "Reject swap"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
