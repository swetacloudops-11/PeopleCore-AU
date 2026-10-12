import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { PositionActions, DeletePositionButton, type PositionRow } from "./PositionActions";

export default async function PositionsPage() {
  const { organisationId } = await orgContext();

  const [positions, departments] = await Promise.all([
    prisma.position.findMany({
      where: { organisationId },
      orderBy: [{ level: "asc" }, { title: "asc" }],
      include: {
        department: { select: { name: true } },
        _count: { select: { employees: true } },
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const filled = positions.reduce((s, p) => s + p._count.employees, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Positions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Roles and career levels across your organisation.
          </p>
        </div>
        <PositionActions departments={departments} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Positions" value={positions.length} tone="indigo" />
        <StatCard label="People in roles" value={filled} tone="emerald" />
        <StatCard
          label="Vacant positions"
          value={positions.filter((p) => p._count.employees === 0).length}
          hint="No employees attached"
          tone="amber"
        />
        <StatCard label="Levels in use" value={new Set(positions.map((p) => p.level)).size} hint="Distinct seniority levels" tone="sky" />
      </div>

      <div className="mt-6">
        {positions.length === 0 ? (
          <EmptyState
            title="No positions yet"
            hint="Create positions so employees can be hired into defined roles."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Title</th>
                <th className="th">Code</th>
                <th className="th">Level</th>
                <th className="th">Department</th>
                <th className="th">Description</th>
                <th className="th">Headcount</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {positions.map((p) => {
                const row: PositionRow = {
                  id: p.id,
                  title: p.title,
                  code: p.code,
                  level: p.level,
                  description: p.description,
                  departmentId: p.departmentId,
                };
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{p.title}</td>
                    <td className="td">
                      {p.code ? <Badge tone="blue">{p.code}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="td">
                      <Badge tone="purple">L{p.level}</Badge>
                    </td>
                    <td className="td text-slate-600">{p.department?.name ?? "—"}</td>
                    <td className="td max-w-sm truncate text-slate-600">{p.description ?? "—"}</td>
                    <td className="td">
                      <Badge tone={p._count.employees > 0 ? "green" : "slate"}>
                        {p._count.employees} {p._count.employees === 1 ? "person" : "people"}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-3">
                        <PositionActions position={row} departments={departments} />
                        <DeletePositionButton position={row} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
