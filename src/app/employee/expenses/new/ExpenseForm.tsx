"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Only the file's name and size are ever kept — the bytes stay on the device. */
type ReceiptMeta = { name: string; size: number };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function F({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>
      )}
    </label>
  );
}

export function ExpenseForm({
  categories,
  today,
}: {
  categories: string[];
  today: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);
  const [receipt, setReceipt] = useState<ReceiptMeta | null>(null);
  const [isReimbursable, setIsReimbursable] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const amountNum = Number(amount);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const next: Record<string, string> = {};
    if (category.trim().length < 2) next.category = "Choose or type a category (at least 2 characters)";
    if (description.trim().length < 3) next.description = "Describe the expense (at least 3 characters)";
    if (amount === "" || !Number.isFinite(amountNum) || amountNum <= 0) {
      next.amount = "Enter an amount greater than 0";
    }
    if (!expenseDate) next.expenseDate = "Pick the expense date";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/employee/expenses",
      "POST",
      {
        category: category.trim(),
        description: description.trim(),
        amount: Number(amount),
        expenseDate,
        receiptName: receipt?.name ?? undefined,
        isReimbursable,
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Expense claim submitted");
    router.push("/employee/expenses");
  }

  return (
    <form onSubmit={submit} className="card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <F
          label="Category"
          error={errors.category}
          hint="Pick a suggestion or type your own."
        >
          <input
            className="input"
            list="claim-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Travel — fuel"
          />
          <datalist id="claim-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </F>

        <F label="Amount (AUD)" error={errors.amount}>
          <input
            type="number"
            min={0.01}
            max={100000}
            step={0.01}
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </F>

        <div className="sm:col-span-2">
          <F label="Description" error={errors.description}>
            <textarea
              rows={3}
              maxLength={300}
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fuel for the client site visit to Coffs Harbour"
            />
          </F>
        </div>

        <F
          label="Expense date"
          error={errors.expenseDate}
          hint="Claims can be dated up to 7 days ahead."
        >
          <input
            type="date"
            className="input"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </F>

        <F
          label="Receipt (optional)"
          hint="Only the file name and size are recorded."
          error={errors.receiptName}
        >
          <input
            type="file"
            accept="image/*,.pdf"
            className="input"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setReceipt(f ? { name: f.name, size: f.size } : null);
            }}
          />
        </F>

        {receipt && (
          <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
            Receipt attached: {receipt.name} ({formatSize(receipt.size)})
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 accent-violet-600"
              checked={isReimbursable}
              onChange={(e) => setIsReimbursable(e.target.checked)}
            />
            <span>
              <span className="block text-[13px] font-medium text-slate-700">
                Reimbursable claim
              </span>
              <span className="block text-[11px] text-slate-400">
                Untick if this expense was paid directly by the company.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={() => router.push("/employee/expenses")}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit claim"}
          </button>
        </div>
      </div>
    </form>
  );
}
