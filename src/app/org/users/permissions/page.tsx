import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { PageHeader, StatCard, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OrgPermissionsPage() {
  const { organisationId } = await orgContext();

  const [permissions, roles] = await Promise.all([
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
    prisma.role.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      include: { rolePermissions: { where: { allowed: true } } },
    }),
  ]);

  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const allowed = new Map(
    roles.map((r) => [r.id, new Set(r.rolePermissions.map((rp) => rp.permissionId))])
  );

  const grantedLinks = roles.reduce((n, r) => n + r.rolePermissions.length, 0);
  const covered = permissions.filter((p) =>
    roles.some((r) => allowed.get(r.id)?.has(p.id))
  ).length;

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="Read-only capability catalogue and which of your org roles grant each one"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Permissions" value={permissions.length} hint="Global catalogue" tone="indigo" />
        <StatCard label="Modules" value={Object.keys(grouped).length} hint="Grouped below" tone="sky" />
        <StatCard label="Org roles" value={roles.length} hint="In this organisation" tone="emerald" />
        <StatCard
          label="Granted links"
          value={grantedLinks}
          hint={`${covered}/${permissions.length} permissions in use`}
          tone={covered ? "amber" : "rose"}
        />
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([module, perms]) => (
          <section key={module}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {module}
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {perms.length}
              </span>
            </h2>

            <div className="card divide-y divide-slate-100">
              {perms.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="min-w-[240px] flex-1">
                    <div className="text-sm font-medium text-slate-800">
                      {p.description ?? p.key}
                    </div>
                    <code className="text-[11px] text-slate-400">{p.key}</code>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) =>
                      allowed.get(r.id)?.has(p.id) ? (
                        <span
                          key={r.id}
                          className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                          title={r.name}
                        >
                          {r.name}
                        </span>
                      ) : null
                    )}
                    {roles.every((r) => !allowed.get(r.id)?.has(p.id)) && (
                      <Badge tone="slate">UNASSIGNED</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Role → permission matrix</h2>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th min-w-[240px]">Permission</th>
                {roles.map((r) => (
                  <th key={r.id} className="th min-w-[100px] text-center">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(grouped).map(([module, perms]) => (
                <Fragment key={module}>
                  <tr className="bg-slate-100/70">
                    <td className="td text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {module}
                    </td>
                    <td className="td" colSpan={roles.length} />
                  </tr>
                  {perms.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <div className="text-slate-700">{p.description ?? p.key}</div>
                        <code className="text-[11px] text-slate-400">{p.key}</code>
                      </td>
                      {roles.map((r) => (
                        <td key={r.id} className="td text-center">
                          {allowed.get(r.id)?.has(p.id) ? (
                            <span className="text-emerald-600">✓</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {roles.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">No organisation roles found.</p>
        )}
      </section>
    </div>
  );
}
