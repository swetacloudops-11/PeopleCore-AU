import Link from "next/link";
import type { Metadata } from "next";
import { PLANS, ADD_ONS, FAQ } from "../content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple per-employee pricing for PeopleCore AU — HR, rostering, payroll and AI assistants.",
};

export default function PricingPage() {
  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pricing</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Pay per active employee, per month. Every plan includes the employee self-service portal
            and a full audit trail — no surprises.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`card flex flex-col p-5 ${
                p.featured ? "border-sky-400 ring-2 ring-sky-100" : ""
              }`}
            >
              {p.featured && (
                <span className="mb-2 w-fit rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                  Most popular
                </span>
              )}
              <h2 className="text-base font-semibold text-slate-900">{p.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{p.audience}</p>
              <div className="mt-4">
                <span className="text-3xl font-semibold text-slate-900">{p.price}</span>
                <span className="ml-1 text-xs text-slate-500">{p.unit}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/site/contact"
                className={`mt-6 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${
                  p.featured
                    ? "bg-sky-500 text-white hover:bg-sky-400"
                    : "border border-slate-300 text-slate-700 hover:border-slate-400"
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Prices in AUD, excluding GST. Minimum billing applies. Final pricing is confirmed on your
          proposal.
        </p>
      </section>

      <section className="bg-slate-50 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Add more power to your workflow
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ADD_ONS.map((a) => (
              <div key={a.name} className="card p-5">
                <h3 className="text-sm font-semibold text-slate-900">{a.name}</h3>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {a.price}
                  <span className="ml-1 text-xs font-normal text-slate-500">per employee / month</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{a.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Pricing questions</h2>
        <dl className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.slice(0, 3).map((f) => (
            <div key={f.q} className="py-4">
              <dt className="text-sm font-semibold text-slate-900">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <Link
            href="/site/contact"
            className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            Request a tailored quote
          </Link>
        </div>
      </section>
    </div>
  );
}
