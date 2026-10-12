import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { DepartmentActions, DeleteDepartmentButton } from "./DepartmentActions";

export default async function DepartmentsPage() {
  const { organisationId } = await orgContext();

  const [departments, totalEmployees] = await Promise.all([
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { employees: true, teams: true, positions: true } },
      },
    }),
    prisma.employee.count({ where: { organisationId, employmentStatus: { not: "TERMINATED" } } }),
  ]);

  const assigned = departments.reduce((sum, d) => sum + d._count.employees, 0);
  const unassigned = totalEmployees - assigned;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Departments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Organisational structure used for reporting, cost centres and approvals.
          </p>
        </div>
        <DepartmentActions />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Departments" value={departments.length} tone="indigo" />
        <StatCard label="Employees assigned" value={assigned} hint="Across all departments" tone="emerald" />
        <StatCard label="Unassigned" value={unassigned} hint="Active employees with no department" tone={unassigned ? "amber" : "emerald"} />
        <StatCard
          label="Teams"
          value={departments.reduce((s, d) => s + d._count.teams, 0)}
          hint="Nested under departments"
          tone="sky"
        />
      </div>

      <div className="mt-6">
        {departments.length === 0 ? (
          <EmptyState
            title="No departments yet"
            hint="Create your first department to start grouping employees."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Department</th>
                <th className="th">Code</th>
                <th className="th">Description</th>
                <th className="th">Cost centre</th>
                <th className="th">Members</th>
                <th className="th">Teams</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{d.name}</td>
                  <td className="td">
                    {d.code ? <Badge tone="blue">{d.code}</Badge> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="td max-w-xs truncate text-slate-600">{d.description ?? "—"}</td>
                  <td className="td text-slate-600">{d.costCentre ?? "—"}</td>
                  <td className="td">
                    <Badge tone={d._count.employees > 0 ? "green" : "slate"}>
                      {d._count.employees} {d._count.employees === 1 ? "member" : "members"}
                    </Badge>
                  </td>
                  <td className="td text-slate-600">{d._count.teams}</td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-3">
                      <DepartmentActions
                        department={{
                          id: d.id,
                          name: d.name,
                          code: d.code,
                          description: d.description,
                          costCentre: d.costCentre,
                        }}
                      />
                      <DeleteDepartmentButton
                        department={{
                          id: d.id,
                          name: d.name,
                          code: d.code,
                          description: d.description,
                          costCentre: d.costCentre,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
