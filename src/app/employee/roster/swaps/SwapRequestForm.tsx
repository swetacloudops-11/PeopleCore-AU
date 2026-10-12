"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; label: string };
type Teammate = { id: string; name: string };

/**
 * Requests a shift swap for one of the caller's own upcoming shifts.
 * Options are plain {id,label} rows prepared by the server component.
 */
export default function SwapRequestForm({
  shifts,
  teammates,
}: {
  shifts: Option[];
  teammates: Teammate[];
}) {
  const router = useRouter();
  const [shiftId, setShiftId] = useState("");
  const [offeredToId, setOfferedToId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/employee/swaps",
      "POST",
      {
        shiftId,
        offeredToId: offeredToId || undefined,
        reason: reason.trim() || undefined,
      }
    );
    setBusy(false);

    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Swap request sent for review");
    setShiftId("");
    setOfferedToId("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="label">Your shift</span>
        <select
          className="input"
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
          required
        >
          <option value="">— Select a shift —</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {errors.shiftId && (
          <span className="mt-1 block text-[11px] text-rose-600">{errors.shiftId}</span>
        )}
      </label>

      <label className="block">
        <span className="label">Offer to teammate (optional)</span>
        <select
          className="input"
          value={offeredToId}
          onChange={(e) => setOfferedToId(e.target.value)}
        >
          <option value="">— Anyone / no preference —</option>
          {teammates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {errors.offeredToId && (
          <span className="mt-1 block text-[11px] text-rose-600">{errors.offeredToId}</span>
        )}
      </label>

      <label className="block">
        <span className="label">Reason (optional)</span>
        <input
          className="input"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Family commitment that afternoon"
        />
        {errors.reason && (
          <span className="mt-1 block text-[11px] text-rose-600">{errors.reason}</span>
        )}
      </label>

      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <p className="text-xs text-slate-400">
          Your manager reviews swap requests — the shift stays yours until it is approved.
        </p>
        <button type="submit" className="btn-primary shrink-0" disabled={busy}>
          {busy ? "Sending…" : "Request swap"}
        </button>
      </div>
    </form>
  );
}
