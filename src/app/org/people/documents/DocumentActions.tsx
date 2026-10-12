"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; name: string };

export type DocumentRow = {
  id: string;
  title: string;
  category: string;
  fileName: string;
  expiryDate: string | null;
  isConfidential: boolean;
  employeeId: string;
  employeeName: string;
};

/** Upload modal — records document metadata with a synthetic URL (no real file storage). */
export function UploadDocumentButton({
  employees,
  categories,
}: {
  employees: Option[];
  categories: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    employeeId: "",
    title: "",
    category: categories[0] ?? "Other",
    fileName: "",
    fileSize: "",
    expiryDate: "",
    isConfidential: false,
  });

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/org/documents",
      "POST",
      {
        employeeId: form.employeeId,
        title: form.title,
        category: form.category,
        fileName: form.fileName,
        fileSize: form.fileSize === "" ? 0 : Number(form.fileSize),
        expiryDate: form.expiryDate,
        isConfidential: form.isConfidential,
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Document recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Upload document
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record document"
        subtitle="Metadata only — the file itself is not stored in this demo environment."
        width="max-w-xl"
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">Employee</span>
            <select
              className="input"
              value={form.employeeId}
              onChange={(e) => set("employeeId")(e.target.value)}
              required
            >
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {errors.employeeId && (
              <span className="mt-1 block text-[11px] text-rose-600">{errors.employeeId}</span>
            )}
          </label>
          <label className="block">
            <span className="label">Title</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              placeholder="e.g. First Aid Certificate"
              required
            />
            {errors.title && <span className="mt-1 block text-[11px] text-rose-600">{errors.title}</span>}
          </label>
          <label className="block">
            <span className="label">Category</span>
            <select
              className="input"
              value={form.category}
              onChange={(e) => set("category")(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">File name</span>
            <input
              className="input"
              value={form.fileName}
              onChange={(e) => set("fileName")(e.target.value)}
              placeholder="e.g. first-aid-cert.pdf"
              required
            />
            {errors.fileName && (
              <span className="mt-1 block text-[11px] text-rose-600">{errors.fileName}</span>
            )}
          </label>
          <label className="block">
            <span className="label">File size (bytes)</span>
            <input
              type="number"
              min={0}
              className="input"
              value={form.fileSize}
              onChange={(e) => set("fileSize")(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="label">Expiry date</span>
            <input
              type="date"
              className="input"
              value={form.expiryDate}
              onChange={(e) => set("expiryDate")(e.target.value)}
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isConfidential}
              onChange={(e) => set("isConfidential")(e.target.checked)}
            />
            Confidential
          </label>
          <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Record document"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Row actions: edit metadata + delete. */
export function DocumentRowActions({
  document,
  categories,
}: {
  document: DocumentRow;
  categories: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: document.title,
    category: document.category,
    expiryDate: document.expiryDate ? document.expiryDate.slice(0, 10) : "",
    isConfidential: document.isConfidential,
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/org/documents/${document.id}`,
      "PATCH",
      {
        title: form.title,
        category: form.category,
        expiryDate: form.expiryDate,
        isConfidential: form.isConfidential,
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Document updated");
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete document "${document.title}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/documents/${document.id}`, "DELETE");
    setBusy(false);
    if (!res.ok) return;
    toast.success("Document deleted");
    router.refresh();
  }

  const allCategories = Array.from(new Set([document.category, ...categories]));

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
      >
        Delete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit document"
        subtitle={document.fileName}
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Title</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            {errors.title && <span className="mt-1 block text-[11px] text-rose-600">{errors.title}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Category</span>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Expiry date</span>
              <input
                type="date"
                className="input"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isConfidential}
              onChange={(e) => setForm((f) => ({ ...f, isConfidential: e.target.checked }))}
            />
            Confidential
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
