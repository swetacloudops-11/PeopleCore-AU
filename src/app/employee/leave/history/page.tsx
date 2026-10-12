import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam } from "@/lib/employee";
import { Badge, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 20;

const STATUS_TONE: Record<string, string> = {
  DRAFT: "blue",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

/** Requests that count as "past". */
const CLOSED_STATUSES: Array<"REJECTED" | "CANCELLED"> = ["REJECTED", "CANCELLED"];

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Coloured pill for a leave type, tinted from its configured colour. */
function TypePill({ name, colour }: { name: string; colour: string }) {
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) {
    return <span className="text-[13px] text-slate-600">{name}</span>;
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${colour}1f`, color: colour }}
    >
      {name}
    </span>
  );
}

export default async function LeaveHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId } = await employeeContext();

  const page = intParam(sp.page, 1);
  const today = D(0);
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Last 12 month buckets, oldest first.
  const monthKeys: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-AU", { month: "short" }),
    });
  }

  const historyWhere = {
    employeeId: employee.id,
    organisationId,
    OR: [{ endDate: { lt: today } }, { status: { in: CLOSED_STATUSES } }],
  };

  const [totalRows, history, takenInWindow] = await Promise.all([
    prisma.leaveRequest.count({ where: historyWhere }),
    prisma.leaveRequest.findMany({
      where: historyWhere,
      orderBy: [{ appliedAt: "desc" }, { startDate: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { leaveType: { select: { name: true, colour: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        organisationId,
        status: "APPROVED",
        startDate: { gte: windowStart, lte: today },
      },
      select: { startDate: true, days: true },
    }),
  ]);

  // Approved leave days per month over the last 12 months.
  const monthly = new Map<string, number>();
  for (const r of takenInWindow) {
    const d = new Date(r.startDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthly.set(key, (monthly.get(key) ?? 0) + Number(r.days));
  }
  const monthPoints = monthKeys.map((m) => ({
    label: m.label,
    value: Math.round((monthly.get(m.key) ?? 0) * 10) / 10,
  }));
  const totalTaken = Math.round(monthPoints.reduce((a, p) => a + p.value, 0) * 10) / 10;

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/employee/leave/history${qs({ page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Leave History
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {employee.firstName} {employee.lastName} · past, rejected and cancelled requests
          </p>
        </div>
        <Link href="/employee/leave/new" className="btn-primary">
          + Apply for leave
        </Link>
      </div>

      {/* ── Days taken per month ── */}
      <ChartPanel
        title="Leave days taken per month"
        subtitle={`Approved leave · last 12 months · ${totalTaken.toFixed(1)}d total`}
      >
        <ColumnChart points={monthPoints} tone="violet" valueFormat={(v) => `${v.toFixed(1)}d`} />
      </ChartPanel>

      {/* ── History table ── */}
      <div className="mt-6">
        {history.length === 0 ? (
          <EmptyState
            title="No past leave yet"
            hint="Requests appear here once they are finished, rejected or cancelled."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Type</th>
                  <th className="th">Dates</th>
                  <th className="th">Days</th>
                  <th className="th">Status</th>
                  <th className="th">Applied</th>
                  <th className="th">Review notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <TypePill name={r.leaveType.name} colour={r.leaveType.colour} />
                    </td>
                    <td className="td whitespace-nowrap text-slate-600">
                      {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    </td>
                    <td className="td tabular-nums text-slate-700">{Number(r.days).toFixed(1)}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{r.status}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(r.appliedAt)}</td>
                    <td className="td max-w-[240px] text-slate-500">
                      {r.reviewedAt ? (r.reviewNotes ?? "—") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
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
                  <Link href={pageHref({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
