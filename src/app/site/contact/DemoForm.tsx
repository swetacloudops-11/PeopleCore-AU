"use client";

import { useState } from "react";
import { apiCall } from "@/lib/client-api";

type Fields = {
  name?: string;
  email?: string;
  company?: string;
  teamSize?: string;
  message?: string;
};

const TEAM_SIZES = ["1–20", "21–50", "51–200", "201–500", "500+"];

export default function DemoForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    teamSize: TEAM_SIZES[1],
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setError(null);

    const res = await apiCall<{ error?: string; fields?: Fields }>(
      "/api/site/demo",
      "POST",
      form,
      { silent: true }
    );
    setBusy(false);

    if (res.ok) {
      setSent(true);
      return;
    }
    setErrors(res.data?.fields ?? {});
    setError(res.data?.error ?? "Something went wrong — please try again.");
  }

  if (sent) {
    return (
      <div className="card grid place-items-center p-10 text-center">
        <div className="text-3xl">✅</div>
        <h2 className="mt-3 text-base font-semibold text-slate-900">Thanks — we&apos;ve got it.</h2>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          A member of our team will be in touch shortly. In the meantime you can explore the live demo
          workspace with sample data.
        </p>
        <a
          href="/site/login"
          className="mt-5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
        >
          Open the demo workspace
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your name *</span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Jane Citizen"
            required
          />
          {errors.name && <span className="mt-1 block text-xs text-rose-600">{errors.name}</span>}
        </label>

        <label className="block">
          <span className="label">Work email *</span>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jane@company.com.au"
            required
          />
          {errors.email && <span className="mt-1 block text-xs text-rose-600">{errors.email}</span>}
        </label>

        <label className="block">
          <span className="label">Company</span>
          <input
            className="input"
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder="Company Pty Ltd"
          />
          {errors.company && <span className="mt-1 block text-xs text-rose-600">{errors.company}</span>}
        </label>

        <label className="block">
          <span className="label">Team size</span>
          <select
            className="input"
            value={form.teamSize}
            onChange={(e) => set("teamSize", e.target.value)}
          >
            {TEAM_SIZES.map((t) => (
              <option key={t} value={t}>
                {t} employees
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="label">What would you like to see?</span>
        <textarea
          className="input"
          rows={4}
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          placeholder="e.g. We roster 40 casual staff across two sites and run fortnightly payroll."
        />
        {errors.message && <span className="mt-1 block text-xs text-rose-600">{errors.message}</span>}
      </label>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Request a demo"}
        </button>
        <span className="text-xs text-slate-500">No obligation. We reply within one business day.</span>
      </div>
    </form>
  );
}
