import Link from "next/link";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";
import { LeaveActions, NewLeaveRequest } from "./Actions";

export const dynamic = "force-dynamic";

const PAGE = 25;

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

const TONE: Record<string, string> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(LeaveStatus, sp.status);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
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

  const [total, pending, rows, counts, employees, leaveTypes, byType] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ appliedAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        leaveType: { select: { id: true, name: true, colour: true, unit: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.leaveRequest.groupBy({ by: ["status"], _count: true, where: { organisationId } }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.leaveType.findMany({
      where: { organisationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true, unit: true },
    }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      _count: true,
      where: { organisationId },
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, page };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Leave management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · request, approve and track employee leave
          </p>
        </div>
        <NewLeaveRequest
          employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
          leaveTypes={leaveTypes.map((t) => ({ id: t.id, name: t.name, colour: t.colour }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting decision" value={pending} hint="Pending leave requests" tone={pending ? "amber" : "emerald"} />
        <StatCard label="Approved" value={countMap.APPROVED ?? 0} hint="All time" tone="emerald" />
        <StatCard label="Rejected" value={countMap.REJECTED ?? 0} hint="All time" tone="rose" />
        <StatCard label="Total requests" value={totalAll} hint="All statuses" tone="indigo" />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Requests by status" subtitle="All leave requests on record">
          <Donut
            segments={(
              [
                { label: "Pending", value: countMap.PENDING ?? 0, tone: "amber" },
                { label: "Approved", value: countMap.APPROVED ?? 0, tone: "emerald" },
                { label: "Rejected", value: countMap.REJECTED ?? 0, tone: "rose" },
                { label: "Cancelled", value: countMap.CANCELLED ?? 0, tone: "slate" },
                { label: "Draft", value: countMap.DRAFT ?? 0, tone: "sky" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={136}
            thickness={16}
            centerValue={totalAll}
            centerLabel="requests"
          />
        </ChartPanel>

        <ChartPanel title="Requests by leave type" subtitle="Which types people are taking">
          <BarList
            items={leaveTypes
              .map((t) => ({
                label: t.name,
                value: byType.find((b) => b.leaveTypeId === t.id)?._count ?? 0,
                color: t.colour,
              }))
              .filter((i) => i.value > 0)
              .sort((a, b) => b.value - a.value)
              .slice(0, 7)}
            valueFormat={(v) => String(v)}
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
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="lv-q">Employee</label>
          <input
            id="lv-q"
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
            title="No leave requests found"
            hint="Clear the filters or lodge a new request on behalf of an employee."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Type</th>
                <th className="th">Dates</th>
                <th className="th">Days</th>
                <th className="th">Reason</th>
                <th className="th">Applied</th>
                <th className="th">Status</th>
                <th className="th">Reviewed by</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {l.employee.firstName} {l.employee.lastName}
                    <span className="ml-1.5 text-[11px] text-slate-400">{l.employee.employeeNumber}</span>
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
                  <td className="td text-slate-500">
                    {formatDate(l.startDate)} → {formatDate(l.endDate)}
                  </td>
                  <td className="td font-medium tabular-nums">
                    {String(l.days)}
                    <span className="ml-1 font-normal text-slate-400">
                      ({String(l.hours)}h)
                    </span>
                  </td>
                  <td className="td max-w-[16rem] truncate text-slate-500">{l.reason ?? "—"}</td>
                  <td className="td text-slate-500">{formatDateTime(l.appliedAt)}</td>
                  <td className="td">
                    <Badge tone={TONE[l.status] ?? "slate"}>{l.status}</Badge>
                    {l.reviewNotes && (
                      <div className="mt-0.5 max-w-[14rem] truncate text-[11px] text-slate-400">
                        {l.reviewNotes}
                      </div>
                    )}
                  </td>
                  <td className="td text-slate-500">
                    {l.reviewedAt ? `${l.reviewedBy ? l.reviewedBy.name || l.reviewedBy.email : "Admin"} · ${formatDate(l.reviewedAt)}` : "—"}
                  </td>
                  <td className="td">
                    <div className="flex justify-end">
                      <LeaveActions
                        request={{
                          id: l.id,
                          status: l.status,
                          label: `${l.employee.firstName} ${l.employee.lastName} · ${l.leaveType.name} · ${formatDate(l.startDate)} → ${formatDate(l.endDate)}`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} requests
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
