import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, BarList, type BarItem } from "@/components/charts";
import { formatDate } from "@/lib/format";

/** Flag a timesheet when its hours differ from the standard week by more than 15%. */
const VARIANCE_THRESHOLD = 15;

type Row = {
  id: string;
  name: string;
  employeeNumber: string;
  periodStart: Date;
  standardHours: number;
  timesheetHours: number;
  variance: number;
  variancePct: number;
  flagged: boolean;
};

export default async function TimesheetVariancesPage() {
  const { organisationId, org } = await payrollContext();

  const timesheets = await prisma.timesheet.findMany({
    where: { organisationId },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          standardHoursPerWeek: true,
          employmentStatus: true,
        },
      },
    },
  });

  // Keep only the latest timesheet per active employee.
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const t of timesheets) {
    if (t.employee.employmentStatus === "TERMINATED") continue;
    if (seen.has(t.employee.id)) continue;
    seen.add(t.employee.id);

    const standardHours = Number(t.employee.standardHoursPerWeek);
    const timesheetHours = Number(t.totalHours);
    const variance = timesheetHours - standardHours;
    const variancePct = standardHours > 0 ? (variance / standardHours) * 100 : 0;
    rows.push({
      id: t.id,
      name: `${t.employee.firstName} ${t.employee.lastName}`,
      employeeNumber: t.employee.employeeNumber,
      periodStart: t.periodStart,
      standardHours,
      timesheetHours,
      variance,
      variancePct,
      flagged: Math.abs(variancePct) > VARIANCE_THRESHOLD,
    });
  }

  rows.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));

  const inVariance = rows.filter((r) => r.flagged);
  const over = inVariance.filter((r) => r.variance > 0).length;
  const under = inVariance.filter((r) => r.variance < 0).length;

  const biggest = inVariance.slice(0, 8).map(
    (r): BarItem => ({
      label: r.name,
      value: Math.round(Math.abs(r.variance) * 100) / 100,
      hint: `${r.variance > 0 ? "+" : "-"}${Math.abs(r.variancePct).toFixed(1)}% vs ${r.standardHours} h standard`,
      tone: r.variance > 0 ? "rose" : "amber",
    })
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Timesheet variances
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · latest hours compared with the standard week (flag over{" "}
            {VARIANCE_THRESHOLD}%)
          </p>
        </div>
        <Link href="/payroll/timesheets" className="btn-secondary">
          All timesheets
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="In variance"
          value={inVariance.length}
          hint={`More than ${VARIANCE_THRESHOLD}% from standard`}
          tone={inVariance.length ? "rose" : "emerald"}
        />
        <StatCard label="Over standard" value={over} hint="More hours than expected" tone="amber" />
        <StatCard label="Under standard" value={under} hint="Fewer hours than expected" tone="sky" />
      </div>

      {/* ── Biggest variances ── */}
      <div className="mt-5">
        <ChartPanel
          title="Biggest variances"
          subtitle="Largest absolute difference from the standard week"
        >
          <BarList
            items={biggest}
            valueFormat={(v) => `${v.toFixed(2)} h`}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No timesheets to compare"
            hint="Once employees submit timesheets their hours will be compared with the standard week."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Latest period</th>
                <th className="th text-right">Standard hours</th>
                <th className="th text-right">Timesheet hours</th>
                <th className="th text-right">Variance</th>
                <th className="th text-right">Variance %</th>
                <th className="th">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={r.flagged ? "bg-amber-50/40 hover:bg-amber-50/70" : "hover:bg-slate-50/70"}
                >
                  <td className="td">
                    <span className="font-medium text-slate-800">{r.name}</span>
                    <div className="text-[11px] text-slate-400">{r.employeeNumber}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(r.periodStart)}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {r.standardHours.toFixed(2)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-700">
                    {r.timesheetHours.toFixed(2)}
                  </td>
                  <td
                    className={`td text-right font-medium tabular-nums ${
                      r.variance === 0
                        ? "text-slate-600"
                        : r.variance > 0
                        ? "text-rose-600"
                        : "text-sky-600"
                    }`}
                  >
                    {r.variance > 0 ? "+" : ""}
                    {r.variance.toFixed(2)}
                  </td>
                  <td
                    className={`td text-right tabular-nums ${
                      r.flagged ? "font-medium text-amber-700" : "text-slate-600"
                    }`}
                  >
                    {r.variancePct > 0 ? "+" : ""}
                    {r.variancePct.toFixed(1)}%
                  </td>
                  <td className="td">
                    {r.flagged ? (
                      <Badge tone="amber">Check</Badge>
                    ) : (
                      <Badge tone="green">Within range</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
