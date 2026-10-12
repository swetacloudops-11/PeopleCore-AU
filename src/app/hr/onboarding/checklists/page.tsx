import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, ProgressBar, type DonutSegment } from "@/components/charts";
import { formatDate } from "@/lib/format";

const TASK_TONE: Record<string, "emerald" | "sky" | "amber" | "rose" | "slate"> = {
  COMPLETED: "emerald",
  IN_PROGRESS: "sky",
  NOT_STARTED: "slate",
  BLOCKED: "rose",
  WAIVED: "amber",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function OnboardingChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();
  const q = strParam(sp.q);

  const checklists = await prisma.onboardingChecklist.findMany({
    where: {
      organisationId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { roleCategory: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      tasks: { select: { status: true } },
    },
  });

  const allTasks = checklists.flatMap((c) => c.tasks);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "WAIVED"
  ).length;
  const completedPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const byStatus = allTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const statusCount = (s: string) => byStatus[s] ?? 0;

  const rows = checklists.map((c) => {
    const total = c.tasks.length;
    const done = c.tasks.filter(
      (t) => t.status === "COMPLETED" || t.status === "WAIVED"
    ).length;
    const blocked = c.tasks.filter((t) => t.status === "BLOCKED").length;
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      roleCategory: c.roleCategory,
      isDefault: c.isDefault,
      updatedAt: c.updatedAt,
      total,
      done,
      blocked,
      pct: total ? Math.round((done / total) * 100) : 0,
    };
  });

  const defaults = checklists.filter((c) => c.isDefault).length;
  const fullyComplete = rows.filter((r) => r.total > 0 && r.done === r.total).length;

  const statusSegments: DonutSegment[] = (
    ["COMPLETED", "IN_PROGRESS", "NOT_STARTED", "BLOCKED", "WAIVED"] as const
  )
    .map((s) => ({ label: pretty(s), value: statusCount(s), tone: TASK_TONE[s] }))
    .filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Onboarding Checklists"
        subtitle="Templates that group the tasks each new starter must complete."
        action={{ label: "Onboarding tasks", href: "/hr/onboarding/tasks" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Checklists" value={checklists.length} hint={`${defaults} default`} tone="sky" />
        <StatCard label="Tasks" value={totalTasks} hint="Across all checklists" tone="indigo" />
        <StatCard
          label="Completion"
          value={`${completedPct}%`}
          hint={`${doneTasks}/${totalTasks} done`}
          tone={completedPct >= 70 ? "emerald" : "sky"}
        />
        <StatCard
          label="Fully complete"
          value={fullyComplete}
          hint="Checklists with every task done"
          tone={fullyComplete ? "emerald" : "amber"}
        />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Tasks by status" subtitle="Every task inside a checklist">
          <Donut
            segments={statusSegments}
            size={134}
            thickness={16}
            centerValue={`${completedPct}%`}
            centerLabel="complete"
          />
        </ChartPanel>

        <ChartPanel title="Completion by checklist" subtitle="Share of tasks finished in each template">
          <BarList
            items={rows.map((r) => ({
              label: r.name,
              value: r.pct,
              tone: r.pct >= 70 ? ("emerald" as const) : ("sky" as const),
              hint: `${r.done}/${r.total} tasks`,
              href: `/hr/onboarding/tasks${qs({ checklist: r.id })}`,
            }))}
            valueFormat={(v) => `${v}%`}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      <form className="mb-4 flex items-center gap-2" method="get">
        <input
          name="q"
          key={`q-${q}`}
          defaultValue={q}
          placeholder="Search checklists…"
          className="input !w-64"
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {q && (
          <Link href="/hr/onboarding/checklists" className="text-xs text-slate-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No checklists found"
          hint="Create onboarding templates to group the tasks new starters must complete."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Checklist</th>
              <th className="th">Role category</th>
              <th className="th">Default</th>
              <th className="th">Tasks</th>
              <th className="th">Blocked</th>
              <th className="th w-64">Completion</th>
              <th className="th">Updated</th>
              <th className="th text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  {r.description && (
                    <div className="max-w-md truncate text-xs text-slate-400">{r.description}</div>
                  )}
                </td>
                <td className="td text-slate-600">{r.roleCategory ?? "—"}</td>
                <td className="td">
                  {r.isDefault ? <Badge tone="purple">DEFAULT</Badge> : <span className="text-slate-400">—</span>}
                </td>
                <td className="td">
                  <span className="font-medium text-slate-700">{r.total}</span>
                </td>
                <td className="td">
                  {r.blocked > 0 ? (
                    <Badge tone="red">{r.blocked} blocked</Badge>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="td">
                  <ProgressBar
                    value={r.done}
                    max={Math.max(1, r.total)}
                    tone={r.pct >= 70 ? "emerald" : "sky"}
                    label={`${r.done}/${r.total} done`}
                  />
                </td>
                <td className="td whitespace-nowrap text-slate-500">{formatDate(r.updatedAt)}</td>
                <td className="td text-right">
                  <Link
                    href={`/hr/onboarding/tasks${qs({ checklist: r.id })}`}
                    className="text-xs font-medium text-sky-600 hover:underline"
                  >
                    View tasks →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Completion counts every task linked to a checklist, across all five task statuses.
      </p>
    </div>
  );
}
