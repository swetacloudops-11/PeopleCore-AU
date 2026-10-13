import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam, strParam } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment, type Tone } from "@/components/charts";
import { formatDate } from "@/lib/format";
import { TimesheetActions } from "./TimesheetActions";

const PAGE_SIZE = 25;

const STATUS_CHIPS = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"] as const;

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  SUBMITTED: "amber",
  APPROVED: "blue",
  REJECTED: "red",
  PAID: "green",
};

const STATUS_CHART: Record<string, Tone> = {
  DRAFT: "slate",
  SUBMITTED: "amber",
  APPROVED: "sky",
  REJECTED: "rose",
  PAID: "emerald",
};

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const page = intParam(sp.page, 1, 500);
  const validStatus = (STATUS_CHIPS as readonly string[]).includes(status) ? status : "ALL";

  const where: Prisma.TimesheetWhereInput = {
    organisationId,
    ...(validStatus !== "ALL" ? { status: validStatus as never } : {}),
  };

  const [total, draft, submitted, approved, totalRows, rows, statusGroups] = await Promise.all([
    prisma.timesheet.count({ where: { organisationId } }),
    prisma.timesheet.count({ where: { organisationId, status: "DRAFT" } }),
    prisma.timesheet.count({ where: { organisationId, status: "SUBMITTED" } }),
    prisma.timesheet.count({ where: { organisationId, status: "APPROVED" } }),
    prisma.timesheet.count({ where }),
    prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.timesheet.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
  ]);

  const segments = (
    statusGroups
      .map((s) => ({
        label: s.status.charAt(0) + s.status.slice(1).toLowerCase(),
        value: s._count,
        tone: STATUS_CHART[s.status] ?? "slate",
      }))
      .sort((a, b) => b.value - a.value) as DonutSegment[]
  ).filter((s) => s.value > 0);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/payroll/timesheets${qs({ status: validStatus, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            All timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {total} timesheets across all employees
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/timesheets/pending" className="btn-secondary">
            Pending
          </Link>
          <Link href="/payroll/timesheets/variances" className="btn-secondary">
            Variances
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={total} hint="All timesheets" tone="amber" />
        <StatCard label="Draft" value={draft} hint="Not yet submitted" tone="indigo" />
        <StatCard
          label="Submitted"
          value={submitted}
          hint="Awaiting approval"
          tone={submitted ? "amber" : "emerald"}
        />
        <StatCard label="Approved" value={approved} hint="Ready for payroll" tone="emerald" />
      </div>

      {/* ── Status donut ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <ChartPanel title="Timesheets by status" subtitle="Every timesheet on record">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={total}
            centerLabel="timesheets"
          />
        </ChartPanel>

        <div className="md:col-span-2">
          <div className="mb-2 text-sm font-semibold text-slate-800">Filter by status</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((s) => {
              const activeChip = validStatus === s;
              return (
                <Link
                  key={s}
                  href={pageHref({ status: s, page: 1 })}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeChip
                      ? "bg-amber-500 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No timesheets match this filter"
            hint="Try another status, or wait for employees to submit their hours."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Period</th>
                  <th className="th text-right">Total hours</th>
                  <th className="th text-right">Overtime</th>
                  <th className="th">Status</th>
                  <th className="th">Submitted</th>
                  <th className="th">Approved</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <span className="font-medium text-slate-800">
                        {t.employee.firstName} {t.employee.lastName}
                      </span>
                      <div className="text-[11px] text-slate-400">{t.employee.employeeNumber}</div>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDate(t.periodStart)} → {formatDate(t.periodEnd)}
                    </td>
                    <td className="td text-right font-medium tabular-nums text-slate-800">
                      {Number(t.totalHours).toFixed(2)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {Number(t.overtimeHours).toFixed(2)}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_BADGE[t.status] ?? "slate"}>
                        {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                      </Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {t.submittedAt ? formatDate(t.submittedAt) : "—"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {t.approvedAt ? formatDate(t.approvedAt) : "—"}
                    </td>
                    <td className="td">
                      {t.status === "SUBMITTED" ? (
                        <TimesheetActions
                          timesheet={{
                            id: t.id,
                            label: `${t.employee.firstName} ${t.employee.lastName} · ${formatDate(
                              t.periodStart
                            )} → ${formatDate(t.periodEnd)}`,
                          }}
                        />
                      ) : (
                        <span className="block text-right text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
                {validStatus !== "ALL" ? " (filtered)" : ""}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
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
                  <Link href={pageHref({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
