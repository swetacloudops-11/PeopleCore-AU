import { prisma } from "@/lib/prisma";
import { Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import RoleManager from "@/components/RoleManager";
import RoleRowActions from "@/components/RoleRowActions";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const [roles, users] = await Promise.all([
    prisma.role.findMany({
      orderBy: { name: "asc" },
      include: {
        rolePermissions: { where: { allowed: true } },
        assignments: { include: { user: { select: { name: true, email: true } } } },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.user.count(),
  ]);

  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { key: "asc" }],
    select: { id: true, key: true, module: true, description: true },
  });

  const totalPerms = permissions.length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Roles
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {roles.length} roles · {users} platform users · {totalPerms} permissions defined
          </p>
        </div>
        <RoleManager permissions={permissions} showCreate />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((r) => (
          <div key={r.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{r.name}</h3>
                  <Badge tone={r.isSystem ? "purple" : "blue"}>
                    {r.isSystem ? "SYSTEM" : "CUSTOM"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{r.key}</p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
                {r._count.assignments}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-500">{r.description ?? "No description"}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-center">
              <div>
                <div className="text-lg font-semibold text-slate-800">
                  {r.rolePermissions.length}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Permissions granted
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-800">
                  {r._count.assignments}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Assigned users
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Members
              </div>
              {r.assignments.length === 0 ? (
                <p className="text-xs text-slate-400">No users assigned</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.assignments.slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{a.user.name}</span>
                      <span className="text-slate-400">{a.user.email}</span>
                    </li>
                  ))}
                  {r.assignments.length > 5 && (
                    <li className="text-xs text-slate-400">
                      +{r.assignments.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400">
                Created {formatDate(r.createdAt)}
              </span>
              <RoleRowActions
                id={r.id}
                name={r.name}
                isSystem={r.isSystem}
                permissionKeys={r.rolePermissions.map((rp) =>
                  permissions.find((p) => p.id === rp.permissionId)?.key ?? ""
                ).filter(Boolean)}
                description={r.description}
                memberCount={r._count.assignments}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Role assignment matrix</h2>
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Role</th>
              <th className="th">Key</th>
              <th className="th">Type</th>
              <th className="th">Members</th>
              <th className="th">Permissions</th>
              <th className="th">Coverage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.length === 0 && (
              <tr>
                <td className="td" colSpan={6}>
                  <EmptyState title="No roles defined" />
                </td>
              </tr>
            )}
            {roles.map((r) => {
              const coverage = Math.round(
                (r.rolePermissions.length / Math.max(1, totalPerms)) * 100
              );
              return (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{r.name}</td>
                  <td className="td text-slate-500">{r.key}</td>
                  <td className="td">
                    <Badge tone={r.isSystem ? "purple" : "blue"}>
                      {r.isSystem ? "SYSTEM" : "CUSTOM"}
                    </Badge>
                  </td>
                  <td className="td">{r._count.assignments}</td>
                  <td className="td">
                    {r.rolePermissions.length} / {totalPerms}
                  </td>
                  <td className="td w-48">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          coverage >= 80
                            ? "bg-indigo-500"
                            : coverage >= 40
                            ? "bg-amber-500"
                            : "bg-slate-400"
                        }`}
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">{coverage}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
    </div>
  );
}
