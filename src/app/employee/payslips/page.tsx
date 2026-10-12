import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam } from "@/lib/employee";
import { Badge, StatCard, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

const PAGE_SIZE = 12;

const STATUS_TONE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "blue",
  VIEWED: "green",
};

const shortPeriod = (d: Date) =>
  new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });

export default async function MyPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId, org } = await employeeContext();
  const page = intParam(sp.page, 1, 500);
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);

  const [totalRows, slips, ytd] = await Promise.all([
    prisma.payslip.count({ where: { employeeId: employee.id, organisationId } }),
    prisma.payslip.findMany({
      where: { employeeId: employee.id, organisationId },
      orderBy: { periodEnd: "desc" },
      include: { payRun: { select: { label: true, payDate: true } } },
    }),
    prisma.payslip.findMany({
      where: { employeeId: employee.id, organisationId, periodEnd: { gte: yearStart } },
      select: { grossPay: true, taxAmount: true, superAmount: true, netPay: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const rows = slips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const latest = slips[0] ?? null;

  const ytdGross = ytd.reduce((a, s) => a + Number(s.grossPay), 0);
  const ytdTax = ytd.reduce((a, s) => a + Number(s.taxAmount), 0);

  const netPoints = slips
    .slice(0, 8)
    .reverse()
    .map((s) => ({
      label: shortPeriod(s.periodStart),
      value: Math.round(Number(s.netPay) * 100) / 100,
    }));

  const pageHref = (p: number) => `/employee/payslips${p > 1 ? qs({ page: p }) : ""}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          My payslips
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your pay from {org.name} · newest first
        </p>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Latest net pay"
          value={latest ? formatMoney(Number(latest.netPay)) : "—"}
          hint={
            latest
              ? `${latest.payRun.label} · paid ${formatDate(latest.payRun.payDate)}`
              : "No payslips yet"
          }
          tone="indigo"
        />
        <StatCard label="YTD gross" value={formatMoney(ytdGross)} hint={`${year} year to date`} tone="emerald" />
        <StatCard label="YTD tax" value={formatMoney(ytdTax)} hint={`${year} year to date`} tone="amber" />
        <StatCard label="Payslips" value={totalRows} hint="Total on record" tone="sky" />
      </div>

      {/* ── Net pay trend ── */}
      <div className="mt-6">
        <ChartPanel
          title="Net pay per period"
          subtitle="Your last 8 pay periods"
          action={
            <Link href="/employee/payroll/history" className="text-[11px] text-violet-600 hover:underline">
              Pay history →
            </Link>
          }
        >
          <ColumnChart points={netPoints} tone="violet" height={132} valueFormat={(v) => formatMoney(v)} />
        </ChartPanel>
      </div>

      {/* ── Payslip cards ── */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">All payslips</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="No payslips yet"
            hint="Your payslips will appear here once your first pay run is issued."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <article key={s.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{s.payRun.label}</h3>
                      <Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(s.periodStart)} – {formatDate(s.periodEnd)} · paid{" "}
                      {formatDate(s.payRun.payDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold text-slate-900">
                      {formatMoney(Number(s.netPay))}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Net pay</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Gross</div>
                    <div className="mt-0.5 text-sm font-medium tabular-nums text-slate-800">
                      {formatMoney(Number(s.grossPay))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Tax</div>
                    <div className="mt-0.5 text-sm font-medium tabular-nums text-slate-800">
                      {formatMoney(Number(s.taxAmount))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Super</div>
                    <div className="mt-0.5 text-sm font-medium tabular-nums text-slate-800">
                      {formatMoney(Number(s.superAmount))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {rows.length > 0 && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
            {totalRows}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            ) : (
              <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                ← Previous
              </span>
            )}
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            ) : (
              <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                Next →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
