"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type PolicyFormInitial = {
  id: string;
  title: string;
  category: string;
  content: string;
  version: string;
  effectiveDate: string;
  reviewDate: string;
  isMandatory: boolean;
};

const EMPTY = {
  title: "",
  category: "General",
  content: "",
  version: "1.0",
  effectiveDate: "",
  reviewDate: "",
  isMandatory: false,
};

type Fields = typeof EMPTY;

/**
 * Create or update a policy. When `initial.id` is present the form PATCHes
 * /api/hr/policies/[id]; otherwise it POSTs to /api/hr/policies.
 */
export function PolicyForm({
  initial,
  categories,
}: {
  initial?: PolicyFormInitial;
  categories: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(
    initial
      ? {
          title: initial.title,
          category: initial.category,
          content: initial.content,
          version: initial.version,
          effectiveDate: initial.effectiveDate,
          reviewDate: initial.reviewDate,
          isMandatory: initial.isMandatory,
        }
      : { ...EMPTY }
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const editing = Boolean(initial?.id);
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const categoryOptions = Array.from(new Set([...categories, form.category]));

  async function submit() {
    setBusy(true);
    setErrors({});

    const body = {
      title: form.title.trim(),
      category: form.category,
      content: form.content,
      version: form.version.trim() || "1.0",
      effectiveDate: form.effectiveDate,
      reviewDate: form.reviewDate || null,
      isMandatory: form.isMandatory,
    };

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      editing ? `/api/hr/policies/${initial?.id}` : "/api/hr/policies",
      editing ? "PATCH" : "POST",
      body
    );
    setBusy(false);

    if (res.ok) {
      toast.success(editing ? "Policy updated" : "Policy created");
      router.push("/hr/policies");
      router.refresh();
      return;
    }

    if (res.data?.fields) setErrors(res.data.fields);
    else if (res.data?.error) setErrors({ form: res.data.error });
    toast.error(res.data?.error ?? "Could not save the policy");
  }

  return (
    <div className="card max-w-3xl p-5 sm:p-6">
      {errors.form && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {errors.form}
        </p>
      )}

      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="policy-title">
              Title
            </label>
            <input
              id="policy-title"
              className="input"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Remote Working Policy"
            />
            {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
          </div>
          <div>
            <label className="label" htmlFor="policy-category">
              Category
            </label>
            <select
              id="policy-category"
              className="input"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="mt-1 text-xs text-rose-600">{errors.category}</p>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="policy-content">
            Content
          </label>
          <textarea
            id="policy-content"
            className="input min-h-56 font-mono text-xs"
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            placeholder={"# Policy title\n\nDescribe the policy…"}
          />
          {errors.content && <p className="mt-1 text-xs text-rose-600">{errors.content}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="policy-version">
              Version
            </label>
            <input
              id="policy-version"
              className="input"
              value={form.version}
              onChange={(e) => set("version", e.target.value)}
              placeholder="1.0"
            />
            {errors.version && <p className="mt-1 text-xs text-rose-600">{errors.version}</p>}
          </div>
          <div>
            <label className="label" htmlFor="policy-effective">
              Effective date
            </label>
            <input
              id="policy-effective"
              type="date"
              className="input"
              value={form.effectiveDate}
              onChange={(e) => set("effectiveDate", e.target.value)}
            />
            {errors.effectiveDate && (
              <p className="mt-1 text-xs text-rose-600">{errors.effectiveDate}</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="policy-review">
              Review date
            </label>
            <input
              id="policy-review"
              type="date"
              className="input"
              value={form.reviewDate}
              onChange={(e) => set("reviewDate", e.target.value)}
            />
            {errors.reviewDate && (
              <p className="mt-1 text-xs text-rose-600">{errors.reviewDate}</p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isMandatory}
            onChange={(e) => set("isMandatory", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Mandatory — every employee must acknowledge it
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push("/hr/policies")}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create policy"}
          </button>
        </div>
      </div>
    </div>
  );
}
