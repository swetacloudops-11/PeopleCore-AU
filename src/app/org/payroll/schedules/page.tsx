import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { NewScheduleButton, ScheduleRowActions } from "./ScheduleManager";

export const dynamic = "force-dynamic";

const PAGE = 25;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const FREQ_TONE: Record<string, string> = {
  WEEKLY: "blue",
  FORTNIGHTLY: "purple",
  MONTHLY: "slate",
};

export default async function PaySchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const active = sp.active === "INACTIVE" ? false : sp.active === "ACTIVE" ? true : undefined;

  const where = {
    organisationId,
    ...(active !== undefined ? { isActive: active } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [total, schedules, counts, activeCount, totalRuns] = await Promise.all([
    prisma.paySchedule.count({ where }),
    prisma.paySchedule.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { _count: { select: { payRuns: true } } },
    }),
    prisma.paySchedule.groupBy({ by: ["isActive"], _count: true, where: { organisationId } }),
    prisma.paySchedule.count({ where: { organisationId, isActive: true } }),
    prisma.payRun.count({ where: { organisationId } }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [String(c.isActive), c._count]));
  const totalAll = (countMap.true ?? 0) + (countMap.false ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, active: sp.active || undefined };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pay schedules
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · cadence and pay days for payroll runs
          </p>
        </div>
        <NewScheduleButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Schedules" value={totalAll} hint="All frequencies" tone="indigo" />
        <StatCard
          label="Active"
          value={activeCount}
          hint={`${totalAll - activeCount} paused`}
          tone="emerald"
        />
        <StatCard label="Pay runs linked" value={totalRuns} hint="Across all schedules" tone="sky" />
        <StatCard
          label="Cadence"
          value={schedules.some((s) => s.frequency === "WEEKLY") ? "Weekly" : "Mixed"}
          hint="Most frequent schedule"
          tone="amber"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { key: undefined, label: "All", n: totalAll },
          { key: "ACTIVE", label: "Active", n: countMap.true ?? 0 },
          { key: "INACTIVE", label: "Paused", n: countMap.false ?? 0 },
        ].map((c) => (
          <Link
            key={c.label}
            href={qs({ ...base, active: c.key, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.active ?? "ALL") === (c.key ?? "ALL")
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label} · {c.n}
          </Link>
        ))}
      </div>

      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="sch-q">Search</label>
          <input
            id="sch-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search schedules by name…"
          />
        </div>
        {sp.active && <input type="hidden" name="active" value={sp.active} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {schedules.length === 0 ? (
          <EmptyState
            title="No pay schedules yet"
            hint="Create a schedule to set the cadence for future pay runs."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Schedule</th>
                <th className="th">Frequency</th>
                <th className="th">Pay day</th>
                <th className="th">Next run</th>
                <th className="th text-right">Pay runs</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{s.name}</td>
                  <td className="td">
                    <Badge tone={FREQ_TONE[s.frequency] ?? "slate"}>{s.frequency}</Badge>
                  </td>
                  <td className="td text-slate-500">{DAYS[s.payDay] ?? s.payDay}</td>
                  <td className="td text-slate-500">
                    {s.nextRunDate ? formatDate(s.nextRunDate) : "—"}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {s._count.payRuns}
                  </td>
                  <td className="td">
                    <Badge tone={s.isActive ? "green" : "slate"}>
                      {s.isActive ? "ACTIVE" : "PAUSED"}
                    </Badge>
                  </td>
                  <td className="td">
                    <ScheduleRowActions
                      schedule={{
                        id: s.id,
                        name: s.name,
                        frequency: s.frequency,
                        payDay: s.payDay,
                        nextRunDate: s.nextRunDate
                          ? s.nextRunDate.toISOString().slice(0, 10)
                          : null,
                        isActive: s.isActive,
                        payRunCount: s._count.payRuns,
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
            Page {page} of {pages} · {total} schedules
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
