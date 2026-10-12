import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam, strParam } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import TaskCompleteButton from "./TaskCompleteButton";

const PAGE_SIZE = 20;

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

type OpenStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED";

const OPEN_STATUSES: OpenStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];

const STATUS_CHIPS = ["ALL", "NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as const;

const STATUS_BADGE_TONE: Record<string, string> = {
  NOT_STARTED: "blue",
  IN_PROGRESS: "amber",
  BLOCKED: "red",
};

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId } = await employeeContext();
  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const page = intParam(sp.page, 1, 500);
  const today = D(0);

  // All open tasks across both stages — small per-person set, sorted in JS so
  // overdue rows surface first.
  const tasks = await prisma.onboardingTask.findMany({
    where: {
      employeeId: employee.id,
      organisationId,
      status: { in: OPEN_STATUSES },
    },
    include: { checklist: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }],
  });

  const overdueCount = tasks.filter((t) => t.dueDate !== null && t.dueDate < today).length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;

  const filtered =
    status !== "ALL" ? tasks.filter((t) => t.status === status) : tasks;

  const sorted = [...filtered].sort((a, b) => {
    const aOverdue = a.dueDate !== null && a.dueDate < today ? 0 : 1;
    const bOverdue = b.dueDate !== null && b.dueDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pageHref = (p: number) =>
    `/employee/tasks${qs({ status, page: p > 1 ? p : undefined })}`;

  return (
    <div>
      <PageHeader
        title="My tasks"
        subtitle="Open tasks across your onboarding and offboarding"
        action={{ label: "Completed tasks", href: "/employee/tasks/completed" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Open tasks" value={tasks.length} hint="Across both stages" tone="indigo" />
        <StatCard
          label="Overdue"
          value={overdueCount}
          hint="Past their due date"
          tone={overdueCount > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="In progress"
          value={inProgress}
          hint="Currently underway"
          tone={inProgress > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Blocked"
          value={blocked}
          hint="Waiting on someone else"
          tone={blocked > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* ── Status filter chips ── */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((s) => {
          const active = status === s;
          return (
            <Link
              key={s}
              href={`/employee/tasks${qs({ status: s === "ALL" ? undefined : s, page: undefined })}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "ALL" ? "ALL" : s.replace(/_/g, " ")}
            </Link>
          );
        })}
      </div>

      {/* ── Task table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title={status === "ALL" ? "No open tasks" : `No ${status.replace(/_/g, " ").toLowerCase()} tasks`}
            hint="Nothing is waiting on you right now — completed tasks live in the archive."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Task</th>
                  <th className="th">Stage</th>
                  <th className="th">Category</th>
                  <th className="th">Due</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => {
                  const isOverdue = t.dueDate !== null && t.dueDate < today;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <Link
                          href={`/employee/tasks/${t.id}`}
                          className="font-medium text-slate-800 hover:text-violet-600 hover:underline"
                        >
                          {t.title}
                        </Link>
                        {t.description && (
                          <div className="max-w-[360px] truncate text-[11px] text-slate-400">
                            {t.description}
                          </div>
                        )}
                        {t.checklist && (
                          <div className="text-[11px] text-slate-400">{t.checklist.name}</div>
                        )}
                      </td>
                      <td className="td">
                        <Badge tone={t.stage === "ONBOARDING" ? "purple" : "slate"}>
                          {t.stage === "ONBOARDING" ? "Onboarding" : "Offboarding"}
                        </Badge>
                      </td>
                      <td className="td text-slate-600">{t.category}</td>
                      <td className="td whitespace-nowrap">
                        <span className={isOverdue ? "text-xs font-medium text-rose-600" : "text-xs text-slate-500"}>
                          {t.dueDate ? formatDate(t.dueDate) : "—"}
                        </span>
                        {isOverdue && (
                          <span className="ml-1.5">
                            <Badge tone="red">OVERDUE</Badge>
                          </span>
                        )}
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_BADGE_TONE[t.status] ?? "slate"}>
                          {t.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="td">
                        <div className="flex justify-end">
                          {t.stage === "ONBOARDING" && <TaskCompleteButton id={t.id} compact />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                  {totalRows}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="btn-secondary !py-1.5 text-xs">
                      ← Previous
                    </Link>
                  ) : (
                    <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                      ← Previous
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)} className="btn-secondary !py-1.5 text-xs">
                      Next →
                    </Link>
                  ) : (
                    <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                      Next →
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
