import Link from "next/link";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";

const PAGE = 25;

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "DRAFT"] as const;

const STATUS_TONE: Record<string, string> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
  DRAFT: "blue",
};

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const shortMonth = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", { month: "short" }).format(d);

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    employee?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const q = strParam(sp.q);
  const status = parseEnum(LeaveStatus, sp.status);
  const leaveTypeId = strParam(sp.type);
  const employeeId = strParam(sp.employee);
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(leaveTypeId ? { leaveTypeId } : {}),
    ...(employeeId ? { employeeId } : {}),
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

  const [total, pending, rows, statusGroups, employees, leaveTypes, typeGroups, dateRows] =
    await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
      prisma.leaveRequest.findMany({
        where,
        orderBy: [{ appliedAt: "desc" }],
        skip: (page - 1) * PAGE,
        take: PAGE,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
          leaveType: { select: { id: true, name: true, colour: true } },
          reviewedBy: { select: { name: true, email: true } },
        },
      }),
      prisma.leaveRequest.groupBy({
        by: ["status"],
        where: { organisationId },
        _count: true,
      }),
      prisma.employee.findMany({
        where: { organisationId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      }),
      prisma.leaveType.findMany({
        where: { organisationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, colour: true },
      }),
      prisma.leaveRequest.groupBy({
        by: ["leaveTypeId"],
        where: { organisationId },
        _count: true,
      }),
      prisma.leaveRequest.findMany({
        where: { organisationId },
        select: { startDate: true },
      }),
    ]);

  const countMap = new Map<string, number>(
    statusGroups.map((g): [string, number] => [g.status, g._count])
  );
  const totalAll = statusGroups.reduce((a, g) => a + g._count, 0);

  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: monthKey(d), label: shortMonth(d), value: 0 };
  });
  const monthIndex = new Map<string, number>(
    buckets.map((b, i): [string, number] => [b.key, i])
  );
  for (const r of dateRows) {
    const idx = monthIndex.get(monthKey(r.startDate));
    if (idx !== undefined) buckets[idx].value += 1;
  }
  const points: ColumnPoint[] = buckets.map((b) => ({
    label: b.label,
    value: b.value,
    tone: "sky",
  }));

  const typeSegments: DonutSegment[] = leaveTypes
    .map((t) => ({
      label: t.name,
      value: typeGroups.find((g) => g.leaveTypeId === t.id)?._count ?? 0,
      color: t.colour,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = {
    q: q || undefined,
    type: leaveTypeId || undefined,
    employee: employeeId || undefined,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Leave requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · every leave request on record
          </p>
        </div>
        <Link href="/hr/leave/approvals" className="btn-primary">
          Review pending
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Pending"
          value={pending}
          hint="Awaiting a decision"
          tone={pending ? "amber" : "emerald"}
        />
        <StatCard
          label="Approved"
          value={countMap.get("APPROVED") ?? 0}
          hint="All time"
          tone="emerald"
        />
        <StatCard
          label="Rejected"
          value={countMap.get("REJECTED") ?? 0}
          hint="All time"
          tone="rose"
        />
        <StatCard label="Total requests" value={totalAll} hint="All statuses" tone="sky" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Requests by leave type" subtitle="Which types people are taking">
          <Donut
            segments={typeSegments}
            size={140}
            thickness={16}
            centerValue={totalAll}
            centerLabel="requests"
          />
        </ChartPanel>

        <ChartPanel title="Requests by month" subtitle="Requests lodged by leave start month">
          <ColumnChart points={points} tone="sky" height={150} />
        </ChartPanel>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["ALL", ...STATUSES] as const).map((s) => {
          const activeChip = (sp.status ?? "ALL") === s;
          return (
            <Link
              key={s}
              href={qs({ ...base, status: s === "ALL" ? undefined : s, page: 1 })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeChip
                  ? "bg-sky-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "ALL" ? "All" : s} · {s === "ALL" ? totalAll : countMap.get(s) ?? 0}
            </Link>
          );
        })}
      </div>

      <form method="GET" action="/hr/leave/requests" className="mt-4 flex flex-wrap items-end gap-3">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="lv-q">
            Employee
          </label>
          <input
            id="lv-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search name or employee number…"
          />
        </div>
        <div>
          <label className="label" htmlFor="lv-type">
            Leave type
          </label>
          <select id="lv-type" name="type" defaultValue={leaveTypeId} className="input !w-44">
            <option value="">All types</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lv-emp">
            Employee
          </label>
          <select id="lv-emp" name="employee" defaultValue={employeeId} className="input !w-52">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeNumber})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No leave requests found"
            hint="Try clearing the filters or a different search term."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Type</th>
                  <th className="th">Dates</th>
                  <th className="th">Days</th>
                  <th className="th">Reason</th>
                  <th className="th">Requested</th>
                  <th className="th">Status</th>
                  <th className="th">Reviewed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">
                      {l.employee.firstName} {l.employee.lastName}
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {l.employee.employeeNumber}
                      </span>
                    </td>
                    <td className="td">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: `${l.leaveType.colour}1a`,
                          color: l.leaveType.colour,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: l.leaveType.colour }}
                        />
                        {l.leaveType.name}
                      </span>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDate(l.startDate)} → {formatDate(l.endDate)}
                    </td>
                    <td className="td font-medium tabular-nums">
                      {Number(l.days)}
                      <span className="ml-1 font-normal text-slate-400">
                        ({Number(l.hours)}h)
                      </span>
                    </td>
                    <td className="td max-w-[16rem] truncate text-slate-500">
                      {l.reason ?? "—"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDateTime(l.appliedAt)}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[l.status] ?? "slate"}>{l.status}</Badge>
                      {l.reviewNotes && (
                        <div className="mt-0.5 max-w-[14rem] truncate text-[11px] text-slate-400">
                          {l.reviewNotes}
                        </div>
                      )}
                    </td>
                    <td className="td text-slate-500">
                      {l.reviewedAt
                        ? `${
                            l.reviewedBy ? l.reviewedBy.name || l.reviewedBy.email : "Admin"
                          } · ${formatDate(l.reviewedAt)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {pages} · {total} requests
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={qs({ ...base, status: sp.status, page: page - 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      ← Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link
                      href={qs({ ...base, status: sp.status, page: page + 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      Next →
                    </Link>
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
