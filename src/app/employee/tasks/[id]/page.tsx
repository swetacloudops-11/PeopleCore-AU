import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import TaskCompleteButton from "../TaskCompleteButton";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];
const CLOSED_STATUSES = ["COMPLETED", "WAIVED"];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-right text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { employee, organisationId } = await employeeContext();
  const today = D(0);

  // Self-service scoping: the task must belong to the signed-in person.
  const task = await prisma.onboardingTask.findFirst({
    where: { id, employeeId: employee.id, organisationId },
    include: { checklist: { select: { name: true } } },
  });
  if (!task) notFound();

  const isOverdue =
    task.dueDate !== null && task.dueDate < today && !CLOSED_STATUSES.includes(task.status);
  const isOpen = OPEN_STATUSES.includes(task.status);

  return (
    <div>
      <Link href="/employee/tasks" className="text-xs text-violet-600 hover:underline">
        ← Back to tasks
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {task.title}
            </h1>
            <Badge tone={task.stage === "ONBOARDING" ? "purple" : "slate"}>
              {task.stage === "ONBOARDING" ? "Onboarding" : "Offboarding"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{task.category}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            tone={
              task.status === "COMPLETED"
                ? "green"
                : task.status === "WAIVED"
                ? "slate"
                : isOverdue
                ? "red"
                : "amber"
            }
          >
            {task.status.replace(/_/g, " ")}
          </Badge>
          {isOpen && <TaskCompleteButton id={task.id} />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Description ── */}
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">What this task involves</h2>
          {task.description ? (
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{task.description}</p>
          ) : (
            <p className="mt-2 text-[13px] italic text-slate-400">No description provided.</p>
          )}

          {task.notes && (
            <>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Notes
              </h3>
              <p className="mt-1.5 rounded-lg bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600">
                {task.notes}
              </p>
            </>
          )}
        </section>

        {/* ── Details ── */}
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Details</h2>
          <Row label="Stage" value={task.stage === "ONBOARDING" ? "Onboarding" : "Offboarding"} />
          <Row label="Category" value={task.category} />
          <Row label="Checklist" value={task.checklist?.name ?? "General"} />
          <Row
            label="Due date"
            value={
              isOverdue ? (
                <span className="text-rose-600">Overdue — {formatDate(task.dueDate)}</span>
              ) : (
                task.dueDate ? formatDate(task.dueDate) : "—"
              )
            }
          />
          <Row
            label="Completed at"
            value={task.completedAt ? formatDateTime(task.completedAt) : "—"}
          />
        </section>
      </div>
    </div>
  );
}
