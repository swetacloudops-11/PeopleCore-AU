import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, strParam } from "@/lib/employee";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { BarList, ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";
import TimesheetSubmit from "./TimesheetSubmit";

const STATUS_CHIPS = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"] as const;

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  SUBMITTED: "amber",
  APPROVED: "green",
  REJECTED: "red",
  PAID: "purple",
};

/** Chart tones — kept separate from Badge tones (house rule). */
const STATUS_CHART: Record<string, "slate" | "amber" | "emerald" | "rose" | "sky"> = {
  DRAFT: "slate",
  SUBMITTED: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
  PAID: "sky",
};

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const { employee, org } = await employeeContext();

  const status = (strParam(sp.status) || "ALL").toUpperCase();

  const timesheets = await prisma.timesheet.findMany({
    where: { employeeId: employee.id, organisationId: org.id },
    orderBy: { periodStart: "desc" },
    include: { entries: { orderBy: { date: "asc" } } },
  });

  const rows = status === "ALL" ? timesheets : timesheets.filter((t) => t.status === status);

  const totalHours = timesheets.reduce((a, t) => a + Number(t.totalHours), 0);
  const overtimeHours = timesheets.reduce((a, t) => a + Number(t.overtimeHours), 0);
  const awaiting = timesheets.filter((t) => t.status === "SUBMITTED").length;

  const counts = new Map<string, number>();
  for (const t of timesheets) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  const segments = [...counts.entries()]
    .map(([label, value]): DonutSegment => ({ label, value, tone: STATUS_CHART[label] ?? "slate" }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <PageHeader
        title="My timesheets"
        subtitle={`${org.name} · weekly hour records for ${employee.firstName} ${employee.lastName}`}
        action={{ label: "New timesheet", href: "/employee/timesheets/new" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Timesheets" value={timesheets.length} hint="All periods on record" tone="indigo" />
        <StatCard label="Total hours" value={totalHours.toFixed(2)} hint="Across all timesheets" tone="emerald" />
        <StatCard label="Overtime hours" value={overtimeHours.toFixed(2)} hint="Above 7.6h per day" tone="amber" />
        <StatCard
          label="Awaiting approval"
          value={awaiting}
          hint={awaiting ? "Submitted, pending review" : "Nothing waiting"}
          tone="sky"
        />
      </div>

      {/* ── Charts ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Status mix" subtitle="All my timesheets">
          <Donut
            segments={segments}
            size={140}
            thickness={16}
            centerValue={timesheets.length}
            centerLabel="timesheets"
          />
        </ChartPanel>

        <ChartPanel title="Hours by period" subtitle="Most recent weeks first">
          <BarList
            items={timesheets.slice(0, 8).map((t) => ({
              label: `W/e ${formatDate(t.periodEnd)}`,
              value: Number(t.totalHours),
              hint: t.status,
            }))}
            tone="violet"
            valueFormat={(v) => `${v.toFixed(2)}h`}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      {/* ── Status filter chips ── */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {STATUS_CHIPS.map((s) => {
          const activeChip = status === s;
          return (
            <Link
              key={s}
              href={`/employee/timesheets${qs({ status: s })}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeChip
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      {/* ── Timesheet table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No timesheets found"
            hint={
              status === "ALL"
                ? "Create your first weekly timesheet to submit hours for approval."
                : "No timesheets match this status — try another filter."
            }
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Period</th>
                <th className="th">Hours</th>
                <th className="th">Overtime</th>
                <th className="th">Status</th>
                <th className="th">Entries</th>
                <th className="th">Submitted</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td whitespace-nowrap font-medium text-slate-800">
                    {formatDate(t.periodStart)} – {formatDate(t.periodEnd)}
                    {t.notes && <div className="text-[11px] text-slate-400">{t.notes}</div>}
                  </td>
                  <td className="td tabular-nums text-slate-700">{Number(t.totalHours).toFixed(2)}h</td>
                  <td className="td tabular-nums text-slate-600">
                    {Number(t.overtimeHours).toFixed(2)}h
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_BADGE[t.status] ?? "slate"}>{t.status}</Badge>
                    {t.status === "REJECTED" && t.rejectedReason && (
                      <div className="mt-1 max-w-[220px] text-[11px] leading-snug text-rose-600">
                        Reason: {t.rejectedReason}
                      </div>
                    )}
                  </td>
                  <td className="td">
                    {t.entries.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-violet-600 hover:underline">
                          {t.entries.length} {t.entries.length === 1 ? "entry" : "entries"}
                        </summary>
                        <ul className="mt-1.5 space-y-1">
                          {t.entries.slice(0, 3).map((e) => (
                            <li key={e.id} className="whitespace-nowrap text-[11px] text-slate-500">
                              {formatDate(e.date)} · {e.startTime ?? "—"}–{e.endTime ?? "—"} ·{" "}
                              {Number(e.hours).toFixed(2)}h
                            </li>
                          ))}
                          {t.entries.length > 3 && (
                            <li className="text-[11px] text-slate-400">
                              + {t.entries.length - 3} more
                            </li>
                          )}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {t.submittedAt ? formatDateTime(t.submittedAt) : "—"}
                  </td>
                  <td className="td text-right">
                    {t.status === "DRAFT" ? (
                      <TimesheetSubmit
                        id={t.id}
                        periodLabel={`${formatDate(t.periodStart)} – ${formatDate(t.periodEnd)}`}
                        totalHours={Number(t.totalHours)}
                      />
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
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
