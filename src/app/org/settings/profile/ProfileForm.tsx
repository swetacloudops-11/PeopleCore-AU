"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Profile = {
  name: string;
  abn: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postcode: string;
  industry: string;
};

const FIELDS: Array<{ key: keyof Profile; label: string; span?: string; placeholder?: string }> = [
  { key: "name", label: "Organisation name", span: "sm:col-span-2", placeholder: "Coral Coast Tourism" },
  { key: "abn", label: "ABN", placeholder: "61 123 456 789" },
  { key: "email", label: "Contact email", placeholder: "hr@company.com.au" },
  { key: "phone", label: "Phone", placeholder: "08 9000 0000" },
  { key: "industry", label: "Industry", placeholder: "Tourism" },
  { key: "addressLine1", label: "Street address", span: "sm:col-span-2", placeholder: "1 Harbour Street" },
  { key: "city", label: "City", placeholder: "Broome" },
  { key: "state", label: "State", placeholder: "WA" },
  { key: "postcode", label: "Postcode", placeholder: "6725" },
];

export default function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  function set(key: keyof Profile, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});

    const res = await apiCall<{ fields?: Record<string, string>; error?: string }>(
      "/api/org/org-profile",
      "PATCH",
      form
    );

    setBusy(false);
    if (res.ok) {
      toast.success("Organisation profile updated");
      router.refresh();
    } else if (res.data?.fields) {
      setFields(res.data.fields);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Edit profile</h2>
      <p className="mt-1 text-xs text-slate-500">
        Employee count, slug and status are system-managed and cannot be edited here.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.span ?? ""}>
            <label className="label" htmlFor={`pf-${f.key}`}>
              {f.label}
            </label>
            <input
              id={`pf-${f.key}`}
              className="input"
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
            {fields[f.key] && <p className="mt-1 text-xs text-rose-600">{fields[f.key]}</p>}
          </div>
        ))}
      </div>

      {fields.form && <p className="mt-3 text-xs text-rose-600">{fields.form}</p>}

      <div className="mt-5 flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
