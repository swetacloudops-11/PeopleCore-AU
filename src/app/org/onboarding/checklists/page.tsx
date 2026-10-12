import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import ChecklistManager, { ChecklistRowActions } from "./ChecklistManager";

export const dynamic = "force-dynamic";

export default async function ChecklistsPage() {
  const { organisationId } = await orgContext();

  const checklists = await prisma.onboardingChecklist.findMany({
    where: { organisationId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      roleCategory: true,
      isDefault: true,
      createdAt: true,
      tasks: { select: { id: true, employeeId: true, status: true } },
    },
  });

  const rows = checklists.map((c) => {
    const assigned = c.tasks.filter((t) => t.employeeId);
    const employees = new Set(assigned.map((t) => t.employeeId)).size;
    const templates = c.tasks.length - assigned.length;
    const done = assigned.filter(
      (t) => t.status === "COMPLETED" || t.status === "WAIVED"
    ).length;
    return {
      ...c,
      taskCount: c.tasks.length,
      templates,
      employees,
      assigned: assigned.length,
      done,
      pct: assigned.length ? Math.round((done / assigned.length) * 100) : 0,
    };
  });

  const totalTemplates = rows.reduce((n, r) => n + r.templates, 0);
  const employeesCovered = new Set(
    checklists.flatMap((c) =>
      c.tasks.filter((t) => t.employeeId).map((t) => t.employeeId as string)
    )
  ).size;
  const defaults = rows.filter((r) => r.isDefault).length;

  return (
    <div>
      <PageHeader
        title="Onboarding Checklists"
        subtitle="Reusable task templates — create one, then assign its tasks to new starters."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Checklists" value={rows.length} hint={`${defaults} marked default`} tone="indigo" />
        <StatCard label="Template tasks" value={totalTemplates} hint="Unassigned task titles" tone="sky" />
        <StatCard label="Employees covered" value={employeesCovered} hint="Have assigned tasks" tone="emerald" />
        <StatCard
          label="Assigned tasks done"
          value={rows.reduce((n, r) => n + r.done, 0)}
          hint="Completed or waived"
          tone="amber"
        />
      </div>

      <div className="mb-4 flex justify-end">
        <ChecklistManager />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No checklists yet"
          hint="Create your first checklist with a set of task titles to get started."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Checklist</th>
              <th className="th">Tasks</th>
              <th className="th">Employees using</th>
              <th className="th">Completion</th>
              <th className="th">Created</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.isDefault && <Badge tone="purple">DEFAULT</Badge>}
                  </div>
                  <div className="max-w-md text-xs text-slate-500">
                    {c.description ?? "No description"}
                  </div>
                  {c.roleCategory && (
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Role category: {c.roleCategory}
                    </div>
                  )}
                </td>
                <td className="td">
                  <div className="text-slate-700">{c.taskCount} tasks</div>
                  {c.templates > 0 && (
                    <div className="text-[11px] text-slate-400">{c.templates} template rows</div>
                  )}
                </td>
                <td className="td text-slate-700">{c.employees}</td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          c.pct >= 80 ? "bg-emerald-500" : c.pct >= 40 ? "bg-amber-500" : "bg-indigo-500"
                        }`}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-slate-500">{c.pct}%</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {c.done}/{c.assigned} assigned tasks
                  </div>
                </td>
                <td className="td whitespace-nowrap text-slate-500">{formatDate(c.createdAt)}</td>
                <td className="td text-right">
                  <ChecklistRowActions
                    id={c.id}
                    initial={{
                      name: c.name,
                      description: c.description,
                      roleCategory: c.roleCategory,
                      isDefault: c.isDefault,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
