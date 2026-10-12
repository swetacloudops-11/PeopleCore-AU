import Link from "next/link";
import type { Metadata } from "next";
import { INDUSTRIES } from "../content";

export const metadata: Metadata = {
  title: "Industries",
  description:
    "PeopleCore AU for hospitality, healthcare, childcare, logistics, manufacturing and payroll bureaus.",
};

export default function IndustriesIndexPage() {
  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Industries</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Rosters, certifications and award-sensitive hours vary by sector. See how PeopleCore AU
            is set up for yours.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((i) => (
            <Link
              key={i.slug}
              href={`/site/industries/${i.slug}`}
              className="card group p-5 transition hover:border-sky-300 hover:shadow-md"
            >
              <span className="text-3xl">{i.icon}</span>
              <h2 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-sky-700">
                {i.name}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{i.summary}</p>
              <span className="mt-3 inline-block text-xs font-medium text-sky-600">See details →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
