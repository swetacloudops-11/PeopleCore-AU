import Link from "next/link";
import { PayRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { ChartPanel, ColumnChart, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";
import { PayRunRowActions, NewPayRunButton } from "./Actions";

export const dynamic = "force-dynamic";

const PAGE = 25;
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "FAILED"];

const TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function PayRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(PayRunStatus, sp.status);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { label: { contains: q, mode: "insensitive" as const } },
            { notes: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows, counts, schedules, latest, paidTotal, costTrend] = await Promise.all([
    prisma.payRun.count({ where }),
    prisma.payRun.findMany({
      where,
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        paySchedule: { select: { name: true } },
        _count: { select: { lines: true, payslips: true } },
      },
    }),
    prisma.payRun.groupBy({ by: ["status"], _count: true, where: { organisationId } }),
    prisma.paySchedule.findMany({
      where: { organisationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.payRun.findFirst({
      where: { organisationId },
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
      select: {
        label: true,
        periodStart: true,
        periodEnd: true,
        grossPay: true,
        netPay: true,
      },
    }),
    prisma.payRun.aggregate({
      where: { organisationId, status: "PAID" },
      _sum: { netPay: true, grossPay: true },
      _count: true,
    }),
    prisma.payRun.findMany({
      where: { organisationId, status: { in: ["APPROVED", "PAID"] } },
      orderBy: { payDate: "asc" },
      take: 8,
      select: { payDate: true, grossPay: true },
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, status: sp.status || undefined };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pay runs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {totalAll} run{totalAll === 1 ? "" : "s"} across all periods
          </p>
        </div>
        <NewPayRunButton schedules={schedules} />
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="This period gross"
          value={latest ? formatMoney(latest.grossPay) : "—"}
          hint={latest ? latest.label : "No pay runs yet"}
          tone="indigo"
        />
        <StatCard
          label="This period net"
          value={latest ? formatMoney(latest.netPay) : "—"}
          hint={latest ? `Paid ${formatDate(latest.periodEnd)}` : "No pay runs yet"}
          tone="sky"
        />
        <StatCard
          label="Pending approval"
          value={countMap.PENDING_APPROVAL ?? 0}
          hint="Waiting on an approver"
          tone={(countMap.PENDING_APPROVAL ?? 0) ? "amber" : "emerald"}
        />
        <StatCard
          label="Paid to date"
          value={formatMoney(paidTotal._sum.netPay ?? 0)}
          hint={`${paidTotal._count} paid run${paidTotal._count === 1 ? "" : "s"}`}
          tone="emerald"
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel
          title="Payroll cost trend"
          subtitle="Gross pay across approved & paid runs"
          action={
            <Link href="/org/payroll/reports" className="text-[11px] text-indigo-600 hover:underline">
              Reports →
            </Link>
          }
        >
          {costTrend.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No completed runs yet</p>
          ) : (
            <ColumnChart
              points={costTrend.map((r) => ({
                label: r.payDate.toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
                value: Number(r.grossPay),
              }))}
              tone="emerald"
              height={128}
              valueFormat={(v) => `$${Math.round(v / 1000)}k`}
            />
          )}
        </ChartPanel>

        <ChartPanel title="Runs by status" subtitle="Lifecycle of every pay run">
          <Donut
            segments={(
              [
                { label: "Draft", value: countMap.DRAFT ?? 0, tone: "sky" },
                { label: "Awaiting approval", value: countMap.PENDING_APPROVAL ?? 0, tone: "amber" },
                { label: "Approved", value: countMap.APPROVED ?? 0, tone: "violet" },
                { label: "Paid", value: countMap.PAID ?? 0, tone: "emerald" },
                { label: "Failed", value: countMap.FAILED ?? 0, tone: "rose" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={136}
            thickness={16}
            centerValue={totalAll}
            centerLabel="pay runs"
          />
        </ChartPanel>
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
            {s === "ALL" ? "All" : s.replace("_", " ")} ·{" "}
            {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      {/* ── Search ── */}
      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="prun-q">Search</label>
          <input
            id="prun-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by label or notes…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No pay runs found"
            hint="Clear the filters or create a new draft pay run to get started."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Pay run</th>
                <th className="th">Period</th>
                <th className="th">Pay date</th>
                <th className="th">Staff</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Super</th>
                <th className="th text-right">Tax</th>
                <th className="th text-right">Net</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/org/payroll/pay-runs/${r.id}`}
                      className="font-medium text-slate-800 hover:text-indigo-600 hover:underline"
                    >
                      {r.label}
                    </Link>
                    <div className="text-[11px] text-slate-400">
                      {r.paySchedule?.name ?? "No schedule"} ·{" "}
                      {r._count.lines} line{r._count.lines === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="td text-slate-500">
                    {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                  </td>
                  <td className="td text-slate-500">{formatDate(r.payDate)}</td>
                  <td className="td text-slate-600">{r.employeeCount}</td>
                  <td className="td text-right tabular-nums">{formatMoney(r.grossPay)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(r.superAmount)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(r.taxAmount)}</td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.netPay)}
                  </td>
                  <td className="td">
                    <Badge tone={TONE[r.status] ?? "slate"}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/org/payroll/pay-runs/${r.id}`}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        View
                      </Link>
                      <PayRunRowActions run={{ id: r.id, label: r.label, status: r.status }} />
                    </div>
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
            Page {page} of {pages} · {total} runs
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
