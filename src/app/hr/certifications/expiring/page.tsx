import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, type ColumnPoint } from "@/components/charts";
import { formatDate, daysUntil, cx } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  EXPIRING: "amber",
  EXPIRED: "red",
};

export default async function ExpiringCertificationsPage() {
  const { organisationId } = await hrContext();

  const where = {
    employee: { organisationId },
    status: { in: ["EXPIRING", "EXPIRED"] as never[] },
  };

  const rows = await prisma.employeeCertification.findMany({
    where,
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      certification: {
        select: { id: true, name: true, issuingBody: true, isMandatory: true },
      },
    },
  });

  const expiredCount = rows.filter((r) => r.status === "EXPIRED").length;
  const expiringCount = rows.filter((r) => r.status === "EXPIRING").length;
  const mandatoryCount = rows.filter((r) => r.certification.isMandatory).length;

  let overdue = 0;
  let soon30 = 0;
  let soon60 = 0;
  for (const r of rows) {
    if (!r.expiryDate) continue;
    const days = daysUntil(r.expiryDate);
    if (days < 0) overdue++;
    else if (days <= 30) soon30++;
    else soon60++;
  }

  const points: ColumnPoint[] = [
    { label: "Expired", value: overdue, tone: "rose" },
    { label: "0–30d", value: soon30, tone: "amber" },
    { label: "31–60d", value: soon60, tone: "sky" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Expiring certifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Employee certifications marked expiring or expired, most urgent first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hr/certifications" className="btn-secondary">
            ← Catalogue
          </Link>
          <Link href="/hr/certifications/records" className="btn-primary">
            All records
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Needs attention" value={rows.length} hint="Expiring or expired" tone={rows.length ? "rose" : "emerald"} />
        <StatCard label="Expiring" value={expiringCount} hint="Renewal due soon" tone={expiringCount ? "amber" : "emerald"} />
        <StatCard label="Expired" value={expiredCount} hint="Out of compliance" tone={expiredCount ? "rose" : "emerald"} />
        <StatCard label="Mandatory" value={mandatoryCount} hint="Required certifications" tone="indigo" />
      </div>

      <div className="mt-5">
        <ChartPanel title="Urgency breakdown" subtitle="How soon these certifications lapse">
          <ColumnChart points={points} tone="rose" height={140} />
        </ChartPanel>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No expiring or expired certifications"
            hint="Certifications flagged EXPIRING or EXPIRED will appear here."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Certification</th>
                <th className="th">Issuing body</th>
                <th className="th">Status</th>
                <th className="th">Expiry</th>
                <th className="th">Days left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const days = r.expiryDate ? daysUntil(r.expiryDate) : null;
                const expiredRow = days !== null && days < 0;
                const urgent = days !== null && days >= 0 && days <= 30;
                return (
                  <tr
                    key={r.id}
                    className={cx(
                      "hover:bg-slate-50/70",
                      expiredRow ? "bg-rose-50/40" : urgent ? "bg-amber-50/40" : ""
                    )}
                  >
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
                      <div className="text-slate-700">{r.certification.name}</div>
                      {r.certification.isMandatory && (
                        <span className="text-[11px] font-medium text-violet-500">Mandatory</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{r.certification.issuingBody ?? "—"}</td>
                    <td className="td">
                      <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>{r.status}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-600">
                      {formatDate(r.expiryDate)}
                    </td>
                    <td className="td">
                      {days === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <Badge tone={expiredRow ? "red" : urgent ? "amber" : "blue"}>
                          {expiredRow ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </Badge>
                      )}
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
