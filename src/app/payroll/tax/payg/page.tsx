import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  LODGED: "green",
  PAID: "green",
  PROCESSED: "green",
  PENDING: "amber",
};

export default async function PaygPage() {
  const { organisationId, org } = await payrollContext();

  const [records, total, lodged, pending] = await Promise.all([
    prisma.paygRecord.findMany({
      where: { organisationId },
      orderBy: [{ periodLabel: "desc" }, { createdAt: "desc" }],
      include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
    }),
    prisma.paygRecord.aggregate({ where: { organisationId }, _sum: { taxWithheld: true } }),
    prisma.paygRecord.count({ where: { organisationId, status: "LODGED" } }),
    prisma.paygRecord.count({ where: { organisationId, status: "PENDING" } }),
  ]);

  const totalWithheld = Number(total._sum.taxWithheld ?? 0);

  const byPeriod = new Map<string, number>();
  for (const r of records) {
    byPeriod.set(r.periodLabel, (byPeriod.get(r.periodLabel) ?? 0) + Number(r.taxWithheld));
  }
  const columnPoints = [...byPeriod.entries()].map(
    ([label, value]): ColumnPoint => ({ label, value })
  );

  const other = Math.max(0, records.length - lodged - pending);
  const segments = (
    [
      { label: "Lodged", value: lodged, tone: "emerald" },
      { label: "Pending", value: pending, tone: "amber" },
      { label: "Other", value: other, tone: "slate" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            PAYG withholding
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · pay-as-you-go tax withheld and lodging status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/tax/superannuation" className="btn-secondary">
            Superannuation
          </Link>
          <Link href="/payroll/tax/declarations" className="btn-secondary">
            Declarations
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Records" value={records.length} hint="PAYG entries on file" tone="amber" />
        <StatCard
          label="Total withheld"
          value={formatMoney(totalWithheld)}
          hint="Across all periods"
          tone="rose"
        />
        <StatCard label="Lodged" value={lodged} hint="Reported to the ATO" tone="emerald" />
        <StatCard
          label="Pending"
          value={pending}
          hint="Awaiting lodgement"
          tone={pending ? "amber" : "emerald"}
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Tax withheld by period" subtitle="PAYG across recorded periods">
          {columnPoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No PAYG records yet</p>
          ) : (
            <ColumnChart
              points={columnPoints}
              tone="amber"
              height={128}
              valueFormat={(v) => formatMoney(v)}
            />
          )}
        </ChartPanel>

        <ChartPanel title="Lodgement status" subtitle="Lodged vs pending records">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={records.length}
            centerLabel="records"
          />
        </ChartPanel>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {records.length === 0 ? (
          <EmptyState
            title="No PAYG records yet"
            hint="PAYG withholding records appear here once pay runs are processed."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Tax withheld</th>
                <th className="th text-right">Cumulative gross</th>
                <th className="th text-right">Cumulative tax</th>
                <th className="th">Status</th>
                <th className="th">Lodged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="font-medium text-slate-800">
                      {r.employee.firstName} {r.employee.lastName}
                    </span>
                    <div className="text-[11px] text-slate-400">{r.employee.employeeNumber}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{r.periodLabel}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(r.grossPay)}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.taxWithheld)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(r.cumulativeGross)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(r.cumulativeTax)}
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{r.status}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {r.lodgedAt ? formatDate(r.lodgedAt) : "—"}
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
