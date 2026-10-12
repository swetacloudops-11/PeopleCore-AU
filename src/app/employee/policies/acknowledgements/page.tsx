import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, ProgressBar, Donut, type DonutSegment } from "@/components/charts";
import { formatDate } from "@/lib/format";
import AckButton from "../AckButton";

/** Badge tones (separate from chart tones). */
const ACK_TONE: Record<string, string> = {
  ACKNOWLEDGED: "green",
  PENDING: "amber",
  OVERDUE: "red",
  WAIVED: "slate",
};

export default async function PolicyAcknowledgementsPage() {
  const { employee, organisationId } = await employeeContext();

  const acks = await prisma.policyAcknowledgement.findMany({
    where: { employeeId: employee.id, organisationId },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { policy: { title: "asc" } }],
    include: { policy: { select: { title: true, category: true } } },
  });

  const total = acks.length;
  const acknowledged = acks.filter((a) => a.status === "ACKNOWLEDGED").length;
  const pending = acks.filter((a) => a.status === "PENDING").length;
  const overdue = acks.filter((a) => a.status === "OVERDUE").length;
  const waived = acks.filter((a) => a.status === "WAIVED").length;

  const segments = ([
    { label: "Acknowledged", value: acknowledged, tone: "emerald" },
    { label: "Pending", value: pending, tone: "amber" },
    { label: "Overdue", value: overdue, tone: "rose" },
    { label: "Waived", value: waived, tone: "slate" },
  ] as DonutSegment[]).filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Policy acknowledgements"
        subtitle="Review and acknowledge the policies assigned to you"
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Assigned" value={total} hint="Policies needing your sign-off" tone="indigo" />
        <StatCard label="Acknowledged" value={acknowledged} hint="Signed off" tone="emerald" />
        <StatCard
          label="Pending"
          value={pending}
          hint="Awaiting your response"
          tone={pending > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Past their due date"
          tone={overdue > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* ── Progress + status mix ── */}
      {total > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ChartPanel title="Your progress" subtitle="Acknowledged vs total assigned">
            <ProgressBar
              value={acknowledged}
              max={total}
              tone={overdue > 0 ? "rose" : "emerald"}
              label={`${acknowledged} of ${total} policies acknowledged`}
            />
          </ChartPanel>
          <ChartPanel
            title="Status mix"
            subtitle="Your acknowledgement statuses"
            action={
              <Link href="/employee/policies" className="text-[11px] text-violet-600 hover:underline">
                All policies →
              </Link>
            }
          >
            <Donut segments={segments} size={132} thickness={16} centerValue={total} centerLabel="assigned" />
          </ChartPanel>
        </div>
      )}

      {/* ── Acknowledgement table ── */}
      <div className="mt-6">
        {acks.length === 0 ? (
          <EmptyState
            title="No acknowledgements assigned"
            hint="When HR assigns a policy to you it will appear here for sign-off."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Policy</th>
                <th className="th">Category</th>
                <th className="th">Due date</th>
                <th className="th">Status</th>
                <th className="th">Acknowledged</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {acks.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{a.policy.title}</td>
                  <td className="td text-slate-600">{a.policy.category}</td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {a.dueDate ? formatDate(a.dueDate) : "—"}
                  </td>
                  <td className="td">
                    <Badge tone={ACK_TONE[a.status] ?? "slate"}>{a.status}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {a.acknowledgedAt ? formatDate(a.acknowledgedAt) : "—"}
                  </td>
                  <td className="td">
                    <div className="flex justify-end">
                      {(a.status === "PENDING" || a.status === "OVERDUE") && (
                        <AckButton policyId={a.policyId} />
                      )}
                    </div>
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
