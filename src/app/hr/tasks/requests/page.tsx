import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function EmployeeRequestsPage() {
  const { organisationId } = await hrContext();

  const [leaveRequests, timesheets] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { organisationId, status: "PENDING" },
      orderBy: { appliedAt: "asc" },
      take: 100,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        leaveType: { select: { name: true, colour: true, unit: true } },
      },
    }),
    prisma.timesheet.findMany({
      where: { organisationId, status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      take: 100,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
  ]);

  const totalHours = timesheets.reduce((a, t) => a + Number(t.totalHours), 0);
  const totalOvertime = timesheets.reduce((a, t) => a + Number(t.overtimeHours), 0);

  const oldestLeave = leaveRequests[0]?.appliedAt ?? null;
  const oldestTimesheet = timesheets[0]?.submittedAt ?? null;
  const oldest = [oldestLeave, oldestTimesheet]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const leaveByType = leaveRequests.reduce<Record<string, number>>((acc, r) => {
    acc[r.leaveType.name] = (acc[r.leaveType.name] ?? 0) + 1;
    return acc;
  }, {});
  const leaveTypeItems = Object.entries(leaveByType)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const requestSegments: DonutSegment[] = (
    [
      { label: "Leave requests", value: leaveRequests.length, tone: "sky" },
      { label: "Timesheets", value: timesheets.length, tone: "amber" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  const requestedDays = leaveRequests.reduce((a, r) => a + Number(r.days), 0);

  return (
    <div>
      <PageHeader
        title="Employee Requests"
        subtitle="A read-only queue of pending leave and submitted timesheets awaiting a decision."
        action={{ label: "Approve leave", href: "/hr/leave/approvals" }}
      />

      <div className="card mb-5 flex flex-wrap items-center gap-3 border-sky-200 bg-sky-50 px-4 py-3">
        <Badge tone="blue">READ ONLY</Badge>
        <span className="text-sm text-sky-900">
          Requests are actioned in the Leave module. This view aggregates what is waiting.
        </span>
        <Link href="/hr/leave/approvals" className="btn-primary ml-auto !py-1.5 text-xs">
          Review in Leave →
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Pending leave" value={leaveRequests.length} hint={`${requestedDays} days requested`} tone="sky" />
        <StatCard label="Pending timesheets" value={timesheets.length} hint={`${totalHours.toFixed(1)} h submitted`} tone="amber" />
        <StatCard label="Overtime awaiting" value={`${totalOvertime.toFixed(1)} h`} hint="Across pending timesheets" tone="indigo" />
        <StatCard
          label="Oldest request"
          value={oldest ? formatDate(oldest) : "—"}
          hint={oldest ? "Submitted and still waiting" : "Nothing waiting"}
          tone={oldest ? "rose" : "emerald"}
        />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Requests by kind" subtitle="What is waiting on HR right now">
          {requestSegments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No pending requests</p>
          ) : (
            <Donut
              segments={requestSegments}
              size={132}
              thickness={16}
              centerValue={leaveRequests.length + timesheets.length}
              centerLabel="waiting"
            />
          )}
        </ChartPanel>

        <ChartPanel title="Pending leave by type" subtitle="Requests awaiting approval">
          {leaveTypeItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No pending leave</p>
          ) : (
            <BarList items={leaveTypeItems} tone="sky" valueFormat={(v) => String(v)} />
          )}
        </ChartPanel>
      </div>

      {/* ── Pending leave ── */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Pending leave requests</h2>
          <Link href="/hr/leave/approvals" className="text-xs text-sky-600 hover:underline">
            Approve in Leave →
          </Link>
        </div>
        {leaveRequests.length === 0 ? (
          <EmptyState title="No leave requests waiting" hint="New requests will appear here for visibility." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Type</th>
                <th className="th">Dates</th>
                <th className="th">Days</th>
                <th className="th">Applied</th>
                <th className="th">Reason</th>
                <th className="th text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaveRequests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/hr/employees/${r.employee.id}`}
                      className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                    >
                      {r.employee.firstName} {r.employee.lastName}
                    </Link>
                    <div className="text-[11px] text-slate-400">{r.employee.employeeNumber}</div>
                  </td>
                  <td className="td">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `${r.leaveType.colour}1a`, color: r.leaveType.colour }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.leaveType.colour }} />
                      {r.leaveType.name}
                    </span>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </td>
                  <td className="td text-slate-600">{String(r.days)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDateTime(r.appliedAt)}</td>
                  <td className="td max-w-[220px] truncate text-slate-500">{r.reason ?? "—"}</td>
                  <td className="td text-right">
                    <Link href="/hr/leave/approvals" className="text-xs font-medium text-sky-600 hover:underline">
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ── Pending timesheets ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Submitted timesheets</h2>
          <Link href="/hr/leave/approvals" className="text-xs text-sky-600 hover:underline">
            Approvals →
          </Link>
        </div>
        {timesheets.length === 0 ? (
          <EmptyState title="No timesheets waiting" hint="Submitted timesheets will appear here once lodged." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th">Hours</th>
                <th className="th">Overtime</th>
                <th className="th">Status</th>
                <th className="th">Submitted</th>
                <th className="th text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timesheets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/hr/employees/${t.employee.id}`}
                      className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                    >
                      {t.employee.firstName} {t.employee.lastName}
                    </Link>
                    <div className="text-[11px] text-slate-400">{t.employee.employeeNumber}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(t.periodStart)} → {formatDate(t.periodEnd)}
                  </td>
                  <td className="td text-slate-600">{Number(t.totalHours).toFixed(1)}</td>
                  <td className="td text-slate-600">{Number(t.overtimeHours).toFixed(1)}</td>
                  <td className="td">
                    <Badge tone="amber">SUBMITTED</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {t.submittedAt ? formatDateTime(t.submittedAt) : "—"}
                  </td>
                  <td className="td text-right">
                    <Link href="/hr/leave/approvals" className="text-xs font-medium text-sky-600 hover:underline">
                      Review →
                    </Link>
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
