import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, EmptyState } from "@/components/ui";
import { TeamActions, DeleteTeamButton } from "./TeamActions";

export default async function TeamsPage() {
  const { organisationId } = await orgContext();

  const [teams, departments, totalActive] = await Promise.all([
    prisma.team.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
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
    prisma.employee.count({ where: { organisationId, employmentStatus: { not: "TERMINATED" } } }),
  ]);

  const assigned = teams.reduce((sum, t) => sum + t._count.employees, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Teams
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Operational teams within your departments.
          </p>
        </div>
        <TeamActions departments={departments} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Teams" value={teams.length} tone="indigo" />
        <StatCard label="Members assigned" value={assigned} hint="Across all teams" tone="emerald" />
        <StatCard label="Not in a team" value={totalActive - assigned} hint="Active employees" tone={totalActive - assigned > 0 ? "amber" : "emerald"} />
        <StatCard label="Departments" value={departments.length} tone="sky" />
      </div>

      <div className="mt-6">
        {teams.length === 0 ? (
          <EmptyState
            title="No teams yet"
            hint="Create a team to group employees who work together day-to-day."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-800">{t.name}</h3>
                      {t.code && <Badge tone="blue">{t.code}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.department?.name ?? "No department"}
                    </p>
                  </div>
                  <Badge tone={t._count.employees > 0 ? "green" : "slate"}>
                    {t._count.employees} {t._count.employees === 1 ? "member" : "members"}
                  </Badge>
                </div>

                <p className="mt-2 line-clamp-2 min-h-[2rem] text-xs leading-snug text-slate-500">
                  {t.description ?? "No description provided."}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex -space-x-1.5">
                    {t._count.employees > 0 ? (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-[9px] font-semibold text-emerald-600 ring-2 ring-white">
                        {t._count.employees}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">No members yet</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <TeamActions
                      team={{
                        id: t.id,
                        name: t.name,
                        code: t.code,
                        description: t.description,
                        departmentId: t.departmentId,
                      }}
                      departments={departments}
                    />
                    <DeleteTeamButton
                      team={{
                        id: t.id,
                        name: t.name,
                        code: t.code,
                        description: t.description,
                        departmentId: t.departmentId,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
