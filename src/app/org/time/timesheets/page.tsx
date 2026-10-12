import Link from "next/link";
import { TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { StatCard, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";
import TimesheetTable from "./TimesheetTable";

export const dynamic = "force-dynamic";

const PAGE = 25;

/** Today ± n days as a calendar date (UTC midnight — how Prisma stores @db.Date). */
const D = (days: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

/** "YYYY-MM-DD" → that calendar date (UTC midnight), or the fallback. */
const pd = (value: string | undefined, fallback: Date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : fallback;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"];

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(TimesheetStatus, sp.status);
  const from = sp.from ? pd(sp.from, D(-30)) : null;
  const to = sp.to ? pd(sp.to, D(0)) : null;

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(from && to
      ? { periodStart: { lte: to }, periodEnd: { gte: from } }
      : from
        ? { periodEnd: { gte: from } }
        : to
          ? { periodStart: { lte: to } }
          : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, awaiting, rows, counts, hoursTrend] = await Promise.all([
    prisma.timesheet.count({ where }),
    prisma.timesheet.count({ where: { organisationId, status: "SUBMITTED" } }),
    prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: "desc" }, { employee: { lastName: "asc" } }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        approvedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.timesheet.groupBy({ by: ["status"], _count: true, where: { organisationId } }),
    prisma.timesheet.groupBy({
      by: ["periodStart"],
      _count: true,
      _avg: { totalHours: true },
      where: { organisationId },
      orderBy: { periodStart: "desc" },
      take: 8,
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const base = { q: q || undefined, from: from ? iso(from) : undefined, to: to ? iso(to) : undefined, page };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · review, approve and pay employee timesheets
          </p>
        </div>
        <Link
          href={qs({ ...base, status: "SUBMITTED", page: 1 })}
          className={awaiting ? "btn-primary" : "btn-secondary"}
        >
          ⏱ {awaiting} awaiting approval
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={awaiting}
          hint="Submitted and waiting on you"
          tone={awaiting ? "amber" : "emerald"}
        />
        <StatCard label="Approved" value={countMap.APPROVED ?? 0} hint="Ready for payroll" tone="indigo" />
        <StatCard label="Draft" value={countMap.DRAFT ?? 0} hint="Not submitted yet" tone="sky" />
        <StatCard label="Total timesheets" value={totalAll} hint="All periods" tone="emerald" />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Timesheets by status" subtitle="All periods on record">
          <Donut
            segments={(
              [
                { label: "Awaiting approval", value: countMap.SUBMITTED ?? 0, tone: "amber" },
                { label: "Approved", value: countMap.APPROVED ?? 0, tone: "emerald" },
                { label: "Draft", value: countMap.DRAFT ?? 0, tone: "sky" },
                { label: "Rejected", value: countMap.REJECTED ?? 0, tone: "rose" },
                { label: "Paid", value: countMap.PAID ?? 0, tone: "violet" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={136}
            thickness={16}
            centerValue={totalAll}
            centerLabel="timesheets"
          />
        </ChartPanel>

        <ChartPanel
          title="Average hours per period"
          subtitle="Mean submitted hours, last 8 periods"
          action={
            <Link href="/org/reports/attendance" className="text-[11px] text-indigo-600 hover:underline">
              Report →
            </Link>
          }
        >
          <ColumnChart
            points={[...hoursTrend].reverse().map((h) => ({
              label: new Date(h.periodStart).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
              value: Math.round(Number(h._avg.totalHours ?? 0) * 10) / 10,
            }))}
            tone="indigo"
            height={124}
            valueFormat={(v) => `${v}h`}
          />
        </ChartPanel>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <Link
            key={s}
            href={qs({ ...base, status: s === "ALL" ? undefined : s, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.status ?? "ALL") === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s} · {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="ts-from">Period from</label>
          <input id="ts-from" type="date" name="from" defaultValue={from ? iso(from) : ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ts-to">Period to</label>
          <input id="ts-to" type="date" name="to" defaultValue={to ? iso(to) : ""} className="input" />
        </div>
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="ts-q">Employee</label>
          <input
            id="ts-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or employee number…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No timesheets match these filters"
            hint="Try clearing the status chip or widening the period."
          />
        ) : (
          <TimesheetTable
            rows={rows.map((t) => ({
              id: t.id,
              employee: `${t.employee.firstName} ${t.employee.lastName}`,
              employeeNumber: t.employee.employeeNumber,
              period: `${formatDate(t.periodStart)} → ${formatDate(t.periodEnd)}`,
              totalHours: Number(t.totalHours),
              overtimeHours: Number(t.overtimeHours),
              status: t.status,
              submittedAt: t.submittedAt ? formatDateTime(t.submittedAt) : null,
              approvedBy: t.approvedBy ? t.approvedBy.name || t.approvedBy.email : null,
              rejectedReason: t.rejectedReason,
            }))}
          />
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} timesheets
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...base, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ ...base, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
