import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, ColumnChart, ProgressBar, type ColumnPoint } from "@/components/charts";
import { formatDate, daysFromNow, daysUntil, cx } from "@/lib/format";

const EXPIRING_WINDOW_DAYS = 60;

/** Calendar-month buckets starting from the current month. */
function monthWindow(count: number): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-AU", { month: "short" }),
    });
  }
  return out;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

export default async function DocumentExpiryPage() {
  const { organisationId } = await hrContext();

  const trackedWhere = {
    organisationId,
    expiryDate: { not: null, lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
  };

  const [tracked, upcoming, expired, expiring, next30, noExpiry] = await Promise.all([
    prisma.employeeDocument.findMany({
      where: trackedWhere,
      orderBy: { expiryDate: "asc" },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.employeeDocument.findMany({
      where: { organisationId, expiryDate: { gte: daysFromNow(0) } },
      select: { expiryDate: true },
    }),
    prisma.employeeDocument.count({ where: { organisationId, expiryDate: { lt: daysFromNow(0) } } }),
    prisma.employeeDocument.count({
      where: {
        organisationId,
        expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
      },
    }),
    prisma.employeeDocument.count({
      where: { organisationId, expiryDate: { gte: daysFromNow(0), lte: daysFromNow(30) } },
    }),
    prisma.employeeDocument.count({ where: { organisationId, expiryDate: null } }),
  ]);

  const buckets = monthWindow(6);
  const counts = new Map<string, number>();
  for (const d of upcoming) {
    if (!d.expiryDate) continue;
    const k = monthKey(d.expiryDate);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const points: ColumnPoint[] = buckets.map((b) => ({
    label: b.label,
    value: counts.get(b.key) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Document expiry tracking"
        subtitle="Expired documents and those expiring within the next 60 days, most urgent first."
        action={{ label: "Upload documents", href: "/hr/documents/upload" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Expired" value={expired} hint="Renew or archive" tone={expired ? "rose" : "emerald"} />
        <StatCard label="Expiring ≤60d" value={expiring} hint="Action required" tone={expiring ? "amber" : "emerald"} />
        <StatCard label="Next 30 days" value={next30} hint="Highest priority" tone={next30 ? "amber" : "emerald"} />
        <StatCard label="No expiry set" value={noExpiry} hint="Permanent records" tone="sky" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartPanel title="Expiries by month" subtitle="Documents expiring over the next six months">
            <ColumnChart points={points} tone="sky" height={150} />
          </ChartPanel>
        </div>
        <ChartPanel title="30-day window" subtitle="Share of tracked documents expiring within 30 days">
          <ProgressBar
            value={next30}
            max={Math.max(1, tracked.length)}
            tone="amber"
            label={`${next30} of ${tracked.length} tracked`}
          />
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-[13px] text-slate-600">
            <div className="flex items-center justify-between">
              <span>Already expired</span>
              <Badge tone="red">{expired}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Expiring within 60 days</span>
              <Badge tone="amber">{expiring}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>No expiry date</span>
              <Badge tone="slate">{noExpiry}</Badge>
            </div>
          </div>
        </ChartPanel>
      </div>

      <div className="mt-6">
        {tracked.length === 0 ? (
          <EmptyState
            title="No expired or expiring documents"
            hint="Documents with an expiry date in the past or the next 60 days will appear here."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Document</th>
                <th className="th">Category</th>
                <th className="th">Expiry</th>
                <th className="th">Days remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tracked.map((d) => {
                const days = d.expiryDate ? daysUntil(d.expiryDate) : 0;
                const expiredRow = days < 0;
                const urgent = days >= 0 && days <= 30;
                return (
                  <tr
                    key={d.id}
                    className={cx(
                      "hover:bg-slate-50/70",
                      expiredRow ? "bg-rose-50/40" : urgent ? "bg-amber-50/40" : ""
                    )}
                  >
                    <td className="td">
                      <Link
                        href={`/hr/employees/${d.employee.id}`}
                        className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                      >
                        {d.employee.firstName} {d.employee.lastName}
                      </Link>
                      <div className="text-[11px] text-slate-400">{d.employee.employeeNumber}</div>
                    </td>
                    <td className="td font-medium text-slate-700">{d.title}</td>
                    <td className="td">
                      <Badge tone="blue">{d.category}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-600">
                      {formatDate(d.expiryDate)}
                    </td>
                    <td className="td">
                      <Badge tone={expiredRow ? "red" : urgent ? "amber" : "blue"}>
                        {expiredRow
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                          ? "Expires today"
                          : `${days}d left`}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
