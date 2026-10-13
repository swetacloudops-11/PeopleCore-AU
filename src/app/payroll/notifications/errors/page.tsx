import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/format";
import MarkReadButton from "../MarkReadButton";

const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });

const CHANNEL_TONE: Record<string, string> = {
  EMAIL: "blue",
  IN_APP: "purple",
  SMS: "amber",
  PUSH: "green",
};

export default async function PayrollErrorAlertsPage() {
  const { organisationId, org } = await payrollContext();

  const where = {
    organisationId,
    OR: [
      { event: ci("error") },
      { event: ci("fail") },
      { event: ci("alert") },
      { title: ci("error") },
      { title: ci("fail") },
      { title: ci("alert") },
      { body: ci("error") },
      { body: ci("fail") },
      { body: ci("alert") },
    ],
  };

  const [notifications, total, unread, failedRuns, missingDetails, erroredIntegrations] =
    await Promise.all([
      prisma.orgNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.orgNotification.count({ where }),
      prisma.orgNotification.count({ where: { ...where, isRead: false } }),
      prisma.payRun.findMany({
        where: { organisationId, status: "FAILED" },
        orderBy: { periodStart: "desc" },
        select: {
          id: true,
          label: true,
          payDate: true,
          employeeCount: true,
          grossPay: true,
          notes: true,
        },
      }),
      prisma.employee.count({
        where: {
          organisationId,
          employmentStatus: { not: "TERMINATED" },
          OR: [
            { superFundName: null },
            { superMemberNumber: null },
            { taxFileNumber: null },
            { baseSalary: 0, hourlyRate: 0 },
          ],
        },
      }),
      prisma.organisationIntegration.findMany({
        where: { organisationId, status: "ERROR" },
        select: {
          id: true,
          errorMessage: true,
          lastSyncAt: true,
          integration: { select: { name: true, provider: true } },
        },
      }),
    ]);

  return (
    <div>
      <PageHeader
        title="Payroll Error Alerts"
        subtitle={`Errors, failures and current payroll problems for ${org.name}`}
        action={{ label: "Calculation errors", href: "/payroll/exceptions/calculation-errors" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Error notifications"
          value={total}
          hint={`${unread} unread`}
          tone={total ? "amber" : "emerald"}
        />
        <StatCard
          label="Failed pay runs"
          value={failedRuns.length}
          hint="Calculation stopped"
          tone={failedRuns.length ? "rose" : "emerald"}
        />
        <StatCard
          label="Missing pay details"
          value={missingDetails}
          hint="Active employees"
          tone={missingDetails ? "rose" : "emerald"}
        />
        <StatCard
          label="Errored integrations"
          value={erroredIntegrations.length}
          hint="Connection in error"
          tone={erroredIntegrations.length ? "rose" : "emerald"}
        />
      </div>

      <section className="mb-6 card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Current payroll problems</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/payroll/exceptions/calculation-errors"
            className="card flex items-center justify-between gap-3 p-4 transition hover:shadow-md"
          >
            <div>
              <div className="text-xs font-medium text-slate-500">Failed pay runs</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{failedRuns.length}</div>
            </div>
            <span className="text-lg">⛔</span>
          </Link>
          <Link
            href="/payroll/exceptions/payment-details"
            className="card flex items-center justify-between gap-3 p-4 transition hover:shadow-md"
          >
            <div>
              <div className="text-xs font-medium text-slate-500">Missing pay details</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{missingDetails}</div>
            </div>
            <span className="text-lg">🪪</span>
          </Link>
          <Link
            href="/payroll/integrations"
            className="card flex items-center justify-between gap-3 p-4 transition hover:shadow-md"
          >
            <div>
              <div className="text-xs font-medium text-slate-500">Errored integrations</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {erroredIntegrations.length}
              </div>
            </div>
            <span className="text-lg">🔌</span>
          </Link>
        </div>

        {(failedRuns.length > 0 || erroredIntegrations.length > 0) && (
          <div className="mt-4 space-y-2">
            {failedRuns.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/payroll/pay-runs/${r.id}`}
                    className="text-[13px] font-medium text-rose-800 hover:underline"
                  >
                    {r.label}
                  </Link>
                  <div className="text-[11px] text-rose-600">
                    {formatDate(r.payDate)} · {r.employeeCount} employees ·{" "}
                    {formatMoney(Number(r.grossPay))}
                  </div>
                </div>
                {r.notes && (
                  <span className="max-w-[320px] truncate text-[11px] text-rose-700" title={r.notes}>
                    {r.notes}
                  </span>
                )}
              </div>
            ))}
            {erroredIntegrations.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-rose-800">
                    {m.integration.name}
                  </div>
                  <div className="text-[11px] text-rose-600">
                    {m.integration.provider}
                    {m.lastSyncAt ? ` · last sync ${formatDate(m.lastSyncAt)}` : ""}
                  </div>
                </div>
                <Link href="/payroll/integrations" className="text-[11px] text-rose-700 hover:underline">
                  Reconnect →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Error alerts</h2>
          <MarkReadButton unread={unread} />
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            title="No error alerts"
            hint="Payroll errors, failures and alerts will appear here."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3.5 ${n.isRead ? "" : "bg-rose-50/40"}`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.isRead ? "bg-slate-200" : "bg-rose-500"
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
