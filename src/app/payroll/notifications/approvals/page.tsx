import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/format";
import MarkReadButton from "../MarkReadButton";

const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });

const CHANNEL_TONE: Record<string, string> = {
  EMAIL: "blue",
  IN_APP: "purple",
  SMS: "amber",
  PUSH: "green",
};

export default async function PayrollApprovalNotificationsPage() {
  const { organisationId, org } = await payrollContext();

  const where = {
    organisationId,
    OR: [{ event: ci("approv") }, { title: ci("approv") }, { body: ci("approv") }],
  };

  const [notifications, total, unread, pendingRuns, submittedTimesheets] = await Promise.all([
    prisma.orgNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.orgNotification.count({ where }),
    prisma.orgNotification.count({ where: { ...where, isRead: false } }),
    prisma.payRun.findMany({
      where: { organisationId, status: "PENDING_APPROVAL" },
      orderBy: { payDate: "asc" },
      select: {
        id: true,
        label: true,
        periodStart: true,
        payDate: true,
        employeeCount: true,
        grossPay: true,
      },
    }),
    prisma.timesheet.findMany({
      where: { organisationId, status: "SUBMITTED" },
      orderBy: { periodStart: "asc" },
      take: 50,
      select: {
        id: true,
        periodStart: true,
        totalHours: true,
        submittedAt: true,
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Approval Notifications"
        subtitle={`Approvals raised for ${org.name}, plus everything waiting on a decision right now`}
        action={{ label: "Approve pay runs", href: "/payroll/approve" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Approval notifications"
          value={total}
          hint={`${unread} unread`}
          tone="indigo"
        />
        <StatCard
          label="Awaiting approval"
          value={pendingRuns.length}
          hint="Pay runs pending"
          tone={pendingRuns.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Submitted timesheets"
          value={submittedTimesheets.length}
          hint="Awaiting sign-off"
          tone={submittedTimesheets.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Items to action"
          value={pendingRuns.length + submittedTimesheets.length}
          hint="Across payroll"
          tone="sky"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Pay runs awaiting approval</h2>
            <Link href="/payroll/approve" className="text-xs text-amber-600 hover:underline">
              Open approvals →
            </Link>
          </div>
          {pendingRuns.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No pay runs are waiting for approval.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingRuns.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/payroll/pay-runs/${r.id}`}
                      className="text-[13px] font-medium text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {r.label}
                    </Link>
                    <div className="text-[11px] text-slate-400">
                      {formatDate(r.periodStart)} · pay {formatDate(r.payDate)} ·{" "}
                      {r.employeeCount} employees
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-medium text-slate-700">
                      {formatMoney(Number(r.grossPay))}
                    </div>
                    <Badge tone="amber">PENDING</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Timesheets waiting to be approved</h2>
            <Link href="/payroll/timesheets/pending" className="text-xs text-amber-600 hover:underline">
              Review timesheets →
            </Link>
          </div>
          {submittedTimesheets.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No submitted timesheets are waiting.
            </p>
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Period</th>
                  <th className="th">Hours</th>
                  <th className="th">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submittedTimesheets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">
                        {t.employee.firstName} {t.employee.lastName}
                      </div>
                      <div className="text-xs text-slate-400">{t.employee.employeeNumber}</div>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDate(t.periodStart)}
                    </td>
                    <td className="td text-slate-600">{Number(t.totalHours).toFixed(1)}</td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {t.submittedAt ? timeAgo(t.submittedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </section>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Approval notifications</h2>
          <MarkReadButton unread={unread} />
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            title="No approval notifications"
            hint="Pay run and timesheet approval alerts will appear here."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3.5 ${n.isRead ? "" : "bg-amber-50/40"}`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.isRead ? "bg-slate-200" : "bg-amber-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[13px] ${
                        n.isRead ? "font-medium text-slate-700" : "font-semibold text-slate-900"
                      }`}
                    >
                      {n.title}
                    </span>
                    <Badge tone={CHANNEL_TONE[n.channel] ?? "slate"}>
                      {n.channel.replace(/_/g, " ")}
                    </Badge>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-snug text-slate-600">{n.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span title={formatDateTime(n.createdAt)}>{formatDateTime(n.createdAt)}</span>
                    <code className="text-slate-400">{n.event}</code>
                    {n.linkUrl && (
                      <Link href={n.linkUrl} className="text-amber-600 hover:underline">
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
