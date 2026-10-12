import Link from "next/link";
import { PayslipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { PayslipRow } from "./PayslipRow";

export const dynamic = "force-dynamic";

const PAGE = 25;
const STATUSES = ["PENDING", "ISSUED", "VIEWED"];

const TONE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "blue",
  VIEWED: "green",
};

export default async function PayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; period?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(PayslipStatus, sp.status);
  const period = strParam(sp.period);

  const periods = await prisma.payslip.findMany({
    where: { organisationId },
    distinct: ["periodStart"],
    select: { periodStart: true, periodEnd: true },
    orderBy: { periodStart: "desc" },
  });

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(period ? { periodStart: new Date(period) } : {}),
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

  const [total, rows, counts, issuedNet] = await Promise.all([
    prisma.payslip.count({ where }),
    prisma.payslip.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        payRun: { select: { label: true } },
      },
    }),
    prisma.payslip.groupBy({ by: ["status"], _count: true, where: { organisationId } }),
    prisma.payslip.aggregate({
      where: { organisationId, status: { in: ["ISSUED", "VIEWED"] } },
      _sum: { netPay: true },
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = {
    q: q || undefined,
    status: sp.status || undefined,
    period: period || undefined,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Payslips
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · issue and track employee payslips
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Payslips" value={totalAll} hint="All periods" tone="indigo" />
        <StatCard
          label="Pending issue"
          value={countMap.PENDING ?? 0}
          hint="Not yet shared"
          tone={(countMap.PENDING ?? 0) ? "amber" : "emerald"}
        />
        <StatCard
          label="Viewed"
          value={countMap.VIEWED ?? 0}
          hint={`${countMap.ISSUED ?? 0} issued, awaiting view`}
          tone="emerald"
        />
        <StatCard
          label="Net issued"
          value={formatMoney(issuedNet._sum.netPay ?? 0)}
          hint="Issued + viewed net"
          tone="sky"
        />
      </div>

      {/* ── Status chips ── */}
      <div className="mt-6 flex flex-wrap gap-2">
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

      {/* ── Filters ── */}
      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="ps-q">Employee</label>
          <input
            id="ps-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or number…"
          />
        </div>
        <div className="w-56">
          <label className="label" htmlFor="ps-period">Period</label>
          <select id="ps-period" name="period" defaultValue={period} className="input">
            <option value="">All periods</option>
            {periods.map((p) => {
              const value = p.periodStart.toISOString().slice(0, 10);
              return (
                <option key={value} value={value}>
                  {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                </option>
              );
            })}
          </select>
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No payslips found"
            hint="Payslips are generated when a pay run is approved or paid."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Super</th>
                <th className="th text-right">Tax</th>
                <th className="th text-right">Net</th>
                <th className="th">Status</th>
                <th className="th">Issued</th>
                <th className="th">Viewed</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {p.employee.firstName} {p.employee.lastName}
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {p.employee.employeeNumber}
                    </span>
                  </td>
                  <td className="td text-slate-500">
                    {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                  </td>
                  <td className="td text-right tabular-nums">{formatMoney(p.grossPay)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(p.superAmount)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(p.taxAmount)}</td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(p.netPay)}
                  </td>
                  <td className="td">
                    <Badge tone={TONE[p.status] ?? "slate"}>{p.status}</Badge>
                  </td>
                  <td className="td text-slate-500">
                    {p.issuedAt ? formatDate(p.issuedAt) : "—"}
                  </td>
                  <td className="td text-slate-500">
                    {p.viewedAt ? formatDate(p.viewedAt) : "—"}
                  </td>
                  <td className="td">
                    <PayslipRow
                      payslip={{
                        id: p.id,
                        employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
                        employeeNumber: p.employee.employeeNumber,
                        payRunLabel: p.payRun.label,
                        periodStart: p.periodStart,
                        periodEnd: p.periodEnd,
                        grossPay: Number(p.grossPay),
                        superAmount: Number(p.superAmount),
                        taxAmount: Number(p.taxAmount),
                        netPay: Number(p.netPay),
                        status: p.status,
                        issuedAt: p.issuedAt,
                        viewedAt: p.viewedAt,
                      }}
                    />
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
            Page {page} of {pages} · {total} payslips
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
