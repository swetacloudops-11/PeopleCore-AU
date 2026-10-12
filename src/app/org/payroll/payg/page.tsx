import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { ChartPanel, ColumnChart, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 25;
const STATUSES = ["LODGED", "PENDING"];

const TONE: Record<string, string> = {
  LODGED: "green",
  PENDING: "amber",
};

export default async function PaygPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = STATUSES.includes(sp.status ?? "") ? sp.status! : undefined;

  const periods = await prisma.paygRecord.findMany({
    where: { organisationId },
    distinct: ["periodLabel"],
    select: { periodLabel: true },
    orderBy: { periodLabel: "desc" },
  });
  const period = strParam(sp.period) || periods[0]?.periodLabel || "";

  const periodScope = { organisationId, ...(period ? { periodLabel: period } : {}) };

  const where = {
    ...periodScope,
    ...(status ? { status } : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, rows, counts, totals, byPeriod] = await Promise.all([
    prisma.paygRecord.count({ where }),
    prisma.paygRecord.findMany({
      where,
      orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.paygRecord.groupBy({
      by: ["status"],
      _count: true,
      where: periodScope,
    }),
    prisma.paygRecord.aggregate({
      where: periodScope,
      _sum: { grossPay: true, taxWithheld: true, cumulativeTax: true },
    }),
    prisma.paygRecord.groupBy({
      by: ["periodLabel"],
      _sum: { taxWithheld: true },
      where: { organisationId },
      orderBy: { periodLabel: "asc" },
      take: 8,
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const outstanding = countMap.PENDING ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { period: period || undefined, q: q || undefined, status: sp.status || undefined };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          PAYG withholding
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · per-employee tax withheld and ATO lodgement status
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Withheld this period"
          value={formatMoney(totals._sum.taxWithheld ?? 0)}
          hint={period ? `Period ${period}` : "All periods"}
          tone="indigo"
        />
        <StatCard
          label="Gross this period"
          value={formatMoney(totals._sum.grossPay ?? 0)}
          hint="Before withholding"
          tone="sky"
        />
        <StatCard
          label="Outstanding"
          value={outstanding}
          hint="Records not yet lodged"
          tone={outstanding ? "amber" : "emerald"}
        />
        <StatCard
          label="Lodged"
          value={countMap.LODGED ?? 0}
          hint={`of ${totalAll} records`}
          tone="emerald"
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Lodgement status" subtitle={period ? `${period} period` : "All periods"}>
          <Donut
            segments={(
              [
                { label: "Lodged", value: countMap.LODGED ?? 0, tone: "emerald" },
                { label: "Pending", value: countMap.PENDING ?? 0, tone: "amber" },
                { label: "Failed", value: countMap.FAILED ?? 0, tone: "rose" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={132}
            thickness={16}
            centerValue={totalAll}
            centerLabel="records"
          />
        </ChartPanel>

        <ChartPanel title="Tax withheld by period" subtitle="PAYG remitted per period">
          {byPeriod.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No PAYG records yet</p>
          ) : (
            <ColumnChart
              points={byPeriod.map((p) => ({
                label: p.periodLabel,
                value: Number(p._sum.taxWithheld ?? 0),
              }))}
              tone="sky"
              height={128}
              valueFormat={(v) => `$${Math.round(v / 1000)}k`}
            />
          )}
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <form method="GET" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="label" htmlFor="payg-period">Period</label>
          <select id="payg-period" name="period" defaultValue={period} className="input">
            {periods.length === 0 && <option value="">No periods yet</option>}
            {periods.map((p) => (
              <option key={p.periodLabel} value={p.periodLabel}>
                {p.periodLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="payg-q">Employee</label>
          <input
            id="payg-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or number…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      {/* ── Status chips ── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <Link
            key={s}
            href={qs({ ...base, status: s === "ALL" ? undefined : s, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.status ?? "ALL") === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s} ·{" "}
            {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No PAYG records"
            hint="Records appear once a pay run withholds tax for a period."
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
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {r.employee.firstName} {r.employee.lastName}
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {r.employee.employeeNumber}
                    </span>
                  </td>
                  <td className="td text-slate-500">{r.periodLabel}</td>
                  <td className="td text-right tabular-nums">{formatMoney(r.grossPay)}</td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.taxWithheld)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-500">
                    {formatMoney(r.cumulativeGross)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-500">
                    {formatMoney(r.cumulativeTax)}
                  </td>
                  <td className="td">
                    <Badge tone={TONE[r.status] ?? "slate"}>{r.status}</Badge>
                  </td>
                  <td className="td text-slate-500">
                    {r.lodgedAt ? formatDate(r.lodgedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} records
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...base, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ ...base, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
