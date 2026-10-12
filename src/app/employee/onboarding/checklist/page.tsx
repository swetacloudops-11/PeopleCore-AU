import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, EmptyState, PageHeader } from "@/components/ui";
import { ProgressBar } from "@/components/charts";
import { formatDate } from "@/lib/format";
import TaskCompleteButton from "../../tasks/TaskCompleteButton";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];
const CLOSED_STATUSES = ["COMPLETED", "WAIVED"];

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  WAIVED: "Waived",
};

const STATUS_BADGE_TONE: Record<string, string> = {
  NOT_STARTED: "blue",
  IN_PROGRESS: "amber",
  BLOCKED: "red",
  COMPLETED: "green",
  WAIVED: "slate",
};

export default async function ChecklistStatusPage() {
  const { employee, organisationId } = await employeeContext();
  const today = D(0);

  const tasks = await prisma.onboardingTask.findMany({
    where: { employeeId: employee.id, organisationId, stage: "ONBOARDING" },
    include: { checklist: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  type TaskRow = (typeof tasks)[number];

  // Group by checklist; tasks without one fall into a "General" bucket.
  const groups = new Map<string, { key: string; name: string; tasks: TaskRow[] }>();
  for (const t of tasks) {
    const key = t.checklistId ?? "general";
    const entry = groups.get(key) ?? { key, name: t.checklist?.name ?? "General", tasks: [] };
    entry.tasks.push(t);
    groups.set(key, entry);
  }
  const sections = [...groups.values()].sort((a, b) =>
    a.key === "general" ? 1 : b.key === "general" ? -1 : a.name.localeCompare(b.name)
  );

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const overdue = tasks.filter(
    (t) => t.dueDate !== null && t.dueDate < today && !CLOSED_STATUSES.includes(t.status)
  ).length;

  return (
    <div>
      <PageHeader
        title="Checklist status"
        subtitle="Your onboarding progress, grouped by checklist"
        action={{ label: "All onboarding tasks", href: "/employee/onboarding" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Checklists" value={sections.length} hint="Groups of tasks" tone="indigo" />
        <StatCard label="Tasks" value={total} hint="Across all checklists" tone="sky" />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Past their due date"
          tone={overdue > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="Completed"
          value={completed}
          hint={total ? `${Math.round((completed / total) * 100)}% done` : "Nothing yet"}
          tone="emerald"
        />
      </div>

      {/* ── Checklist sections ── */}
      <div className="mt-6 space-y-4">
        {total === 0 ? (
          <EmptyState
            title="No checklist tasks"
            hint="You have no onboarding tasks assigned, so there is nothing to track."
          />
        ) : (
          sections.map((s) => {
            const done = s.tasks.filter((t) => t.status === "COMPLETED").length;
            return (
              <section key={s.key} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">{s.name}</h2>
                  <span className="text-xs text-slate-500">
                    {done} of {s.tasks.length} completed
                  </span>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    value={done}
                    max={s.tasks.length}
                    tone={done === s.tasks.length ? "emerald" : "violet"}
                    label={`${done}/${s.tasks.length} done`}
                  />
                </div>
                <ul className="mt-4 divide-y divide-slate-100">
                  {s.tasks.map((t) => {
                    const isOverdue =
                      t.dueDate !== null && t.dueDate < today && !CLOSED_STATUSES.includes(t.status);
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/employee/tasks/${t.id}`}
                              className="truncate text-[13px] font-medium text-slate-800 hover:text-violet-600 hover:underline"
                            >
                              {t.title}
                            </Link>
                            <Badge tone={STATUS_BADGE_TONE[t.status] ?? "slate"}>
                              {STATUS_LABEL[t.status] ?? t.status}
                            </Badge>
                          </div>
                          <p
                            className={`mt-0.5 text-[11px] ${
                              isOverdue ? "font-medium text-rose-600" : "text-slate-400"
                            }`}
                          >
                            {t.dueDate
                              ? isOverdue
                                ? `Overdue — was due ${formatDate(t.dueDate)}`
                                : `Due ${formatDate(t.dueDate)}`
                              : "No due date"}
                          </p>
                        </div>
                        {OPEN_STATUSES.includes(t.status) && <TaskCompleteButton id={t.id} compact />}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
