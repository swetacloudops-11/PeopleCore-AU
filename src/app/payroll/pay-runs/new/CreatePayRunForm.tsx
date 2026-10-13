"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Schedule = { id: string; name: string; frequency: string };

/** Small labelled field wrapper that surfaces the API's `fields.*` errors inline. */
function F({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

export function CreatePayRunForm({
  schedules,
  suggestedLabel,
}: {
  schedules: Schedule[];
  suggestedLabel: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    payScheduleId: "",
    label: suggestedLabel,
    periodStart: "",
    periodEnd: "",
    payDate: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/payroll/pay-runs",
      "POST",
      {
        label: form.label.trim(),
        payScheduleId: form.payScheduleId || undefined,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        payDate: form.payDate,
        notes: form.notes.trim() || undefined,
      },
      { silent: true }
    );
    setBusy(false);

    if (res.ok) {
      toast.success("Pay run created");
      router.push("/payroll/pay-runs");
      router.refresh();
      return;
    }

    setErrors(res.data?.fields ?? {});
    toast.error(res.data?.error ?? "Could not create the pay run");
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <F label="Pay schedule" error={errors.payScheduleId}>
        <select
          className="input"
          value={form.payScheduleId}
          onChange={(e) => set("payScheduleId")(e.target.value)}
        >
          <option value="">No schedule</option>
          {schedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.frequency.charAt(0) + s.frequency.slice(1).toLowerCase()})
            </option>
          ))}
        </select>
      </F>

      <F label="Label" error={errors.label}>
        <input
          className="input"
          value={form.label}
          onChange={(e) => set("label")(e.target.value)}
          placeholder="e.g. Pay run 19 — week ending 16 Oct"
        />
      </F>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <F label="Period start" error={errors.periodStart}>
          <input
            type="date"
            className="input"
            value={form.periodStart}
            onChange={(e) => set("periodStart")(e.target.value)}
          />
        </F>
        <F label="Period end" error={errors.periodEnd}>
          <input
            type="date"
            className="input"
            value={form.periodEnd}
            onChange={(e) => set("periodEnd")(e.target.value)}
          />
        </F>
        <F label="Pay date" error={errors.payDate}>
          <input
            type="date"
            className="input"
            value={form.payDate}
            onChange={(e) => set("payDate")(e.target.value)}
          />
        </F>
      </div>

      <F label="Notes" error={errors.notes}>
        <textarea
          rows={3}
          className="input"
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          placeholder="Optional notes for this run…"
        />
      </F>

      <div className="flex justify-end gap-2">
        <Link href="/payroll/pay-runs" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create pay run"}
        </button>
      </div>
    </form>
  );
}
