"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Category = {
  id: string;
  name: string;
  code: string;
  type: string;
  isTaxable: boolean;
  isSuperable: boolean;
  rate: number;
  unit: string;
  isActive: boolean;
  sortOrder: number;
};

const TYPES = [
  "ORDINARY",
  "OVERTIME",
  "ALLOWANCE",
  "BONUS",
  "SUPER",
  "TAX",
  "DEDUCTION",
  "REIMBURSEMENT",
];

const UNITS = ["AMOUNT", "HOURS", "PERCENT", "MULTIPLIER", "PER_KM"];

type FormState = {
  name: string;
  code: string;
  type: string;
  isTaxable: boolean;
  isSuperable: boolean;
  rate: string;
  unit: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  name: "",
  code: "",
  type: "ORDINARY",
  isTaxable: true,
  isSuperable: true,
  rate: "1",
  unit: "AMOUNT",
  sortOrder: "0",
  isActive: true,
};

function CategoryForm({
  form,
  setForm,
  error,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  error: string;
}) {
  const check = (label: string, key: "isTaxable" | "isSuperable" | "isActive") => (
    <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pc-name">Name</label>
          <input
            id="pc-name"
            className="input"
            placeholder="e.g. Vehicle Allowance"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pc-code">Code</label>
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
          <label className="label" htmlFor="pc-type">Type</label>
          <select
            id="pc-type"
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pc-rate">Rate</label>
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
          <label className="label" htmlFor="pc-unit">Unit</label>
          <select
            id="pc-unit"
            className="input"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pc-sort">Sort order</label>
          <input
            id="pc-sort"
            type="number"
            min="0"
            className="input"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          {check("Taxable (counts toward PAYG)", "isTaxable")}
          {check("Superable (counts toward super guarantee)", "isSuperable")}
          {check("Active", "isActive")}
        </div>
      </div>

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

function payload(form: FormState) {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    type: form.type,
    isTaxable: form.isTaxable,
    isSuperable: form.isSuperable,
    rate: Number(form.rate) || 0,
    unit: form.unit,
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive,
  };
}

/** Header button that creates a pay category. */
export function NewCategoryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({ ...EMPTY });

  async function submit() {
    if (form.name.trim().length < 2 || form.code.trim().length < 2) {
      setError("Name and code are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/org/pay-categories",
      "POST",
      payload(form),
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success("Pay category created");
      setOpen(false);
      setForm({ ...EMPTY });
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New category
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New pay category"
        subtitle="Building blocks used when costing a pay run"
      >
        <CategoryForm form={form} setForm={setForm} error={error} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Creating…" : "Create category"}
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Row actions: edit, toggle active and delete. */
export function CategoryRowActions({ category }: { category: Category }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    name: category.name,
    code: category.code,
    type: category.type,
    isTaxable: category.isTaxable,
    isSuperable: category.isSuperable,
    rate: String(category.rate),
    unit: category.unit,
    sortOrder: String(category.sortOrder),
    isActive: category.isActive,
  });

  async function save() {
    if (form.name.trim().length < 2 || form.code.trim().length < 2) {
      setError("Name and code are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/org/pay-categories/${category.id}`,
      "PATCH",
      payload(form),
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success("Pay category updated");
      setOpen(false);
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  async function toggle() {
    setSaving(true);
    const res = await apiCall(`/api/org/pay-categories/${category.id}`, "PATCH", {
      isActive: !category.isActive,
    });
    setSaving(false);
    if (res.ok) {
      toast.success(
        category.isActive ? "Category deactivated" : "Category activated"
      );
      router.refresh();
    }
  }

  async function remove() {
    setSaving(true);
    const res = await apiCall(`/api/org/pay-categories/${category.id}`, "DELETE");
    setSaving(false);
    if (res.ok) {
      toast.success("Pay category deleted");
      setConfirmDelete(false);
      router.refresh();
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      <button
        type="button"
        disabled={saving}
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        onClick={toggle}
      >
        {category.isActive ? "Deactivate" : "Activate"}
      </button>
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
        onClick={() => setConfirmDelete(true)}
      >
        Delete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit pay category"
        subtitle={`${category.name} · ${category.code}`}
      >
        <CategoryForm form={form} setForm={setForm} error={error} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete pay category?"
        subtitle={`${category.name} · ${category.code}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Historical pay runs keep their own line breakdown — deleting the category
            only removes it from future runs.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={saving} onClick={remove}>
              {saving ? "Deleting…" : "Delete category"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
