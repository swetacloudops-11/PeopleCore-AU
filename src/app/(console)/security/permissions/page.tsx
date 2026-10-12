import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SecurityPermissionsPage() {
  const [permissions, roles] = await Promise.all([
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
    prisma.role.findMany({
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

  const modules = Object.keys(grouped);

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="Fine-grained capability catalogue for the platform console"
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="card px-4 py-3">
          <div className="text-lg font-semibold text-slate-800">{permissions.length}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Permissions
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-lg font-semibold text-slate-800">{modules.length}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Modules</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-lg font-semibold text-slate-800">{roles.length}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Roles</div>
        </div>
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
                    {roles.map((r) => {
                      const has = allowed.get(r.id)?.has(p.id);
                      if (!has) return null;
                      return (
                        <span
                          key={r.id}
                          className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                          title={r.name}
                        >
                          {r.name}
                        </span>
                      );
                    })}
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

      <section className="mt-7">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Role → permission matrix</h2>
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th min-w-[220px]">Permission</th>
                {roles.map((r) => (
                  <th key={r.id} className="th text-center min-w-[90px]">
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
      </section>
    </div>
  );
}
