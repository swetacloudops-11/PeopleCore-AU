"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

const INDUSTRIES = [
  "Accounting", "Agriculture", "Childcare", "Construction", "Energy",
  "Healthcare", "Hospitality", "Logistics", "Manufacturing", "Mining",
  "Retail", "Technology", "Tourism", "Wine", "Other",
];

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export type OrgInput = {
  id: string;
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  employeeCount: number;
  status: string;
};

export default function OrgEditForm({ org }: { org: OrgInput }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/organisations/${org.id}`,
      "PATCH",
      payload,
      { silent: true }
    );

    if (res.ok) {
      toast.success(`"${org.name}" updated`);
      router.push("/organisations");
      router.refresh();
      return;
    }

    if (res.data?.fields) setFieldErrors(res.data.fields);
    setError(res.data?.error ?? "Could not save changes");
    setBusy(false);
  }

  const err = (k: string) =>
    fieldErrors[k] ? <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p> : null;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Organisation details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Legal name *</label>
            <input id="name" name="name" defaultValue={org.name} className="input" required />
            {err("name")}
          </div>
          <div>
            <label className="label" htmlFor="abn">ABN</label>
            <input id="abn" name="abn" defaultValue={org.abn ?? ""} className="input" placeholder="61 123 456 789" />
            {err("abn")}
          </div>
          <div>
            <label className="label" htmlFor="industry">Industry</label>
            <select id="industry" name="industry" defaultValue={org.industry ?? ""} className="input">
              <option value="">Select industry…</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="email">Contact email *</label>
            <input id="email" name="email" type="email" defaultValue={org.email ?? ""} className="input" required />
            {err("email")}
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" defaultValue={org.phone ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="employeeCount">Employee count</label>
            <input
              id="employeeCount"
              name="employeeCount"
              type="number"
              min={0}
              defaultValue={org.employeeCount}
              className="input"
            />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Address
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addressLine1">Street address</label>
            <input id="addressLine1" name="addressLine1" defaultValue={org.addressLine1 ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="city">City / Suburb</label>
            <input id="city" name="city" defaultValue={org.city ?? ""} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="state">State</label>
              <select id="state" name="state" defaultValue={org.state ?? "NSW"} className="input">
                {STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="postcode">Postcode</label>
              <input id="postcode" name="postcode" defaultValue={org.postcode ?? ""} className="input" />
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
