import Link from "next/link";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";

const PAGE = 25;

const REVIEWED = ["APPROVED", "REJECTED", "CANCELLED"] as const;

const STATUS_TONE: Record<string, string> = {
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

const STATUS_COLOUR: Record<string, DonutSegment["tone"]> = {
  APPROVED: "emerald",
  REJECTED: "rose",
  CANCELLED: "slate",
};

export default async function LeaveHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; employee?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const q = strParam(sp.q);
  const employeeId = strParam(sp.employee);
  const page = intParam(sp.page, 1, 500);
  const statusParam = parseEnum(LeaveStatus, sp.status);
  const status = statusParam && REVIEWED.includes(statusParam as never) ? statusParam : undefined;

  const where = {
    organisationId,
    status: status ? status : { in: [...REVIEWED] },
    reviewedAt: { not: null },
    ...(employeeId ? { employeeId } : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, rows, counts, employees] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ reviewedAt: "desc" }],
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
      where: { organisationId, status: { in: [...REVIEWED] }, reviewedAt: { not: null } },
      _count: true,
    }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
  ]);

  const countMap = new Map<string, number>(
    counts.map((c): [string, number] => [c.status, c._count])
  );
  const totalReviewed = counts.reduce((a, c) => a + c._count, 0);
  const approved = countMap.get("APPROVED") ?? 0;
  const approvalRate = totalReviewed ? Math.round((approved / totalReviewed) * 100) : 0;

  const segments: DonutSegment[] = REVIEWED.map((s) => ({
    label: s,
    value: countMap.get(s) ?? 0,
    tone: STATUS_COLOUR[s],
  })).filter((s) => s.value > 0);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = {
    status: sp.status,
    employee: employeeId || undefined,
    q: q || undefined,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Leave history
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · every request that has been reviewed
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Reviewed" value={totalReviewed} hint="All time" tone="sky" />
        <StatCard label="Approved" value={approved} hint="Approved requests" tone="emerald" />
        <StatCard
          label="Rejected"
          value={countMap.get("REJECTED") ?? 0}
          hint="Declined requests"
          tone="rose"
        />
        <StatCard
          label="Approval rate"
          value={`${approvalRate}%`}
          hint={`${totalReviewed} decisions`}
          tone={approvalRate >= 70 ? "emerald" : "amber"}
        />
      </div>

      {totalReviewed > 0 && (
        <div className="mt-5">
          <ChartPanel title="Decisions by outcome" subtitle="Approved, rejected and cancelled">
            <Donut
              segments={segments}
              size={140}
              thickness={16}
              centerValue={totalReviewed}
              centerLabel="reviewed"
            />
          </ChartPanel>
        </div>
      )}

      <form method="GET" action="/hr/leave/history" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="lh-q">
            Employee
          </label>
          <input
            id="lh-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search name…"
          />
        </div>
        <div>
          <label className="label" htmlFor="lh-status">
            Decision
          </label>
          <select id="lh-status" name="status" defaultValue={sp.status ?? ""} className="input !w-40">
            <option value="">All decisions</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lh-emp">
            Employee
          </label>
          <select id="lh-emp" name="employee" defaultValue={employeeId} className="input !w-52">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
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
            title="No reviewed leave found"
            hint="Approved and rejected requests will be archived here."
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
                  <th className="th">Decision</th>
                  <th className="th">Reviewed by</th>
                  <th className="th">Reviewed</th>
                  <th className="th">Notes</th>
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
                    <td className="td font-medium tabular-nums text-slate-700">{Number(l.days)}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[l.status] ?? "slate"}>{l.status}</Badge>
                    </td>
                    <td className="td text-slate-600">
                      {l.reviewedBy ? l.reviewedBy.name || l.reviewedBy.email : "Admin"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDateTime(l.reviewedAt)}
                    </td>
                    <td className="td max-w-[16rem] truncate text-slate-500">
                      {l.reviewNotes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {pages} · {total} reviewed
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={qs({ ...base, page: page - 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      ← Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link
                      href={qs({ ...base, page: page + 1 })}
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
