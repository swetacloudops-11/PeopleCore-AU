import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SOLUTIONS } from "../../content";

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const solution = SOLUTIONS.find((s) => s.slug === slug);
  if (!solution) return { title: "Solution" };
  return { title: solution.name, description: solution.summary };
}

export default async function SolutionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const solution = SOLUTIONS.find((s) => s.slug === slug);
  if (!solution) notFound();

  const others = SOLUTIONS.filter((s) => s.slug !== solution.slug);

  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Link href="/site/solutions" className="text-xs font-medium text-sky-400">
            ← All solutions
          </Link>
          <div className="mt-5 flex items-center gap-3">
            <span className="text-3xl">{solution.icon}</span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
              {solution.builtIn}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {solution.name}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            {solution.summary}
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
              See it live
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">What&apos;s included</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {solution.features.map((f) => (
            <li
              key={f}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            >
              <span className="text-emerald-500">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-50 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Explore next</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/site/solutions/${o.slug}`}
                className="card p-4 transition hover:border-sky-300 hover:shadow-sm"
              >
                <div className="text-xl">{o.icon}</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{o.name}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">{o.tagline}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
