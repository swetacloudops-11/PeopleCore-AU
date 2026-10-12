/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { INDUSTRIES } from "../../content";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const industry = INDUSTRIES.find((i) => i.slug === slug);
  if (!industry) return { title: "Industry" };
  return { title: industry.name, description: industry.summary };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const industry = INDUSTRIES.find((i) => i.slug === slug);
  if (!industry) notFound();

  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <Link href="/site/industries" className="text-xs font-medium text-sky-400">
              ← All industries
            </Link>
            <div className="mt-5 text-3xl">{industry.icon}</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {industry.name}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
              {industry.summary}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
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

          <img
            src={industry.image}
            alt={industry.name}
            className="w-full rounded-2xl object-cover shadow-2xl ring-1 ring-slate-700"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          What matters in {industry.name}
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {industry.highlights.map((h) => (
            <li
              key={h}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700"
            >
              <span className="mr-2 text-emerald-500">✓</span>
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/site/solutions/rostering-time" className="btn-secondary">
            Rostering &amp; Time
          </Link>
          <Link href="/site/solutions/hr-compliance" className="btn-secondary">
            HR &amp; Compliance
          </Link>
          <Link href="/site/solutions/payroll" className="btn-secondary">
            Payroll
          </Link>
        </div>
      </section>
    </div>
  );
}
