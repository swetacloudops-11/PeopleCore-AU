import Link from "next/link";
import { BRAND, SOLUTIONS, INDUSTRIES } from "@/app/site/content";

const COMPANY = [
  { href: "/site/about", label: "About us" },
  { href: "/site/contact", label: "Contact" },
  { href: "/site/contact", label: "Book a demo" },
  { href: "/site/pricing", label: "Pricing" },
];

const GET_STARTED = [
  { href: "/site/login", label: "Login" },
  { href: "/site/login", label: "Choose your workspace" },
  { href: "/site/contact", label: "Talk to sales" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5 text-white">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500 text-sm font-bold">
                P
              </span>
              <span className="text-sm font-semibold">{BRAND.name}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed">{BRAND.tagline}</p>
            <p className="mt-3 text-xs text-slate-500">
              Built for Australian employers. Multi-tenant, audit-ready, AI-assisted.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Solutions</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {SOLUTIONS.map((s) => (
                <li key={s.slug}>
                  <Link href={`/site/solutions/${s.slug}`} className="transition hover:text-white">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Industries</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {INDUSTRIES.map((i) => (
                <li key={i.slug}>
                  <Link href={`/site/industries/${i.slug}`} className="transition hover:text-white">
                    {i.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-1">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Company</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {COMPANY.map((c, i) => (
                  <li key={`${c.label}-${i}`}>
                    <Link href={c.href} className="transition hover:text-white">
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Get started</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {GET_STARTED.map((c, i) => (
                  <li key={`${c.label}-${i}`}>
                    <Link href={c.href} className="transition hover:text-white">
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
          <span>{BRAND.supportEmail}</span>
        </div>
      </div>
    </footer>
  );
}
