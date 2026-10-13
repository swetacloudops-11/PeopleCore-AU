import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { BarList, ChartPanel, type BarItem } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

type Severity = "high" | "medium" | "low";

const SEVERITY_TONE: Record<Severity, string> = {
  high: "red",
  medium: "amber",
  low: "slate",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function ratioSeverity(pct: number, high: number, medium: number): Severity {
  const abs = Math.abs(pct);
  if (abs >= high) return "high";
  if (abs >= medium) return "medium";
  return "low";
}

export default async function PayrollAnomaliesPage() {
  const { organisationId, org } = await payrollContext();

  const [lines, runs, timesheets] = await Promise.all([
    prisma.payRunLine.findMany({
      where: { payRun: { organisationId } },
      select: {
        employeeId: true,
        grossPay: true,
        payRun: { select: { periodStart: true } },
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
      orderBy: { payRun: { periodStart: "asc" } },
    }),
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: { periodStart: "asc" },
      select: { id: true, label: true, periodStart: true, status: true, grossPay: true },
    }),
    prisma.timesheet.findMany({
      where: { organisationId, totalHours: { gt: 0 } },
      select: {
        id: true,
        periodStart: true,
        status: true,
        totalHours: true,
        overtimeHours: true,
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
  ]);

  // ── (a) Employee pay outliers: latest gross > 25% above their run average ──
  type LineItem = { periodStart: Date; gross: number };
  type EmpAgg = { name: string; number: string; items: LineItem[] };
  const byEmployee = new Map<string, EmpAgg>();
  for (const l of lines) {
    const item: LineItem = { periodStart: l.payRun.periodStart, gross: Number(l.grossPay) };
    const existing = byEmployee.get(l.employeeId);
    if (existing) {
      existing.items.push(item);
    } else {
      byEmployee.set(l.employeeId, {
        name: `${l.employee.firstName} ${l.employee.lastName}`,
        number: l.employee.employeeNumber,
        items: [item],
      });
    }
  }

  type Outlier = {
    id: string;
    name: string;
    number: string;
    latest: number;
    average: number;
    changePct: number;
    severity: Severity;
  };
  const outliers: Outlier[] = [];
  for (const [id, entry] of byEmployee) {
    if (entry.items.length < 2) continue;
    const sorted = [...entry.items].sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime()
    );
    const latest = sorted[sorted.length - 1].gross;
    const average = sorted.reduce((a, b) => a + b.gross, 0) / sorted.length;
    if (average <= 0) continue;
    const changePct = ((latest - average) / average) * 100;
    if (changePct <= 25) continue;
    outliers.push({
      id,
      name: entry.name,
      number: entry.number,
      latest,
      average,
      changePct,
      severity: ratioSeverity(changePct, 50, 35),
    });
  }
  outliers.sort((a, b) => b.changePct - a.changePct);

  // ── (b) Run-to-run gross variance greater than 10% ──
  type RunShift = {
    id: string;
    label: string;
    periodStart: Date;
    previous: number;
    current: number;
    changePct: number;
    severity: Severity;
  };
  const runShifts: RunShift[] = [];
  for (let i = 1; i < runs.length; i += 1) {
    const prev = Number(runs[i - 1].grossPay);
    const cur = Number(runs[i].grossPay);
    if (prev <= 0) continue;
    const changePct = ((cur - prev) / prev) * 100;
    if (Math.abs(changePct) <= 10) continue;
    runShifts.push({
      id: runs[i].id,
      label: runs[i].label,
      periodStart: runs[i].periodStart,
      previous: prev,
      current: cur,
      changePct,
      severity: ratioSeverity(changePct, 25, 15),
    });
  }
  runShifts.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  // ── (c) Timesheets with overtime above 20% of total hours ──
  type OvertimeFlag = {
    id: string;
    name: string;
    number: string;
    periodStart: Date;
    total: number;
    overtime: number;
    pct: number;
    severity: Severity;
  };
  const overtimeFlags: OvertimeFlag[] = [];
  for (const t of timesheets) {
    const total = Number(t.totalHours);
    const overtime = Number(t.overtimeHours);
    if (total <= 0) continue;
    const pct = (overtime / total) * 100;
    if (pct <= 20) continue;
    overtimeFlags.push({
      id: t.id,
      name: `${t.employee.firstName} ${t.employee.lastName}`,
      number: t.employee.employeeNumber,
      periodStart: t.periodStart,
      total,
      overtime,
      pct,
      severity: ratioSeverity(pct, 40, 30),
    });
  }
  overtimeFlags.sort((a, b) => b.pct - a.pct);

  const overtimeItems: BarItem[] = overtimeFlags
    .slice(0, 10)
    .map((o) => ({
      label: o.name,
      value: Math.round(o.pct * 10) / 10,
      hint: `${o.overtime.toFixed(1)}h of ${o.total.toFixed(1)}h`,
      tone: "amber" as const,
    }));

  const allSeverities: Severity[] = [
    ...outliers.map((o) => o.severity),
    ...runShifts.map((r) => r.severity),
    ...overtimeFlags.map((o) => o.severity),
  ];
  const totalAnomalies = allSeverities.length;
  const highCount = allSeverities.filter((s) => s === "high").length;
  const mediumCount = allSeverities.filter((s) => s === "medium").length;
  const lowCount = allSeverities.filter((s) => s === "low").length;

  return (
    <div>
      <PageHeader
        title="Payroll Anomalies"
        subtitle={`Unusual pay movements detected across ${org.name}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Anomalies"
          value={totalAnomalies}
          hint="All classes"
          tone={totalAnomalies ? "amber" : "emerald"}
        />
        <StatCard label="High severity" value={highCount} hint="Review first" tone={highCount ? "rose" : "emerald"} />
        <StatCard label="Medium severity" value={mediumCount} hint="Worth a look" tone={mediumCount ? "amber" : "emerald"} />
        <StatCard label="Low severity" value={lowCount} hint="Monitor" tone="sky" />
      </div>

      {/* ── (a) Employee pay outliers ── */}
      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Employee pay outliers</h2>
          <span className="text-xs text-slate-400">{outliers.length} flagged</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Latest pay run line is more than 25% above the employee&apos;s average gross across runs.
        </p>
        {outliers.length === 0 ? (
          <EmptyState title="No pay outliers" hint="No employee&apos;s latest gross exceeded their average by 25%." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Latest gross</th>
                <th className="th">Average gross</th>
                <th className="th">Change</th>
                <th className="th">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outliers.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{o.name}</div>
                    <div className="text-xs text-slate-400">{o.number}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-700">{formatMoney(o.latest)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{formatMoney(o.average)}</td>
                  <td className="td whitespace-nowrap font-medium text-amber-600">
                    +{o.changePct.toFixed(1)}%
                  </td>
                  <td className="td">
                    <Badge tone={SEVERITY_TONE[o.severity]}>{SEVERITY_LABEL[o.severity]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ── (b) Run-to-run variance ── */}
      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Run-to-run variance</h2>
          <span className="text-xs text-slate-400">{runShifts.length} flagged</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Total gross moved by more than 10% compared with the previous pay run.
        </p>
        {runShifts.length === 0 ? (
          <EmptyState title="No run variance" hint="Consecutive pay runs are within 10% of each other." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Pay run</th>
                <th className="th">Period</th>
                <th className="th">Previous gross</th>
                <th className="th">This gross</th>
                <th className="th">Change</th>
                <th className="th">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runShifts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/payroll/pay-runs/${r.id}`}
                      className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {r.label}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(r.periodStart)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{formatMoney(r.previous)}</td>
                  <td className="td whitespace-nowrap text-slate-700">{formatMoney(r.current)}</td>
                  <td
                    className={`td whitespace-nowrap font-medium ${
                      r.changePct >= 0 ? "text-amber-600" : "text-sky-600"
                    }`}
                  >
                    {r.changePct >= 0 ? "+" : ""}
                    {r.changePct.toFixed(1)}%
                  </td>
                  <td className="td">
                    <Badge tone={SEVERITY_TONE[r.severity]}>{SEVERITY_LABEL[r.severity]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ── (c) Overtime-heavy timesheets ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Overtime-heavy timesheets</h2>
          <span className="text-xs text-slate-400">{overtimeFlags.length} flagged</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Overtime hours exceed 20% of the total hours recorded on the timesheet.
        </p>
        {overtimeFlags.length === 0 ? (
          <EmptyState title="No overtime anomalies" hint="No timesheet has overtime above 20% of total hours." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Period</th>
                  <th className="th">Total h</th>
                  <th className="th">Overtime h</th>
                  <th className="th">OT %</th>
                  <th className="th">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overtimeFlags.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">{o.name}</div>
                      <div className="text-xs text-slate-400">{o.number}</div>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(o.periodStart)}</td>
                    <td className="td text-slate-600">{o.total.toFixed(1)}</td>
                    <td className="td text-slate-600">{o.overtime.toFixed(1)}</td>
                    <td className="td font-medium text-amber-600">{o.pct.toFixed(1)}%</td>
                    <td className="td">
                      <Badge tone={SEVERITY_TONE[o.severity]}>{SEVERITY_LABEL[o.severity]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <ChartPanel title="Top overtime ratios" subtitle="Share of total hours that is overtime">
              <BarList
                items={overtimeItems}
                tone="amber"
                valueFormat={(v) => `${v.toFixed(1)}%`}
                showPercents={false}
              />
            </ChartPanel>
          </div>
        )}
      </section>
    </div>
  );
}
