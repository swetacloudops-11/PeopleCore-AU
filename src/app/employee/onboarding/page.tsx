import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, ProgressBar, Donut, type DonutSegment } from "@/components/charts";
import { formatDate } from "@/lib/format";
import TaskCompleteButton from "../tasks/TaskCompleteButton";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];
const CLOSED_STATUSES = ["COMPLETED", "WAIVED"];

const STATUS_ORDER = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "WAIVED"] as const;

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  WAIVED: "Waived",
};

/** Chart tones (separate from Badge tones). */
const STATUS_CHART_TONE: Record<string, "sky" | "amber" | "rose" | "emerald" | "slate"> = {
  NOT_STARTED: "sky",
  IN_PROGRESS: "amber",
  BLOCKED: "rose",
  COMPLETED: "emerald",
  WAIVED: "slate",
};

export default async function OnboardingTasksPage() {
  const { employee, organisationId } = await employeeContext();
  const today = D(0);

  const tasks = await prisma.onboardingTask.findMany({
    where: { employeeId: employee.id, organisationId, stage: "ONBOARDING" },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const overdue = tasks.filter(
    (t) =>
      t.dueDate !== null &&
      t.dueDate < today &&
      !CLOSED_STATUSES.includes(t.status)
  ).length;

  const groups = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    items: tasks.filter((t) => t.status === status),
  })).filter((g) => g.items.length > 0);

  const segments = ([
    ...STATUS_ORDER.map((status) => ({
      label: STATUS_LABEL[status],
      value: tasks.filter((t) => t.status === status).length,
      tone: STATUS_CHART_TONE[status],
    })),
  ] as DonutSegment[]).filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Onboarding tasks"
        subtitle="Everything you need to complete to get set up"
        action={{ label: "Checklist status", href: "/employee/onboarding/checklist" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tasks" value={total} hint="All onboarding tasks" tone="indigo" />
        <StatCard
          label="Open"
          value={open}
          hint="Still to complete"
          tone={open > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Past their due date"
          tone={overdue > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Completed" value={completed} hint="Signed off by you" tone="emerald" />
      </div>

      {/* ── Progress + status mix ── */}
      {total > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ChartPanel
            title="Your onboarding progress"
            subtitle="Completed vs total tasks"
            action={
              <Link href="/employee/onboarding/documents" className="text-[11px] text-violet-600 hover:underline">
                Required documents →
              </Link>
            }
          >
            <ProgressBar
              value={completed}
              max={total}
              tone={overdue > 0 ? "rose" : "emerald"}
              label={`${completed} of ${total} completed`}
            />
          </ChartPanel>
          <ChartPanel title="Task status mix" subtitle="All your onboarding tasks">
            <Donut segments={segments} size={132} thickness={16} centerValue={total} centerLabel="tasks" />
          </ChartPanel>
        </div>
      )}

      {/* ── Tasks grouped by status ── */}
      <div className="mt-6">
        {total === 0 ? (
          <EmptyState
            title="No onboarding tasks"
            hint="You have no onboarding tasks assigned — you're all set."
          />
        ) : (
          groups.map((g) => (
            <section key={g.status} className="mt-6 first:mt-0">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                {g.label}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {g.items.length}
                </span>
              </h2>
              <div className="space-y-2">
                {g.items.map((t) => {
                  const isOverdue =
                    t.dueDate !== null && t.dueDate < today && !CLOSED_STATUSES.includes(t.status);
                  return (
                    <article key={t.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/employee/tasks/${t.id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-violet-600 hover:underline"
                          >
                            {t.title}
                          </Link>
                          <Badge tone="purple">{t.category}</Badge>
                        </div>
                        {t.description && (
                          <p className="mt-1 text-[13px] leading-snug text-slate-500">{t.description}</p>
                        )}
                        <p
                          className={`mt-1.5 text-xs ${
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
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
