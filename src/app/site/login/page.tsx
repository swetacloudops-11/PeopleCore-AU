import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Choose your workspace",
  description: "Sign in to the PeopleCore AU demo — Super Admin, Organisation Admin, HR Admin or Employee.",
};

const WORKSPACES = [
  {
    icon: "🛠️",
    name: "Super Admin",
    who: "Platform owner",
    desc: "Organisations, plans, subscriptions, security and audit logs.",
    email: "super@jabit.com",
    accent: "border-indigo-200 hover:border-indigo-400",
    badge: "bg-indigo-50 text-indigo-700",
  },
  {
    icon: "🏢",
    name: "Organisation Admin",
    who: "Business owner / ops",
    desc: "People, rostering, payroll, expenses and performance.",
    email: "organ@jabit.com",
    accent: "border-emerald-200 hover:border-emerald-400",
    badge: "bg-emerald-50 text-emerald-700",
  },
  {
    icon: "👥",
    name: "HR Admin",
    who: "HR team",
    desc: "Onboarding, leave, documents, policies and certifications.",
    email: "hr@jabitsoft.com",
    accent: "border-sky-200 hover:border-sky-400",
    badge: "bg-sky-50 text-sky-700",
  },
  {
    icon: "🙋",
    name: "Employee",
    who: "Team member",
    desc: "My roster, clock in/out, leave, payslips and tasks.",
    email: "employee@jabitsoft.com",
    accent: "border-violet-200 hover:border-violet-400",
    badge: "bg-violet-50 text-violet-700",
  },
];

const PASSWORD = "Admin@1234";

export default function WorkspacePickerPage() {
  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose your workspace
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            This demo environment contains sample data for a fictional organisation. Pick the console
            you&apos;d like to explore — each one is signed in separately.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {WORKSPACES.map((w) => (
            <div key={w.name} className={`card border-2 p-6 transition ${w.accent}`}>
              <div className="flex items-start justify-between">
                <span className="text-3xl">{w.icon}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${w.badge}`}>
                  {w.who}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{w.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{w.desc}</p>

              <dl className="mt-4 space-y-1.5 rounded-lg bg-slate-50 px-3 py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="font-mono font-medium text-slate-800">{w.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Password</dt>
                  <dd className="font-mono font-medium text-slate-800">{PASSWORD}</dd>
                </div>
              </dl>

              <Link
                href="/login"
                className="mt-5 block rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Go to the login page →
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-semibold text-slate-900">How sign-in works</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            All four consoles use the same login page. After you sign in, you&apos;re taken straight to the
            console that matches your role — you can&apos;t accidentally land in someone else&apos;s workspace.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Sample data only. Please don&apos;t enter real personal information.
          </p>
        </div>
      </section>
    </div>
  );
}
