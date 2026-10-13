import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  type ColumnPoint,
} from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 20;

const BADGE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "blue",
  VIEWED: "green",
};

type GroupItem = {
  id: string;
  name: string;
  number: string;
  gross: number;
  net: number;
  status: string;
};

type Group = {
  key: string;
  start: Date;
  end: Date;
  gross: number;
  net: number;
  count: number;
  items: GroupItem[];
};

export default async function PayslipHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();
  const page = intParam(sp.page, 1);

  const rows = await prisma.payslip.findMany({
    where: { organisationId },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      grossPay: true,
      netPay: true,
      status: true,
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
    },
  });

  // Group into pay periods, newest first.
  const groupMap = new Map<string, Group>();
  for (const p of rows) {
    const key = p.periodStart.toISOString().slice(0, 10);
    let group = groupMap.get(key);
    if (!group) {
      group = {
        key,
        start: p.periodStart,
        end: p.periodEnd,
        gross: 0,
        net: 0,
        count: 0,
        items: [],
      };
      groupMap.set(key, group);
    }
    group.gross += Number(p.grossPay);
    group.net += Number(p.netPay);
    group.count += 1;
    group.items.push({
      id: p.id,
      name: `${p.employee.firstName} ${p.employee.lastName}`,
      number: p.employee.employeeNumber,
      gross: Number(p.grossPay),
      net: Number(p.netPay),
      status: p.status,
    });
  }

  const groups = [...groupMap.values()];
  const pages = Math.max(1, Math.ceil(groups.length / PAGE));
  const pageGroups = groups.slice((page - 1) * PAGE, page * PAGE);

  const totalGross = groups.reduce((a, g) => a + g.gross, 0);
  const totalNet = groups.reduce((a, g) => a + g.net, 0);

  const chartGroups = [...groups].reverse();
  const grossPoints: ColumnPoint[] = chartGroups.map((g) => ({
    label: formatDate(g.start),
    value: Math.round(g.gross),
  }));
  const netPoints: ColumnPoint[] = chartGroups.map((g) => ({
    label: formatDate(g.start),
    value: Math.round(g.net),
  }));

  return (
    <div>
      <PageHeader
        title="Payslip History"
        subtitle={`${org.name} · payslips grouped by pay period`}
        action={{ label: "All payslips", href: "/payroll/payslips" }}
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Periods covered" value={groups.length} hint="Distinct pay periods" tone="amber" />
        <StatCard label="Total gross" value={formatMoney(totalGross)} hint="All payslips" tone="sky" />
        <StatCard label="Total net" value={formatMoney(totalNet)} hint="All payslips" tone="emerald" />
      </div>

      {/* ── Chart ── */}
      <div className="mt-6">
        <ChartPanel title="Gross vs net by period" subtitle="Total pay across every period on record">
          {chartGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No payslips yet</p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Gross pay
                </p>
                <ColumnChart
                  points={grossPoints}
                  tone="amber"
                  height={120}
                  valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                />
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Net pay
                </p>
                <ColumnChart
                  points={netPoints}
                  tone="emerald"
                  height={120}
                  valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                />
              </div>
            </div>
          )}
        </ChartPanel>
      </div>

      {/* ── Timeline ── */}
      <div className="mt-6">
        {pageGroups.length === 0 ? (
          <EmptyState
            title="No payslip history"
            hint="Once payslips are generated they will be grouped here by pay period."
          />
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {pageGroups.map((g) => (
              <li key={g.key} className="relative">
                <span className="absolute -left-[26px] top-3 grid h-3 w-3 place-items-center rounded-full border-2 border-amber-400 pc-knob" />
                <div className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        {formatDate(g.start)} → {formatDate(g.end)}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {g.count} payslip{g.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">
                        Gross <span className="font-medium tabular-nums text-slate-800">{formatMoney(g.gross)}</span>
                      </span>
                      <span className="text-slate-500">
                        Net <span className="font-medium tabular-nums text-slate-800">{formatMoney(g.net)}</span>
                      </span>
                    </div>
                  </div>

                  <ul className="mt-3 divide-y divide-slate-100">
                    {g.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate text-[13px] text-slate-700">
                          {item.name}
                          <span className="ml-1.5 text-[11px] text-slate-400">{item.number}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-[13px] tabular-nums text-slate-600">
                          {formatMoney(item.gross)}
                          <span className="font-medium text-slate-800">{formatMoney(item.net)}</span>
                          <Badge tone={BADGE[item.status] ?? "slate"}>{item.status}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {groups.length} periods
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
