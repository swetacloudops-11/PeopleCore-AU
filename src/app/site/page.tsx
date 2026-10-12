import Link from "next/link";
import {
  STATS,
  SOLUTIONS,
  INDUSTRIES,
  CONSOLES,
  FAQ,
  BRAND,
} from "./content";

export default function SiteHomePage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-medium text-sky-300">
            🇦🇺 Built for Australian employers
          </p>
          <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Employment. <span className="text-sky-400">Intelligently run.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            PeopleCore AU keeps your people, rosters, time, payroll and compliance in one
            platform — with an AI assistant in every console that answers from your own data.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/site/contact"
              className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Book a demo
            </Link>
            <Link
              href="/site/login"
              className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Explore a workspace →
            </Link>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-6 border-t border-slate-800 pt-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="text-2xl font-semibold text-white sm:text-3xl">{s.value}</dt>
                <dd className="mt-1 text-xs text-slate-400">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Solutions ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            One platform. Five jobs done.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Everything below is live in the product today — not a roadmap.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.slug}
              href={`/site/solutions/${s.slug}`}
              className="card group p-5 transition hover:border-sky-300 hover:shadow-md"
            >
              <div className="text-2xl">{s.icon}</div>
              <h3 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-sky-700">
                {s.name}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.tagline}</p>
              <span className="mt-3 inline-block text-xs font-medium text-sky-600">
                Learn more →
              </span>
            </Link>
          ))}
          <div className="card flex flex-col justify-center bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-900">Everything connected</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              A roster becomes attendance, attendance becomes a timesheet, and timesheets flow into
              pay runs — no re-typing between systems.
            </p>
            <Link href="/site/pricing" className="mt-3 text-xs font-medium text-sky-600">
              See pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* ── AI spotlight ── */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-300">
              🤖 AI in every console
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Ask your HR system a question.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              The assistant answers from live organisation data and tells you exactly where a feature
              lives in the portal — so new staff stop needing a walkthrough.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                "“How many employees do we have?” — answered from real records",
                "“Which certifications are expiring?” — with the urgent list",
                "“How do I request a shift swap?” — with the exact page",
              ].map((q) => (
                <li key={q} className="flex gap-3">
                  <span className="text-sky-400">▸</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/site/solutions/ai-assistants"
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
              >
                How it works
              </Link>
              <Link
                href="/site/login"
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
              >
                Try the demo workspace
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-5">
            <div className="rounded-xl bg-slate-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                HR Assistant
              </p>
              <div className="mt-3 space-y-3 text-sm">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-sky-600 px-3 py-2 text-white">
                  Which certifications are expiring?
                </p>
                <div className="w-fit max-w-[92%] rounded-2xl bg-slate-800 px-3 py-2 text-slate-200 ring-1 ring-slate-700">
                  144 certification records on file — <strong>35 expiring</strong>, 15 already
                  expired. Most urgent first:
                  <ul className="mt-2 space-y-1 text-xs text-slate-400">
                    <li>• First Aid — expiring in 4 days</li>
                    <li>• White Card — expiring in 11 days</li>
                    <li>• RSA — expired 2 days ago</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Consoles ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            A workspace for every role
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Four consoles, one platform. Each person only sees what their role allows.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONSOLES.map((c) => (
            <div key={c.name} className="card p-5">
              <div className="text-2xl">{c.icon}</div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{c.name}</h3>
              <p className="text-[11px] font-medium uppercase tracking-wide text-sky-600">{c.who}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Industries ── */}
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Built for the way your industry works
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Rosters, certifications and award-sensitive hours — configured for your sector.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((i) => (
              <Link
                key={i.slug}
                href={`/site/industries/${i.slug}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-sky-300 hover:shadow-sm"
              >
                <span className="text-xl">{i.icon}</span>
                <span className="text-sm font-medium text-slate-800">{i.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Frequently asked questions
        </h2>
        <dl className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="text-sm font-semibold text-slate-900">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── CTA ── */}
      <section className="bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-white sm:text-2xl">
              Ready to run employment intelligently?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Book a demo, or explore the live workspace with sample data. {BRAND.supportEmail}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/site/contact"
              className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Book a demo
            </Link>
            <Link
              href="/site/pricing"
              className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
