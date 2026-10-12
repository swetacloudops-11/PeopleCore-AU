"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type PlanOption = { id: string; name: string; code: string; priceMonthly: unknown; priceAnnual: unknown };

type Sub = {
  id: string;
  organisationName: string;
  planId: string;
  status: string;
  cycle: string;
  seats: number;
};

const STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "EXPIRED"] as const;

export default function SubscriptionActions({
  sub,
  plans,
}: {
  sub: Sub;
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(sub.planId);
  const [status, setStatus] = useState(sub.status);
  const [cycle, setCycle] = useState(sub.cycle);
  const [seats, setSeats] = useState(String(sub.seats));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await apiCall<{ error?: string }>(
      `/api/subscriptions/${sub.id}`,
      "PATCH",
      {
        planId,
        status,
        cycle,
        seats: Number(seats) || 1,
      },
      { silent: true }
    );

    if (res.ok) {
      toast.success(`Subscription for "${sub.organisationName}" updated`);
      setOpen(false);
      router.refresh();
    } else {
      setError(res.data?.error ?? "Could not save changes");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Manage
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Manage subscription`}
        subtitle={`Organisation: ${sub.organisationName}`}
      >
        <form onSubmit={save} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="s-plan">Plan</label>
            <select
              id="s-plan"
              className="input"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Switching plan reprices the subscription automatically.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-status">Status</label>
              <select
                id="s-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-cycle">Billing cycle</label>
              <select
                id="s-cycle"
                className="input"
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-seats">Seats</label>
              <input
                id="s-seats"
                type="number"
                min={1}
                className="input"
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
              />
            </div>
          </div>

          {status === "CANCELLED" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
              Cancelling stops renewals at the end of the current period.
            </div>
          )}

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
