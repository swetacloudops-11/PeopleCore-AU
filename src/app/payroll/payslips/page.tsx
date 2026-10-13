import Link from "next/link";
import { PayslipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam, strParam } from "@/lib/payroll";
import { parseEnum } from "@/lib/enums";
import { Badge, EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 25;
const STATUSES = ["PENDING", "ISSUED", "VIEWED"];

const BADGE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "blue",
  VIEWED: "green",
};

const TONE: Record<string, "amber" | "sky" | "emerald"> = {
  PENDING: "amber",
  ISSUED: "sky",
  VIEWED: "emerald",
};

export default async function PayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(PayslipStatus, sp.status);

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

  const [total, rows, counts, periods] = await Promise.all([
    prisma.payslip.count({ where }),
    prisma.payslip.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        payRun: { select: { id: true, label: true } },
      },
    }),
    prisma.payslip.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
    prisma.payslip.groupBy({
      by: ["periodStart"],
      where: { organisationId },
      _sum: { netPay: true },
      orderBy: { periodStart: "asc" },
    }),
  ]);

  const countMap: Record<string, number> = Object.fromEntries(
    counts.map((c) => [c.status, c._count])
  );
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, status: sp.status || undefined };

  const donutSegments: DonutSegment[] = STATUSES.map((s) => ({
    label: s,
    value: countMap[s] ?? 0,
    tone: TONE[s],
  }));

  const netByPeriod: ColumnPoint[] = periods.map((p) => ({
    label: formatDate(p.periodStart),
    value: Number(p._sum.netPay ?? 0),
  }));

  return (
    <div>
      <PageHeader
        title="All Payslips"
        subtitle={`${org.name} · every issued and pending employee payslip`}
        action={{ label: "Generate payslips", href: "/payroll/payslips/generate" }}
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total payslips" value={totalAll} hint="All periods" tone="amber" />
        <StatCard label="Issued" value={countMap.ISSUED ?? 0} hint="Shared with employees" tone="sky" />
        <StatCard label="Viewed" value={countMap.VIEWED ?? 0} hint="Opened by employees" tone="emerald" />
        <StatCard
          label="Pending"
          value={countMap.PENDING ?? 0}
          hint="Not yet issued"
          tone={(countMap.PENDING ?? 0) ? "rose" : "emerald"}
        />
      </div>

      {/* ── Charts ── */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Payslips by status" subtitle="Across all pay runs">
          <Donut
            segments={donutSegments}
            size={132}
            thickness={16}
            centerValue={totalAll}
            centerLabel="payslips"
          />
        </ChartPanel>
        <ChartPanel title="Net pay per period" subtitle="Total net across payslips">
          {netByPeriod.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No payslips yet</p>
          ) : (
            <ColumnChart
              points={netByPeriod}
              tone="amber"
              height={124}
              valueFormat={(v) => `$${Math.round(v / 1000)}k`}
            />
          )}
        </ChartPanel>
      </div>

      {/* ── Status chips ── */}
      <div className="mt-6 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <Link
            key={s}
            href={qs({ ...base, status: s === "ALL" ? undefined : s, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.status ?? "ALL") === s
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s} · {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      {/* ── Search ── */}
      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="sl-q">
            Search employee
          </label>
          <input
            id="sl-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or employee number…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-primary">
          Search
        </button>
        {q && (
          <Link href={qs({ ...base, q: undefined, page: 1 })} className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No payslips found"
            hint="Payslips are created when you generate them for an approved or paid run."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Pay run</th>
                <th className="th">Period</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Tax</th>
                <th className="th text-right">Super</th>
                <th className="th text-right">Net</th>
                <th className="th">Status</th>
                <th className="th">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="font-medium text-slate-800">
                      {p.employee.firstName} {p.employee.lastName}
                    </span>
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      {p.employee.employeeNumber}
                    </span>
                  </td>
                  <td className="td">
                    <Link
                      href={`/payroll/pay-runs/${p.payRun.id}`}
                      className="text-slate-600 hover:text-amber-600 hover:underline"
                    >
                      {p.payRun.label}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                  </td>
                  <td className="td text-right tabular-nums">{formatMoney(p.grossPay)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(p.taxAmount)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(p.superAmount)}</td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(p.netPay)}
                  </td>
                  <td className="td">
                    <Badge tone={BADGE[p.status] ?? "slate"}>{p.status}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {p.issuedAt ? formatDate(p.issuedAt) : "—"}
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
            Page {page} of {pages} · {total} payslips
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
