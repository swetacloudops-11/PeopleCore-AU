"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export const CATEGORY_TYPES = [
  "ORDINARY",
  "OVERTIME",
  "ALLOWANCE",
  "BONUS",
  "SUPER",
  "TAX",
  "DEDUCTION",
  "REIMBURSEMENT",
] as const;

export const CATEGORY_UNITS = [
  "AMOUNT",
  "HOURS",
  "PERCENT",
  "MULTIPLIER",
  "PER_KM",
  "PER_DAY",
] as const;

export type CategoryFormValues = {
  name: string;
  code: string;
  type: string;
  rate: string;
  unit: string;
  isTaxable: boolean;
  isSuperable: boolean;
  appliesTo: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY: CategoryFormValues = {
  name: "",
  code: "",
  type: "ORDINARY",
  rate: "0",
  unit: "AMOUNT",
  isTaxable: true,
  isSuperable: true,
  appliesTo: "ALL",
  sortOrder: "0",
  isActive: true,
};

/**
 * Create/edit form for a pay category. Used by the "Add category" modal (no
 * `id`) and by the row actions modal (with `id`).
 */
export default function CategoryForm({
  id,
  initial,
  defaultType,
  onDone,
}: {
  id?: string;
  initial?: Partial<CategoryFormValues>;
  defaultType?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CategoryFormValues>({
    ...EMPTY,
    ...(defaultType ? { type: defaultType } : {}),
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setError("Name is required");
      return;
    }
    if (form.code.trim().length < 2) {
      setError("Code is required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      id ? `/api/payroll/categories/${id}` : "/api/payroll/categories",
      id ? "PATCH" : "POST",
      {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        rate: Number(form.rate) || 0,
        unit: form.unit,
        isTaxable: form.isTaxable,
        isSuperable: form.isSuperable,
        appliesTo: form.appliesTo.trim() || "ALL",
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      },
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success(id ? "Pay category updated" : "Pay category created");
      router.refresh();
      onDone?.();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  const check = (label: string, key: "isTaxable" | "isSuperable" | "isActive") => (
    <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
      />
      {label}
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pc-name">
            Name
          </label>
          <input
            id="pc-name"
            className="input"
            placeholder="e.g. Vehicle Allowance"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pc-code">
            Code
          </label>
          <input
            id="pc-code"
            className="input uppercase"
            placeholder="e.g. VEH-ALLOW"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pc-type">
            Type
          </label>
          <select
            id="pc-type"
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {CATEGORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pc-rate">
            Rate
          </label>
          <input
            id="pc-rate"
            type="number"
            step="0.0001"
            min="0"
            className="input"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pc-unit">
            Unit
          </label>
          <select
            id="pc-unit"
            className="input"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          >
            {CATEGORY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pc-applies">
            Applies to
          </label>
          <input
            id="pc-applies"
            className="input"
            placeholder="ALL"
            value={form.appliesTo}
            onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pc-sort">
            Sort order
          </label>
          <input
            id="pc-sort"
            type="number"
            min="0"
            max="999"
            className="input"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        {check("Taxable (counts toward PAYG)", "isTaxable")}
        {check("Superable (counts toward super guarantee)", "isSuperable")}
        {check("Active", "isActive")}
      </div>

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : id ? "Save changes" : "Create category"}
        </button>
      </div>
    </form>
  );
}
