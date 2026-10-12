import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader, Badge, StatCard } from "@/components/ui";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const [me, mySessions, myLogs, platformSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session!.id },
      include: { roleAssignments: { include: { role: true } } },
    }),
    prisma.userSession.count({
      where: { userId: session!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.auditLog.count({ where: { userId: session!.id } }),
    prisma.globalSetting.findMany({
      where: { group: { in: ["general", "billing"] } },
      orderBy: [{ group: "asc" }, { key: "asc" }],
    }),
  ]);

  if (!me) return null;

  const roles = me.roleAssignments.map((a) => a.role);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Settings"
        subtitle="Your account and platform preferences"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Roles assigned" value={roles.length} hint={roles.map((r) => r.name).join(", ") || "None"} tone="indigo" />
        <StatCard label="Active sessions" value={mySessions} tone="emerald" />
        <StatCard label="Audit events" value={myLogs} hint="Actions you performed" tone="sky" />
        <StatCard label="Member since" value={formatDate(me.createdAt)} tone="amber" />
      </div>

      <section className="card mb-5 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your profile
        </h2>

        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-indigo-600 text-xl font-semibold text-white">
            {initials(me.name)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{me.name}</h3>
              <Badge tone={me.status === "ACTIVE" ? "green" : "red"}>{me.status}</Badge>
            </div>
            <p className="text-sm text-slate-500">{me.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.length === 0 && <Badge tone="slate">NO ROLE</Badge>}
              {roles.map((r) => (
                <Badge key={r.id} tone="purple">{r.name}</Badge>
              ))}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <dt className="label">Last sign-in</dt>
            <dd className="text-sm text-slate-700">{formatDateTime(me.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="label">Account created</dt>
            <dd className="text-sm text-slate-700">{formatDate(me.createdAt)}</dd>
          </div>
          <div>
            <dt className="label">User ID</dt>
            <dd className="truncate font-mono text-xs text-slate-500">{me.id}</dd>
          </div>
        </dl>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Change password
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Minimum 10 characters. Changing your password revokes all other sessions.
        </p>
        <PasswordForm userId={me.id} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Platform defaults
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {platformSettings.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 border-b border-slate-50 pb-2">
              <dt className="text-sm text-slate-600">{s.label}</dt>
              <dd className="text-sm font-medium text-slate-800">
                {s.isSecret ? "••••••••" : s.value || "—"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          Edit these under{" "}
          <a href="/configuration/global-settings" className="text-indigo-600 hover:underline">
            System Configuration → Global Settings
          </a>
          .
        </p>
      </section>
    </div>
  );
}
