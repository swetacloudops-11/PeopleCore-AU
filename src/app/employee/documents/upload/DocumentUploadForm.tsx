"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

const CATEGORIES = [
  "Contract",
  "Identification",
  "Qualification",
  "Medical",
  "Police Check",
  "Visa",
  "Tax",
  "Other",
];

/**
 * Self-service document upload. A file may be selected so its name and size
 * can be recorded, but the bytes are never read or sent — metadata only.
 */
export default function DocumentUploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: "", category: "Other", expiryDate: "" });
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const picked = ev.target.files?.[0];
    if (!picked) return;
    // Name and size only — the file contents are never read.
    setFile({ name: picked.name, size: picked.size });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/employee/documents",
      "POST",
      {
        title: form.title.trim(),
        category: form.category,
        fileName: file?.name,
        fileSize: file ? file.size : undefined,
        expiryDate: form.expiryDate || undefined,
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Document uploaded");
    setForm({ title: "", category: form.category, expiryDate: "" });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="label">Title</span>
        <input
          className="input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Employment contract — signed copy"
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
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errors.category && (
          <span className="mt-1 block text-[11px] text-rose-600">{errors.category}</span>
        )}
      </label>

      <label className="block">
        <span className="label">Expiry date (optional)</span>
        <input
          type="date"
          className="input"
          value={form.expiryDate}
          onChange={(e) => set("expiryDate", e.target.value)}
        />
        {errors.expiryDate && (
          <span className="mt-1 block text-[11px] text-rose-600">{errors.expiryDate}</span>
        )}
      </label>

      <label className="block sm:col-span-2">
        <span className="label">Choose a file (optional)</span>
        <input
          ref={fileRef}
          type="file"
          onChange={onFile}
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-violet-700"
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          Only the file name and size are recorded — the file itself is never uploaded.
        </span>
      </label>

      {file && (
        <p className="text-xs text-slate-500 sm:col-span-2">
          Attached: <span className="font-medium text-slate-700">{file.name}</span> ·{" "}
          {(file.size / 1024).toFixed(1)} KB
        </p>
      )}

      <div className="flex justify-end pt-1 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Uploading…" : "Upload document"}
        </button>
      </div>
    </form>
  );
}
