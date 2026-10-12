import Link from "next/link";
import { GoalStatus, FeedbackType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";
import GoalRowActions, { NewGoalButton } from "./GoalActions";
import FeedbackComposer from "./FeedbackComposer";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const PAGE_SIZE = 25;
const FEEDBACK_TAKE = 12;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const GOAL_TONES: Record<string, string> = {
  NOT_STARTED: "slate",
  IN_PROGRESS: "blue",
  AT_RISK: "red",
  COMPLETED: "green",
  CANCELLED: "amber",
};

const FEEDBACK_TONES: Record<string, string> = {
  POSITIVE: "green",
  CONSTRUCTIVE: "amber",
  RECOGNITION: "purple",
  GENERAL: "slate",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const isoDate = (d: Date | null) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default async function GoalsFeedbackPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const status = parseEnum(GoalStatus, one(sp.status));
  const fbType = parseEnum(FeedbackType, one(sp.fb));
  const emp = strParam(one(sp.emp));
  const page = intParam(one(sp.page), 1, 500);

  const goalWhere = {
    organisationId,
    ...(status ? { status } : {}),
    ...(emp ? { employeeId: emp } : {}),
  };

  const [
    goals,
    goalCount,
    employees,
    activeGoals,
    atRisk,
    goalAgg,
    feedback,
    feedbackCount,
  ] = await Promise.all([
    prisma.goal.findMany({
      where: goalWhere,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.goal.count({ where: goalWhere }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.goal.count({
      where: { organisationId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    }),
    prisma.goal.count({ where: { organisationId, status: "AT_RISK" } }),
    prisma.goal.aggregate({
      where: { organisationId, status: { in: ["NOT_STARTED", "IN_PROGRESS", "AT_RISK"] } },
      _avg: { progress: true },
      _count: true,
    }),
    prisma.feedback.findMany({
      where: {
        organisationId,
        ...(fbType ? { type: fbType } : {}),
        ...(emp ? { employeeId: emp } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: FEEDBACK_TAKE,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        author: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.feedback.count({ where: { organisationId } }),
  ]);

  const avgProgress = goalAgg._avg.progress ? Math.round(goalAgg._avg.progress) : 0;
  const totalPages = Math.max(1, Math.ceil(goalCount / PAGE_SIZE));
  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName} · ${e.employeeNumber}`,
  }));

  const goalFilters = {
    status: status || undefined,
    emp: emp || undefined,
  };

  return (
    <div>
      <PageHeader
        title="Goals & Feedback"
        subtitle="Track objectives with progress bars and keep a continuous feedback log."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Active goals" value={activeGoals} hint="Not started or in progress" tone="indigo" />
        <StatCard
          label="Average progress"
          value={`${avgProgress}%`}
          hint={`${goalAgg._count} open goals`}
          tone="sky"
        />
        <StatCard label="At-risk goals" value={atRisk} hint="Behind schedule" tone={atRisk ? "rose" : "emerald"} />
        <StatCard label="Feedback entries" value={feedbackCount} hint="All time" tone="emerald" />
      </div>

      {/* ── Goals ── */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "All", value: "" },
              { label: "In progress", value: "IN_PROGRESS" },
              { label: "At risk", value: "AT_RISK" },
              { label: "Completed", value: "COMPLETED" },
              { label: "Not started", value: "NOT_STARTED" },
              { label: "Cancelled", value: "CANCELLED" },
            ].map((s) => (
              <Link
                key={s.label}
                href={qs({ ...goalFilters, status: s.value, page: 1 })}
                className={cx(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  (status ?? "") === s.value
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <NewGoalButton employees={employeeOptions} defaultEmployeeId={emp || undefined} />
        </div>

        {goals.length === 0 ? (
          <EmptyState title="No goals match these filters" hint="Create a goal to start tracking outcomes." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Goal</th>
                <th className="th">Employee</th>
                <th className="th">Category</th>
                <th className="th">Progress</th>
                <th className="th">Status</th>
                <th className="th">Due</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {goals.map((g) => {
                const overdue =
                  g.dueDate &&
                  g.dueDate.getTime() < D(0).getTime() &&
                  g.status !== "COMPLETED" &&
                  g.status !== "CANCELLED";
                return (
                  <tr key={g.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">{g.title}</div>
                      {g.description && (
                        <div className="max-w-md truncate text-xs text-slate-400">{g.description}</div>
                      )}
                    </td>
                    <td className="td text-slate-700">
                      {g.employee.firstName} {g.employee.lastName}
                      <div className="text-xs text-slate-400">{g.employee.employeeNumber}</div>
                    </td>
                    <td className="td text-slate-600">{g.category}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cx(
                              "h-full rounded-full",
                              g.status === "AT_RISK"
                                ? "bg-rose-500"
                                : g.progress >= 80
                                ? "bg-emerald-500"
                                : "bg-indigo-500"
                            )}
                            style={{ width: `${g.progress}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">{g.progress}%</span>
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={GOAL_TONES[g.status] ?? "slate"}>{pretty(g.status)}</Badge>
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className={cx(overdue ? "font-medium text-rose-600" : "text-slate-600")}>
                        {g.dueDate ? formatDate(g.dueDate) : "—"}
                      </span>
                      {overdue && <div className="text-[11px] text-rose-500">Overdue</div>}
                    </td>
                    <td className="td text-right">
                      <GoalRowActions
                        id={g.id}
                        progress={g.progress}
                        status={g.status}
                        dueDate={isoDate(g.dueDate)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        {goalCount > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} · {goalCount} goals
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={qs({ ...goalFilters, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link href={qs({ ...goalFilters, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Feedback ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "All feedback", value: "" },
              { label: "Positive", value: "POSITIVE" },
              { label: "Constructive", value: "CONSTRUCTIVE" },
              { label: "Recognition", value: "RECOGNITION" },
              { label: "General", value: "GENERAL" },
            ].map((s) => (
              <Link
                key={s.label}
                href={qs({ fb: s.value, emp: emp || undefined })}
                className={cx(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  (fbType ?? "") === s.value
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <FeedbackComposer employees={employeeOptions} defaultEmployeeId={emp || undefined} />
        </div>

        {feedback.length === 0 ? (
          <EmptyState title="No feedback yet" hint="Record positive or constructive feedback for your team." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Comment</th>
                <th className="th">Recipient</th>
                <th className="th">Author</th>
                <th className="th">Type</th>
                <th className="th">Visibility</th>
                <th className="th">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feedback.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/70">
                  <td className="td max-w-xl">
                    <span className="line-clamp-2 text-slate-700">{f.comment}</span>
                  </td>
                  <td className="td whitespace-nowrap text-slate-700">
                    {f.employee.firstName} {f.employee.lastName}
                  </td>
                  <td className="td whitespace-nowrap text-slate-600">
                    {f.author.firstName} {f.author.lastName}
                  </td>
                  <td className="td">
                    <Badge tone={FEEDBACK_TONES[f.type] ?? "slate"}>{pretty(f.type)}</Badge>
                  </td>
                  <td className="td">
                    <Badge tone={f.visibility === "PUBLIC" ? "green" : f.visibility === "MANAGER_ONLY" ? "amber" : "slate"}>
                      {pretty(f.visibility)}
                    </Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
