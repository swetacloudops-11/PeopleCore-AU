import Link from "next/link";
import type { Metadata } from "next";
import { STATS, SOLUTIONS, CONSOLES, BRAND } from "../content";

export const metadata: Metadata = {
  title: "About",
  description:
    "PeopleCore AU is an Australian multi-tenant HR platform covering people, rostering, time, payroll and compliance.",
};

export default function AboutPage() {
  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            About {BRAND.name}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            {BRAND.tagline} We build for Australian employers who are tired of stitching a payroll
            tool, a rostering app and three spreadsheets together.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-slate-800 pt-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="text-2xl font-semibold text-white sm:text-3xl">{s.value}</dt>
                <dd className="mt-1 text-xs text-slate-400">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Our approach</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-600">
              <p>
                Employment data is one connected story: a roster becomes attendance, attendance becomes
                a timesheet, and timesheets flow into a pay run. Most tools break that chain — so teams
                re-type the same information three times.
              </p>
              <p>
                PeopleCore AU keeps the chain intact in a single multi-tenant platform, with
                role-scoped consoles so each person sees exactly what they need — and nothing they
                shouldn&apos;t.
              </p>
              <p>
                We also think AI should answer questions, not invent them. Every assistant in the
                product is grounded in your organisation&apos;s live records, and the employee assistant
                can only ever see that person&apos;s own file.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">What we cover</h2>
            <ul className="mt-4 space-y-3">
              {SOLUTIONS.map((s) => (
                <li key={s.slug} className="flex gap-3 text-sm text-slate-700">
                  <span className="text-lg">{s.icon}</span>
                  <span>
                    <span className="font-medium text-slate-900">{s.name}</span> — {s.tagline}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Four consoles</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONSOLES.map((c) => (
              <div key={c.name} className="card p-5">
                <div className="text-2xl">{c.icon}</div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{c.name}</h3>
                <p className="text-[11px] font-medium uppercase tracking-wide text-sky-600">{c.who}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-base font-semibold text-slate-900">Talk to us</h2>
          <p className="mt-2 text-sm text-slate-600">
            Questions about fit, migration or pricing? We&apos;ll walk you through the platform with your
            own scenario. {BRAND.supportEmail}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/site/contact"
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Book a demo
            </Link>
            <Link
              href="/site/pricing"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
