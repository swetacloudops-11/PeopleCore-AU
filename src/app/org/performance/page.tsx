import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, StatCard, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const PAGE_SIZE = 25;
const ACTIVE_GOAL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK"] as const;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const REVIEW_TONES: Record<string, string> = {
  DRAFT: "slate",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Bar({ value, tone = "indigo" }: { value: number; tone?: string }) {
  const bar =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
      ? "bg-amber-500"
      : tone === "rose"
      ? "bg-rose-500"
      : "bg-indigo-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-slate-500">{value}%</span>
    </div>
  );
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const dept = strParam(one(sp.dept));
  const q = strParam(one(sp.q));
  const page = intParam(one(sp.page), 1, 500);

  const where = {
    organisationId,
    ...(dept ? { departmentId: dept } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { employeeNumber: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [
    employees,
    employeeCount,
    departments,
    reviewsCompleted,
    ratingAgg,
    goalsOnTrack,
    goalsAtRisk,
    reviewStatus,
    ratingRows,
  ] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        employmentStatus: true,
        department: { select: { name: true } },
        reviews: {
          select: {
            id: true,
            status: true,
            overallRating: true,
            type: true,
            title: true,
            dueDate: true,
          },
          orderBy: { createdAt: "desc" },
        },
        goals: {
          where: { status: { in: [...ACTIVE_GOAL_STATUSES] } },
          select: { status: true, progress: true },
        },
        _count: {
          select: {
            feedbackReceived: { where: { createdAt: { gte: D(-30) } } },
          },
        },
      },
    }),
    prisma.employee.count({ where }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.review.count({ where: { organisationId, status: "COMPLETED" } }),
    prisma.review.aggregate({
      where: { organisationId, status: "COMPLETED", overallRating: { not: null } },
      _avg: { overallRating: true },
      _count: { overallRating: true },
    }),
    prisma.goal.count({ where: { organisationId, status: "IN_PROGRESS" } }),
    prisma.goal.count({ where: { organisationId, status: "AT_RISK" } }),
    prisma.review.groupBy({
      by: ["status"],
      where: { organisationId },
      _count: true,
    }),
    prisma.review.findMany({
      where: { organisationId, status: "COMPLETED", overallRating: { not: null } },
      select: { overallRating: true },
      take: 300,
    }),
  ]);

  const avgRating = ratingAgg._avg.overallRating
    ? Number(ratingAgg._avg.overallRating)
    : null;
  const totalPages = Math.max(1, Math.ceil(employeeCount / PAGE_SIZE));
  const filters = { dept: dept || undefined, q: q || undefined };

  const reviewStatusCount = (s: string) =>
    reviewStatus.find((r) => r.status === s)?._count ?? 0;

  // Bucket completed ratings into half-star bands for a readable distribution.
  const ratingBuckets = (() => {
    const bands = [
      { label: "5.0 ★ outstanding", from: 4.75, value: 0 },
      { label: "4.0 – 4.75 strong", from: 4.0, value: 0 },
      { label: "3.0 – 4.0 solid", from: 3.0, value: 0 },
      { label: "2.0 – 3.0 developing", from: 2.0, value: 0 },
      { label: "below 2.0 needs focus", from: 0, value: 0 },
    ];
    for (const r of ratingRows) {
      const v = Number(r.overallRating);
      if (Number.isNaN(v)) continue;
      const band = bands.find((b) => v >= b.from);
      if (band) band.value += 1;
    }
    return bands.filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value }));
  })();

  return (
    <div>
      <PageHeader
        title="Employee Performance"
        subtitle="Review status, ratings, goals and feedback for every employee."
        action={{ label: "Reviews", href: "/org/performance/reviews" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Reviews completed"
          value={reviewsCompleted}
          hint={`${ratingAgg._count.overallRating} rated`}
          tone="emerald"
        />
        <StatCard
          label="Average rating"
          value={avgRating ? `${avgRating.toFixed(2)} / 5` : "—"}
          hint="From completed reviews"
          tone="indigo"
        />
        <StatCard label="Goals on track" value={goalsOnTrack} hint="In progress" tone="sky" />
        <StatCard
          label="At-risk goals"
          value={goalsAtRisk}
          hint="Needs manager attention"
          tone={goalsAtRisk ? "rose" : "emerald"}
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Reviews by status" subtitle="Every performance review on record">
          <Donut
            segments={(
              [
                { label: "Completed", value: reviewStatusCount("COMPLETED"), tone: "emerald" },
                { label: "In progress", value: reviewStatusCount("IN_PROGRESS"), tone: "sky" },
                { label: "Draft", value: reviewStatusCount("DRAFT"), tone: "amber" },
                { label: "Cancelled", value: reviewStatusCount("CANCELLED"), tone: "slate" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={134}
            thickness={16}
            centerValue={reviewStatus.reduce((a, r) => a + r._count, 0)}
            centerLabel="reviews"
          />
        </ChartPanel>

        <ChartPanel
          title="Rating distribution"
          subtitle={`Completed reviews · avg ${avgRating ? avgRating.toFixed(2) : "—"} / 5`}
          action={
            <Link href="/org/performance/reviews" className="text-[11px] text-indigo-600 hover:underline">
              Reviews →
            </Link>
          }
        >
          <BarList
            items={ratingBuckets}
            tone="indigo"
            valueFormat={(v) => String(v)}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {employeeCount} employee{employeeCount === 1 ? "" : "s"} in view
        </span>
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input name="q" key={`q-${q}`} defaultValue={q} placeholder="Search people…" className="input !w-48" />
          <select name="dept" key={`d-${dept}`} defaultValue={dept} className="input !w-48">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {employees.length === 0 ? (
        <EmptyState title="No employees match these filters" hint="Clear the filters to see everyone." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => {
            const latest = e.reviews[0] ?? null;
            const ratings = e.reviews
              .map((r) => (r.overallRating ? Number(r.overallRating) : null))
              .filter((n): n is number => n !== null);
            const empRating = ratings.length
              ? ratings.reduce((a, b) => a + b, 0) / ratings.length
              : null;
            const goalCount = e.goals.length;
            const avgProgress = goalCount
              ? Math.round(e.goals.reduce((n, g) => n + g.progress, 0) / goalCount)
              : 0;
            const atRisk = e.goals.filter((g) => g.status === "AT_RISK").length;

            return (
              <div key={e.id} className="card p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {e.employeeNumber} · {e.department?.name ?? "No department"}
                    </div>
                  </div>
                  <Badge tone={e.employmentStatus === "ACTIVE" ? "green" : "amber"}>
                    {pretty(e.employmentStatus)}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Latest review
                    </div>
                    {latest ? (
                      <>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge tone={REVIEW_TONES[latest.status] ?? "slate"}>
                            {pretty(latest.status)}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-slate-500">{latest.type.replace("_", " ")}</div>
                      </>
                    ) : (
                      <div className="mt-1 text-slate-400">None yet</div>
                    )}
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Avg rating
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">
                      {empRating ? empRating.toFixed(1) : "—"}
                      <span className="text-xs font-normal text-slate-400"> / 5</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {goalCount} active goal{goalCount === 1 ? "" : "s"}
                      {atRisk > 0 && <span className="text-rose-500"> · {atRisk} at risk</span>}
                    </span>
                    <span className="tabular-nums">{avgProgress}% avg</span>
                  </div>
                  <Bar
                    value={avgProgress}
                    tone={atRisk ? "rose" : avgProgress >= 60 ? "emerald" : "indigo"}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]">
                  <span className="text-slate-500">
                    {e._count.feedbackReceived} feedback · last 30 days
                  </span>
                  <span className="flex gap-2">
                    <Link
                      href={`/org/performance/reviews?emp=${e.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      Reviews →
                    </Link>
                    <Link
                      href={`/org/performance/goals?emp=${e.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      Goals →
                    </Link>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {employeeCount > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages} · {employeeCount} employees
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...filters, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ ...filters, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-slate-400">
        Last updated {formatDate(new Date())} · ratings sourced from completed reviews.
      </p>
    </div>
  );
}
