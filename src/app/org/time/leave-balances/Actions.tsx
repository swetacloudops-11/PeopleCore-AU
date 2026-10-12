"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Balance = {
  id: string;
  label: string;
  entitlement: number;
  taken: number;
  pending: number;
  carriedOver: number;
};

/** Small ✎ button that opens the adjust-balance modal for one cell. */
export default function BalanceEditor({ balance }: { balance: Balance }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    entitlement: String(balance.entitlement),
    taken: String(balance.taken),
    pending: String(balance.pending),
    carriedOver: String(balance.carriedOver),
  });

  const available =
    (Number(form.entitlement) || 0) +
    (Number(form.carriedOver) || 0) -
    (Number(form.taken) || 0) -
    (Number(form.pending) || 0);

  async function submit() {
    setSaving(true);
    setError("");
    const res = await apiCall(`/api/org/leave-balances/${balance.id}`, "PATCH", {
      entitlement: Number(form.entitlement) || 0,
      taken: Number(form.taken) || 0,
      pending: Number(form.pending) || 0,
      carriedOver: Number(form.carriedOver) || 0,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Balance updated");
      setOpen(false);
      router.refresh();
    } else {
      const fields = (res.data as { fields?: Record<string, string> })?.fields;
      setError(fields ? Object.values(fields)[0] ?? "Could not save" : "Could not save");
    }
  }

  const fields: Array<{ key: keyof typeof form; label: string }> = [
    { key: "entitlement", label: "Entitlement" },
    { key: "taken", label: "Taken" },
    { key: "pending", label: "Pending" },
    { key: "carriedOver", label: "Carried over" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 text-[11px] text-slate-400 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
        aria-label={`Adjust leave balance for ${balance.label}`}
        title="Adjust balance"
      >
        ✎
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Adjust leave balance"
        subtitle={balance.label}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`bal-${f.key}`}>{f.label}</label>
                <input
                  id={`bal-${f.key}`}
                  type="number"
                  min={0}
                  step={0.5}
                  className="input"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
            <span className="text-slate-500">Available after change</span>
            <span
              className={`font-semibold tabular-nums ${available < 0 ? "text-rose-600" : "text-slate-800"}`}
            >
              {available.toFixed(1)} days
            </span>
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Saving…" : "Save balance"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
