"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; name: string };

const EMPTY = {
  employeeId: "",
  title: "",
  category: "Other",
  fileName: "",
  fileType: "",
  fileSize: "",
  url: "",
  expiryDate: "",
  isConfidential: false,
};

/**
 * Records document metadata only. A real file may be selected so we can read
 * its name/type/size, but the bytes are never read or uploaded.
 */
export default function DocumentUploadForm({
  employees,
  categories,
}: {
  employees: Option[];
  categories: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ ...EMPTY, category: categories[0] ?? "Other" });

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    // Name/type/size only — never read the file contents.
    setForm((f) => ({
      ...f,
      fileName: file.name,
      fileType: file.type,
      fileSize: String(file.size),
    }));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/hr/documents",
      "POST",
      {
        employeeId: form.employeeId,
        title: form.title,
        category: form.category,
        fileName: form.fileName,
        fileType: form.fileType,
        fileSize: form.fileSize === "" ? 0 : Number(form.fileSize),
        url: form.url,
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
    setForm({ ...EMPTY, category: categories[0] ?? "Other" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="label">Employee</span>
        <select
          className="input"
          value={form.employeeId}
          onChange={(e) => set("employeeId", e.target.value)}
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
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Employment contract"
          required
        />
        {errors.title && (
          <span className="mt-1 block text-[11px] text-rose-600">{errors.title}</span>
        )}
      </label>

      <label className="block">
        <span className="label">Category</span>
        <select
          className="input"
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block sm:col-span-2">
        <span className="label">Choose a file</span>
        <input
          type="file"
          onChange={onFile}
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-sky-700"
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          Only the file name, type and size are recorded — the file itself is not stored.
        </span>
      </label>

      <label className="block">
        <span className="label">File name</span>
        <input
          className="input"
          value={form.fileName}
          onChange={(e) => set("fileName", e.target.value)}
          placeholder="e.g. employment-contract.pdf"
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
          onChange={(e) => set("fileSize", e.target.value)}
          placeholder="0"
        />
      </label>

      <label className="block">
        <span className="label">Document URL (optional)</span>
        <input
          className="input"
          value={form.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="/files/documents/…"
        />
      </label>

      <label className="block">
        <span className="label">Expiry date (optional)</span>
        <input
          type="date"
          className="input"
          value={form.expiryDate}
          onChange={(e) => set("expiryDate", e.target.value)}
        />
      </label>

      <label className="flex items-end gap-2 pb-2 text-sm text-slate-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.isConfidential}
          onChange={(e) => set("isConfidential", e.target.checked)}
        />
        Mark as confidential
      </label>

      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setForm({ ...EMPTY, category: categories[0] ?? "Other" })}
          disabled={busy}
        >
          Reset
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Recording…" : "Record document"}
        </button>
      </div>
    </form>
  );
}
