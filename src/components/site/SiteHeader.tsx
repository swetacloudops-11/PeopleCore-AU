import Link from "next/link";

const NAV = [
  { href: "/site/solutions", label: "Solutions" },
  { href: "/site/industries", label: "Industries" },
  { href: "/site/pricing", label: "Pricing" },
  { href: "/site/about", label: "About" },
  { href: "/site/contact", label: "Contact" },
];

/** Public marketing header. Links into the app only via /login. */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/site" className="flex items-center gap-2.5 text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500 text-sm font-bold">
            P
          </span>
          <span className="text-sm font-semibold tracking-tight">
            PeopleCore <span className="text-sky-400">AU</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-300">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/site/login"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/site/contact"
            className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            Book a demo
          </Link>
        </div>
      </div>
    </header>
  );
}
