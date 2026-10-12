import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}

export default async function EmployeeSettingsPage() {
  const { employee, session, org } = await employeeContext();

  // Real session info only — last sign-in comes straight from the User row.
  const account = await prisma.user.findUnique({
    where: { id: session.id },
    select: { email: true, lastLoginAt: true },
  });

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Account Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your sign-in, notification preferences and session.
        </p>
      </div>

      {/* ── Account overview ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Account overview</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="Name" value={fullName} />
            <Info label="Email" value={account?.email ?? session.email} />
            <Info
              label="Role"
              value={
                session.roles.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {session.roles.map((r) => (
                      <Badge key={r} tone="purple">
                        {r}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Info
              label="Linked employee"
              value={`${employee.employeeNumber} · ${fullName}`}
            />
            <Info label="Organisation" value={org.name} />
            <Info
              label="Last sign-in"
              value={account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : "—"}
            />
          </dl>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Session</h2>
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">Signed in as</dt>
              <dd className="text-right font-medium text-slate-700">{session.email}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">Last sign-in</dt>
              <dd className="text-right font-medium text-slate-700">
                {account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">Organisation</dt>
              <dd className="text-right font-medium text-slate-700">{org.name}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
            You are signed into the employee self-service portal, scoped to your own records only.
          </p>
        </div>
      </div>

      {/* ── Quick links ── */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">Quick links</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/employee/settings/password"
          className="card group flex items-start gap-3 p-4 transition hover:border-violet-300 hover:shadow"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-lg">
            🔑
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800 group-hover:text-violet-700">
              Change Password
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Update the password you use to sign in.
            </span>
          </span>
        </Link>

        <Link
          href="/employee/settings/notifications"
          className="card group flex items-start gap-3 p-4 transition hover:border-violet-300 hover:shadow"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-lg">
            🔔
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800 group-hover:text-violet-700">
              Notification Preferences
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Choose which updates you get and how.
            </span>
          </span>
        </Link>
      </div>

      {/* ── Danger zone ── */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">Danger zone</h2>
      <div className="card border-rose-200 bg-rose-50 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-100 text-lg">
            🚪
          </span>
          <div>
            <h3 className="text-sm font-semibold text-rose-800">Signing out</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-rose-700/80">
              Use the <span className="font-semibold">Sign out</span> button in the top bar to end
              this session immediately. Signing out never deletes anything — your payslips, leave
              history, timesheets and documents stay exactly as they are and will be here when you
              sign back in. If you think someone else has used your account, change your password
              from the link above first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
