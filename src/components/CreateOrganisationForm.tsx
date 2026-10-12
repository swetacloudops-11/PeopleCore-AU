"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INDUSTRIES = [
  "Accounting", "Agriculture", "Childcare", "Construction", "Energy",
  "Healthcare", "Hospitality", "Logistics", "Manufacturing", "Mining",
  "Retail", "Technology", "Tourism", "Wine", "Other",
];

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

const PLANS = [
  { code: "STARTER", label: "Starter — $49/mo" },
  { code: "GROWTH", label: "Growth — $149/mo" },
  { code: "BUSINESS", label: "Business — $399/mo" },
  { code: "ENTERPRISE", label: "Enterprise — $1,299/mo" },
];

export default function CreateOrganisationForm({ plans }: { plans: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const planOptions = plans.length
    ? plans.map((p) => ({ code: p.code, label: p.name }))
    : PLANS;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.fields) setFieldErrors(data.fields);
        setError(data?.error ?? "Could not create organisation");
        setBusy(false);
        return;
      }
      router.push("/organisations");
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setBusy(false);
    }
  }

  const err = (k: string) =>
    fieldErrors[k] ? (
      <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="card mb-4 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Organisation details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Legal name *</label>
            <input id="name" name="name" className="input" placeholder="Harbour Logistics Pty Ltd" required />
            {err("name")}
          </div>
          <div>
            <label className="label" htmlFor="abn">ABN</label>
            <input id="abn" name="abn" className="input" placeholder="61 123 456 789" />
            {err("abn")}
          </div>
          <div>
            <label className="label" htmlFor="industry">Industry</label>
            <select id="industry" name="industry" className="input" defaultValue="">
              <option value="">Select industry…</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="email">Contact email *</label>
            <input id="email" name="email" type="email" className="input" placeholder="hr@company.com.au" required />
            {err("email")}
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className="input" placeholder="02 9000 1234" />
          </div>
          <div>
            <label className="label" htmlFor="employeeCount">Employee count</label>
            <input id="employeeCount" name="employeeCount" type="number" min={0} className="input" placeholder="50" defaultValue={0} />
          </div>
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Address
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addressLine1">Street address</label>
            <input id="addressLine1" name="addressLine1" className="input" placeholder="10 Harbour Street" />
          </div>
          <div>
            <label className="label" htmlFor="city">City / Suburb</label>
            <input id="city" name="city" className="input" placeholder="Sydney" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="state">State</label>
              <select id="state" name="state" className="input" defaultValue="NSW">
                {STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="postcode">Postcode</label>
              <input id="postcode" name="postcode" className="input" placeholder="2000" />
            </div>
          </div>
        </div>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Subscription
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="planCode">Plan</label>
            <select id="planCode" name="planCode" className="input" defaultValue="GROWTH">
              {planOptions.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cycle">Billing cycle</label>
            <select id="cycle" name="cycle" className="input" defaultValue="MONTHLY">
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual (2 months free)</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Creating…" : "Create organisation"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
