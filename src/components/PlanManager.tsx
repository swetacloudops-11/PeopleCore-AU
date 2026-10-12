"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: unknown;
  priceAnnual: unknown;
  maxEmployees: number;
  maxOrganisations: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

type Mode = { kind: "create" } | { kind: "edit"; plan: Plan };

const EMPTY = {
  code: "",
  name: "",
  description: "",
  priceMonthly: "0",
  priceAnnual: "0",
  maxEmployees: "0",
  maxOrganisations: "0",
  trialDays: "14",
  features: "",
  sortOrder: "0",
  isActive: true,
};

export default function PlanManager({
  trigger,
  plan,
}: {
  /** Button rendered when no plan is supplied (create mode). */
  trigger?: React.ReactNode;
  /** When present, opens directly in edit mode for this plan. */
  plan?: Plan;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(plan ? { kind: "edit", plan } : null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setForm(EMPTY);
    setError(null);
    setFieldErrors({});
    setMode({ kind: "create" });
  }

  function openEdit(p: Plan) {
    setForm({
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      priceMonthly: String(p.priceMonthly),
      priceAnnual: String(p.priceAnnual),
      maxEmployees: String(p.maxEmployees),
      maxOrganisations: String(p.maxOrganisations),
      trialDays: String(p.trialDays),
      features: p.features.join(", "),
      sortOrder: String(p.sortOrder),
      isActive: p.isActive,
    });
    setError(null);
    setFieldErrors({});
    setMode({ kind: "edit", plan: p });
  }

  // Expose for the create trigger; edit is driven by PlanEditListener.
  void openEdit;

  const set = (k: keyof typeof EMPTY) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      priceMonthly: Number(form.priceMonthly),
      priceAnnual: Number(form.priceAnnual),
      maxEmployees: Number(form.maxEmployees),
      maxOrganisations: Number(form.maxOrganisations),
      trialDays: Number(form.trialDays),
      features: form.features.split(",").map((s) => s.trim()).filter(Boolean),
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder),
      ...(mode?.kind === "create" ? { code: form.code.trim() } : {}),
    };

    const url = mode?.kind === "edit" ? `/api/plans/${mode.plan.id}` : "/api/plans";
    const method = mode?.kind === "edit" ? "PATCH" : "POST";

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      url,
      method,
      payload,
      { silent: true }
    );

    if (res.ok) {
      toast.success(mode?.kind === "edit" ? "Plan updated" : "Plan created");
      setMode(null);
      router.refresh();
      return;
    }

    if (res.data?.fields) setFieldErrors(res.data.fields);
    setError(res.data?.error ?? "Could not save plan");
    setBusy(false);
  }

  const err = (k: string) =>
    fieldErrors[k] ? <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p> : null;

  const input = (k: keyof typeof EMPTY) => ({
    value: String(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value),
  });

  return (
    <>
      {trigger ? (
        <button type="button" onClick={openCreate} className="btn-primary">
          {trigger}
        </button>
      ) : null}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode?.kind === "edit" ? `Edit ${mode.plan.name}` : "Create plan"}
        subtitle={
          mode?.kind === "edit"
            ? "Changes apply to new and renewing subscriptions immediately."
            : "Add a new subscription tier to the platform."
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-name">Name *</label>
              <input id="p-name" className="input" {...input("name")} required />
              {err("name")}
            </div>
            <div>
              <label className="label" htmlFor="p-code">Code *</label>
              <input
                id="p-code"
                className="input uppercase"
                placeholder="GROWTH"
                disabled={mode?.kind === "edit"}
                {...input("code")}
                required
              />
              {err("code")}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="p-desc">Description</label>
            <textarea
              id="p-desc"
              className="input min-h-[70px] resize-y"
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-pm">Monthly price (AUD) *</label>
              <input id="p-pm" type="number" min={0} step="0.01" className="input" {...input("priceMonthly")} required />
              {err("priceMonthly")}
            </div>
            <div>
              <label className="label" htmlFor="p-pa">Annual price (AUD) *</label>
              <input id="p-pa" type="number" min={0} step="0.01" className="input" {...input("priceAnnual")} required />
              {err("priceAnnual")}
            </div>
            <div>
              <label className="label" htmlFor="p-me">Max employees (0 = unlimited)</label>
              <input id="p-me" type="number" min={0} className="input" {...input("maxEmployees")} />
            </div>
            <div>
              <label className="label" htmlFor="p-mo">Max organisations (0 = unlimited)</label>
              <input id="p-mo" type="number" min={0} className="input" {...input("maxOrganisations")} />
            </div>
            <div>
              <label className="label" htmlFor="p-trial">Trial days</label>
              <input id="p-trial" type="number" min={0} max={365} className="input" {...input("trialDays")} />
              {err("trialDays")}
            </div>
            <div>
              <label className="label" htmlFor="p-sort">Sort order</label>
              <input id="p-sort" type="number" className="input" {...input("sortOrder")} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="p-feat">Features</label>
            <input
              id="p-feat"
              className="input"
              placeholder="Payroll, Leave, Reports"
              {...input("features")}
            />
            <p className="mt-1 text-[11px] text-slate-400">Comma-separated list.</p>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive")(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            Plan is available for new subscriptions
          </label>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : mode?.kind === "edit" ? "Save changes" : "Create plan"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
