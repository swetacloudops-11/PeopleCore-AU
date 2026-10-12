"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type ProfileEditValues = {
  preferredName: string;
  phone: string;
  personalEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type FieldKey = keyof ProfileEditValues;

export default function ProfileForm({ initial }: { initial: ProfileEditValues }) {
  const router = useRouter();
  const [form, setForm] = useState<ProfileEditValues>(initial);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  function set(key: FieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});

    const res = await apiCall<{ fields?: Record<string, string>; error?: string }>(
      "/api/employee/profile",
      "PATCH",
      form
    );

    setBusy(false);
    if (res.ok) {
      toast.success("Profile updated");
      router.push("/employee/profile");
    } else if (res.data?.fields) {
      setFields(res.data.fields);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Edit your details</h2>
      <p className="mt-1 text-xs text-slate-500">
        These are the only profile fields you can change — leave a field blank to clear it.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pf-preferredName">
            Preferred name
          </label>
          <input
            id="pf-preferredName"
            className="input"
            value={form.preferredName}
            placeholder="What you like to be called"
            onChange={(e) => set("preferredName", e.target.value)}
          />
          {fields.preferredName && (
            <p className="mt-1 text-xs text-rose-600">{fields.preferredName}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="pf-phone">
            Phone
          </label>
          <input
            id="pf-phone"
            className="input"
            value={form.phone}
            placeholder="0400 000 000"
            onChange={(e) => set("phone", e.target.value)}
          />
          {fields.phone && <p className="mt-1 text-xs text-rose-600">{fields.phone}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="pf-personalEmail">
            Personal email
          </label>
          <input
            id="pf-personalEmail"
            type="email"
            className="input"
            value={form.personalEmail}
            placeholder="you@example.com"
            onChange={(e) => set("personalEmail", e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Optional — leave blank if you&apos;d rather only use your work email.
          </p>
          {fields.personalEmail && (
            <p className="mt-1 text-xs text-rose-600">{fields.personalEmail}</p>
          )}
        </div>
      </div>

      <h3 className="mb-3 mt-6 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-800">
        Emergency contact
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pf-emergencyName">
            Contact name
          </label>
          <input
            id="pf-emergencyName"
            className="input"
            value={form.emergencyContactName}
            placeholder="Who we should call"
            onChange={(e) => set("emergencyContactName", e.target.value)}
          />
          {fields.emergencyContactName && (
            <p className="mt-1 text-xs text-rose-600">{fields.emergencyContactName}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="pf-emergencyPhone">
            Contact phone
          </label>
          <input
            id="pf-emergencyPhone"
            className="input"
            value={form.emergencyContactPhone}
            placeholder="0400 000 000"
            onChange={(e) => set("emergencyContactPhone", e.target.value)}
          />
          {fields.emergencyContactPhone && (
            <p className="mt-1 text-xs text-rose-600">{fields.emergencyContactPhone}</p>
          )}
        </div>
      </div>

      {fields.form && <p className="mt-3 text-xs text-rose-600">{fields.form}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Link href="/employee/profile" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
