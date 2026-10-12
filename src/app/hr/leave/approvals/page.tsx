import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";
import { LeaveActions } from "./LeaveActions";

export default async function LeaveApprovalsPage() {
  const { organisationId, org } = await hrContext();

  const [pending, allPending] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { organisationId, status: "PENDING" },
      orderBy: [{ appliedAt: "asc" }],
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
        leaveType: { select: { id: true, name: true, colour: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { organisationId, status: "PENDING" },
      select: { leaveTypeId: true, employeeId: true },
    }),
  ]);

  const totalDays = pending.reduce((a, r) => a + Number(r.days), 0);
  const employeesWaiting = new Set(allPending.map((r) => r.employeeId)).size;
  const oldest = pending[0] ?? null;

  const typeCounts = new Map<string, { name: string; colour: string; value: number }>();
  for (const r of pending) {
    const entry = typeCounts.get(r.leaveTypeId) ?? {
      name: r.leaveType.name,
      colour: r.leaveType.colour,
      value: 0,
    };
    entry.value += 1;
    typeCounts.set(r.leaveTypeId, entry);
  }
  const segments: DonutSegment[] = Array.from(typeCounts.values()).map((t) => ({
    label: t.name,
    value: t.value,
    color: t.colour,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Approve / reject leave
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · {pending.length} request{pending.length === 1 ? "" : "s"} awaiting a decision
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Awaiting decision"
          value={pending.length}
          hint="Pending leave requests"
          tone={pending.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Days requested"
          value={totalDays}
          hint="Across pending requests"
          tone="sky"
        />
        <StatCard
          label="Employees waiting"
          value={employeesWaiting}
          hint="People with open requests"
          tone="indigo"
        />
        <StatCard
          label="Oldest request"
          value={oldest ? formatDate(oldest.appliedAt) : "—"}
          hint={oldest ? `${oldest.employee.firstName} ${oldest.employee.lastName}` : "Queue is clear"}
          tone={oldest ? "rose" : "emerald"}
        />
      </div>

      {pending.length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ChartPanel title="Pending by leave type" subtitle="Requests waiting on a decision">
            <Donut
              segments={segments}
              size={136}
              thickness={16}
              centerValue={pending.length}
              centerLabel="pending"
            />
          </ChartPanel>
          <ChartPanel title="How approvals work" subtitle="Decisions are recorded against your account">
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                Approving a request records you as the reviewer with the current timestamp.
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                Add a note when rejecting so the employee understands the decision.
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                Every decision is written to the HR audit trail.
              </li>
            </ul>
          </ChartPanel>
        </div>
      )}

      <div className="mt-6">
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing to approve"
            hint="New leave requests will appear here as soon as employees lodge them."
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
                <th className="th">Requested</th>
                <th className="th text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pending.map((l) => (
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
                  <td className="td max-w-[16rem] truncate text-slate-500">
                    {l.reason ?? "—"}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDateTime(l.appliedAt)}
                  </td>
                  <td className="td">
                    <LeaveActions
                      request={{
                        id: l.id,
                        label: `${l.employee.firstName} ${l.employee.lastName} · ${
                          l.leaveType.name
                        } · ${formatDate(l.startDate)} → ${formatDate(l.endDate)}`,
                      }}
                    />
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
