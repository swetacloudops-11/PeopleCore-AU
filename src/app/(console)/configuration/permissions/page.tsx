import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ConfigPermissionsPage() {
  const [permissions, roles, assignments] = await Promise.all([
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
    prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { rolePermissions: { where: { allowed: true }, select: { permissionId: true } } },
    }),
    prisma.roleAssignment.count(),
  ]);

  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const allowedMap = new Map(
    roles.map((r) => [r.id, new Set(r.rolePermissions.map((rp) => rp.permissionId))])
  );

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle={`${permissions.length} permissions across ${roles.length} roles · ${assignments} active role assignments`}
      />

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th sticky left-0 z-10 bg-slate-50 min-w-[260px]">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="th text-center min-w-[110px]">
                  <div>{r.name}</div>
                  <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-400">
                    {r.key}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(grouped).map(([module, perms]) => (
              <Fragment key={module}>
                <tr className="bg-slate-100/70">
                  <td className="td sticky left-0 z-10 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {module}
                  </td>
                  <td className="td" colSpan={roles.length} />
                </tr>
                {perms.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="td sticky left-0 z-10 bg-white">
                      <div className="text-sm text-slate-700">{p.description ?? p.key}</div>
                      <code className="text-[11px] text-slate-400">{p.key}</code>
                    </td>
                    {roles.map((r) => {
                      const has = allowedMap.get(r.id)?.has(p.id);
                      return (
                        <td key={r.id} className="td text-center">
                          {has ? (
                            <span className="text-emerald-600" title="Granted">✓</span>
                          ) : (
                            <span className="text-slate-300" title="Not granted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {roles.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{r.name}</h3>
              <Badge tone={r.isSystem ? "purple" : "blue"}>
                {r.isSystem ? "SYSTEM" : "CUSTOM"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{r.description}</p>
            <p className="mt-2 text-xs text-slate-400">
              {r.rolePermissions.length} of {permissions.length} permissions granted
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
