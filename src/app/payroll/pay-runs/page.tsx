import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam, strParam } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, ColumnChart, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 15;
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "FAILED"] as const;

/** Status → badge tone (Badge tones). */
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function PayRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const raw = strParam(sp.status).toUpperCase();
  const status = (STATUSES as readonly string[]).includes(raw) ? raw : "ALL";
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    ...(status !== "ALL" ? { status: status as (typeof STATUSES)[number] } : {}),
  };

  const yearStart = new Date(Date.UTC(new Date().getFullYear(), 0, 1));

  const [total, rows, counts, openRuns, paidThisYear, grossPaid, chartRuns] = await Promise.all([
    prisma.payRun.count({ where }),
    prisma.payRun.findMany({
      where,
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        status: true,
        employeeCount: true,
        grossPay: true,
        netPay: true,
        _count: { select: { lines: true, payslips: true } },
      },
    }),
    prisma.payRun.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
    prisma.payRun.count({
      where: { organisationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
    }),
    prisma.payRun.count({
      where: { organisationId, status: "PAID", paidAt: { gte: yearStart } },
    }),
    prisma.payRun.aggregate({
      where: { organisationId, status: "PAID" },
      _sum: { grossPay: true },
    }),
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: { payDate: "desc" },
      take: 12,
      select: { label: true, payDate: true, grossPay: true },
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const segments = (
    [
      { label: "Draft", value: countMap.DRAFT ?? 0, tone: "slate" },
      { label: "Pending approval", value: countMap.PENDING_APPROVAL ?? 0, tone: "amber" },
      { label: "Approved", value: countMap.APPROVED ?? 0, tone: "sky" },
      { label: "Paid", value: countMap.PAID ?? 0, tone: "emerald" },
      { label: "Failed", value: countMap.FAILED ?? 0, tone: "rose" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  const chartPoints = [...chartRuns].reverse().map((r) => ({
    label: r.label.replace(/^Pay run /, "#").split("—")[0].trim() || formatDate(r.payDate),
    value: Number(r.grossPay),
  }));

  return (
    <div>
      <PageHeader
        title="All pay runs"
        subtitle={`${org.name} · ${totalAll} run${totalAll === 1 ? "" : "s"} across all periods`}
        action={{ label: "New pay run", href: "/payroll/pay-runs/new" }}
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total runs"
          value={totalAll}
          hint="Every pay run on record"
          tone="indigo"
        />
        <StatCard
          label="Open runs"
          value={openRuns}
          hint="Draft, pending or approved"
          tone={openRuns ? "amber" : "emerald"}
        />
        <StatCard
          label="Paid this year"
          value={paidThisYear}
          hint={`Year ${new Date().getFullYear()}`}
          tone="sky"
        />
        <StatCard
          label="Total gross paid"
          value={formatMoney(grossPaid._sum.grossPay ?? 0)}
          hint="Across all paid runs"
          tone="emerald"
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Runs by status" subtitle="Lifecycle of every pay run">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={totalAll}
            centerLabel="pay runs"
          />
        </ChartPanel>

        <ChartPanel title="Gross pay per run" subtitle="Most recent pay runs">
          {chartPoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No pay runs yet</p>
          ) : (
            <ColumnChart
              points={chartPoints}
              tone="amber"
              height={128}
              valueFormat={(v) => `$${Math.round(v / 1000)}k`}
            />
          )}
        </ChartPanel>
      </div>

      {/* ── Status chips ── */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <Link
            key={s}
            href={`/payroll/pay-runs${qs({ status: s === "ALL" ? undefined : s, page: 1 })}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === s
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s.replace(/_/g, " ")} ·{" "}
            {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No pay runs found"
            hint="Clear the filter or create a new draft pay run to get started."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Pay run</th>
                <th className="th">Period</th>
                <th className="th">Pay date</th>
                <th className="th">Status</th>
                <th className="th text-right">Employees</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Net</th>
                <th className="th text-right">Lines / payslips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/payroll/pay-runs/${r.id}`}
                      className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {r.label}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(r.payDate)}</td>
                  <td className="td">
                    <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">{r.employeeCount}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(r.grossPay)}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.netPay)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-500">
                    {r._count.lines} / {r._count.payslips}
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
            Page {page} of {pages} · {total} run{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/payroll/pay-runs${qs({ status: status === "ALL" ? undefined : status, page: page - 1 })}`}
                className="btn-secondary !py-1.5 text-xs"
              >
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={`/payroll/pay-runs${qs({ status: status === "ALL" ? undefined : status, page: page + 1 })}`}
                className="btn-secondary !py-1.5 text-xs"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
