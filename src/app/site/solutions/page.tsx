/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { SOLUTIONS } from "../content";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "HR & compliance, payroll, rostering and time, employee self-service and AI assistants — everything PeopleCore AU covers.",
};

export default function SolutionsIndexPage() {
  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Solutions</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Five capabilities, one platform. Pick the outcome you need — the data stays connected
            across all of them.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.slug}
              href={`/site/solutions/${s.slug}`}
              className="card group overflow-hidden transition hover:border-sky-300 hover:shadow-md"
            >
              <img
                src={s.image}
                alt={s.name}
                loading="lazy"
                className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {s.builtIn}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-900 group-hover:text-sky-700">
                  {s.name}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-700">{s.tagline}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{s.summary}</p>
                <span className="mt-4 inline-block text-xs font-medium text-sky-600">Learn more →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
