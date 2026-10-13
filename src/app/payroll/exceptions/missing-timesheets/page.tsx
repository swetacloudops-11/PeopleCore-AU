import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { BarList, ChartPanel, type BarItem } from "@/components/charts";
import { formatDate } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const daysBetween = (from: Date) =>
  Math.max(0, Math.round((D(0).getTime() - from.getTime()) / 86_400_000));

const STATUS_TONE: Record<string, string> = {
  DRAFT: "amber",
  SUBMITTED: "blue",
  APPROVED: "green",
  REJECTED: "red",
  PAID: "green",
};

export default async function PayrollMissingTimesheetsPage() {
  const { organisationId, org } = await payrollContext();

  const schedule = await prisma.paySchedule.findFirst({
    where: { organisationId, isActive: true },
    orderBy: { nextRunDate: "desc" },
    select: { name: true, frequency: true, nextRunDate: true },
  });

  const employees = await prisma.employee.findMany({
    where: { organisationId, employmentStatus: { not: "TERMINATED" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      department: { select: { name: true } },
      timesheets: {
        orderBy: { periodStart: "desc" },
        take: 1,
        select: { periodStart: true, status: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const nextRun = schedule?.nextRunDate ?? null;
  const periodOpen = !nextRun || nextRun >= D(0);
  const windowStart = D(-14);

  type Row = {
    id: string;
    name: string;
    employeeNumber: string;
    department: string | null;
    last: { periodStart: Date; status: string } | null;
    daysSince: number | null;
    reasons: string[];
  };

  const rows: Row[] = [];
  let noRecentCount = 0;
  let draftCount = 0;

  for (const e of employees) {
    const latest = e.timesheets[0] ?? null;
    const noRecent = !latest || latest.periodStart < windowStart;
    const draftOpen = latest?.status === "DRAFT" && periodOpen;
    if (!noRecent && !draftOpen) continue;

    const reasons: string[] = [];
    if (noRecent) {
      reasons.push("No timesheet in last 14 days");
      noRecentCount += 1;
    }
    if (draftOpen) {
      reasons.push("Latest timesheet still DRAFT");
      draftCount += 1;
    }

    rows.push({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      employeeNumber: e.employeeNumber,
      department: e.department?.name ?? null,
      last: latest,
      daysSince: latest ? daysBetween(latest.periodStart) : null,
      reasons,
    });
  }

  const byDepartment = new Map<string, number>();
  for (const r of rows) {
    const key = r.department ?? "Unassigned";
    byDepartment.set(key, (byDepartment.get(key) ?? 0) + 1);
  }
  const departmentItems: BarItem[] = [...byDepartment.entries()]
    .map(([label, value]) => ({ label, value, tone: "amber" as const }))
    .sort((a, b) => b.value - a.value);

  const periodLabel = schedule
    ? `${schedule.name} · ${schedule.frequency.charAt(0) + schedule.frequency.slice(1).toLowerCase()}${nextRun ? ` · next run ${formatDate(nextRun)}` : ""}`
    : "No active pay schedule";

  return (
    <div>
      <PageHeader
        title="Missing Timesheets"
        subtitle={`Active employees without a current timesheet for ${org.name} — ${periodLabel}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Missing timesheets"
          value={rows.length}
          hint="Active employees flagged"
          tone={rows.length ? "amber" : "emerald"}
        />
        <StatCard
          label="No recent timesheet"
          value={noRecentCount}
          hint="Nothing in the last 14 days"
          tone={noRecentCount ? "rose" : "emerald"}
        />
        <StatCard
          label="Draft awaiting"
          value={draftCount}
          hint="Latest sheet still draft"
          tone={draftCount ? "amber" : "emerald"}
        />
        <StatCard
          label="Departments affected"
          value={byDepartment.size}
          hint="Across the organisation"
          tone="sky"
        />
      </div>

      {rows.length > 0 && (
        <div className="mb-6">
          <ChartPanel title="By department" subtitle="Employees missing a current timesheet">
            <BarList items={departmentItems} tone="amber" />
          </ChartPanel>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Employees to chase</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="No missing timesheets"
            hint="Every active employee has a current timesheet covering the open pay period."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Department</th>
                <th className="th">Last timesheet</th>
                <th className="th">Days since</th>
                <th className="th">Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.employeeNumber}</div>
                  </td>
                  <td className="td text-slate-500">{r.department ?? "—"}</td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {r.last ? (
                      <span className="flex items-center gap-2">
                        {formatDate(r.last.periodStart)}
                        <Badge tone={STATUS_TONE[r.last.status] ?? "slate"}>{r.last.status}</Badge>
                      </span>
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="td text-slate-600">
                    {r.daysSince == null ? "—" : `${r.daysSince}d`}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {r.reasons.map((reason) => (
                        <Badge key={reason} tone="amber">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
