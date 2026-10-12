import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate, timeAgo } from "@/lib/format";

const PAGE_SIZE = 40;

const KIND_TONE: Record<string, string> = {
  HIRE: "green",
  TERMINATION: "red",
  AUDIT: "blue",
};

const KIND_DOT: Record<string, string> = {
  HIRE: "bg-emerald-500",
  TERMINATION: "bg-rose-500",
  AUDIT: "bg-sky-500",
};

type HistoryEvent = {
  id: string;
  date: Date;
  kind: "HIRE" | "TERMINATION" | "AUDIT";
  title: string;
  detail?: string;
  employeeId?: string | null;
  employeeName?: string | null;
};

/** First day of the month `offset` months before now. */
const monthStart = (offset: number) => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - offset);
  return d;
};

export default async function EmployeeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const employeeId = strParam(sp.employee);
  const page = intParam(sp.page, 1, 500);

  const [employees, audits] = await Promise.all([
    prisma.employee.findMany({
      where: { organisationId, ...(employeeId ? { id: employeeId } : {}) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        hireDate: true,
        terminationDate: true,
        terminationReason: true,
        employmentStatus: true,
        position: { select: { title: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        organisationId,
        category: "people",
        ...(employeeId ? { entityId: employeeId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ]);

  // Needed to label audit rows and populate the employee filter when unfiltered.
  const allEmployees = employeeId
    ? await prisma.employee.findMany({
        where: { organisationId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      })
    : employees.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        employeeNumber: e.employeeNumber,
      }));

  const nameById = new Map(
    allEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`] as [string, string])
  );

  const events: HistoryEvent[] = [];
  for (const e of employees) {
    const name = `${e.firstName} ${e.lastName}`;
    events.push({
      id: `hire-${e.id}`,
      date: e.hireDate,
      kind: "HIRE",
      title: `${name} joined`,
      detail: [e.position?.title, e.department?.name].filter(Boolean).join(" · ") || undefined,
      employeeId: e.id,
      employeeName: name,
    });
    if (e.terminationDate) {
      events.push({
        id: `term-${e.id}`,
        date: e.terminationDate,
        kind: "TERMINATION",
        title: `${name} left the organisation`,
        detail: e.terminationReason ?? undefined,
        employeeId: e.id,
        employeeName: name,
      });
    }
  }
  for (const a of audits) {
    events.push({
      id: `audit-${a.id}`,
      date: a.createdAt,
      kind: "AUDIT",
      title: a.description ?? a.action,
      detail: a.action,
      employeeId: a.entityId,
      employeeName: a.entityId ? nameById.get(a.entityId) ?? null : null,
    });
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalEvents = events.length;
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEvents = events.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hires = events.filter((e) => e.kind === "HIRE");
  const terminations = events.filter((e) => e.kind === "TERMINATION");
  const twelveMonthsAgo = monthStart(11).getTime();
  const hires12m = hires.filter((e) => e.date.getTime() >= twelveMonthsAgo).length;

  const hireColumns = Array.from({ length: 8 }, (_, i) => {
    const offset = 7 - i;
    const start = monthStart(offset);
    const end = monthStart(offset - 1);
    const value = hires.filter((e) => e.date >= start && e.date < end).length;
    return { label: start.toLocaleDateString("en-AU", { month: "short" }), value };
  });

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/employees/history${qs({ employee: employeeId, page, ...overrides })}`;

  const selectedEmployee = employeeId ? nameById.get(employeeId) ?? null : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/hr/employees" className="text-xs font-medium text-sky-600 hover:underline">
            ← Back to employees
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee history
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {selectedEmployee
              ? `Employment timeline for ${selectedEmployee}.`
              : "Hires, terminations and HR activity across the workforce."}
          </p>
        </div>
        <form action="/hr/employees/history" method="get" className="flex items-center gap-2">
          <select name="employee" defaultValue={employeeId} className="input !w-56">
            <option value="">All employees</option>
            {allEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeNumber})
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Hires (12 months)"
          value={hires12m}
          hint={`${hires.length} on record`}
          tone="emerald"
        />
        <StatCard
          label="Departures"
          value={terminations.length}
          hint="Terminations on record"
          tone={terminations.length ? "rose" : "emerald"}
        />
        <StatCard
          label="HR events"
          value={events.filter((e) => e.kind === "AUDIT").length}
          hint="Logged under “people”"
          tone="sky"
        />
        <StatCard
          label="Timeline items"
          value={totalEvents}
          hint={selectedEmployee ? "For this employee" : "All employees"}
          tone="sky"
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Hires per month" subtitle="Joining dates over the last 8 months">
          <ColumnChart points={hireColumns} tone="sky" height={120} valueFormat={(v) => String(v)} />
        </ChartPanel>
        <ChartPanel title="Movement split" subtitle="Timeline composition">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Hires</span>
              <Badge tone="green">{hires.length}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Terminations</span>
              <Badge tone="red">{terminations.length}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">HR audit events</span>
              <Badge tone="blue">{events.filter((e) => e.kind === "AUDIT").length}</Badge>
            </li>
          </ul>
        </ChartPanel>
      </div>

      {/* ── Timeline ── */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Timeline</h2>
        {pageEvents.length === 0 ? (
          <EmptyState
            title="No history recorded"
            hint="Hires, terminations and HR activity will appear here as records change."
          />
        ) : (
          <>
            <div className="card divide-y divide-slate-100">
              {pageEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[ev.kind]}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{ev.title}</span>
                      <span className="text-xs text-slate-400" title={formatDate(ev.date)}>
                        {timeAgo(ev.date)}
                      </span>
                    </div>
                    {ev.detail && <p className="mt-0.5 text-xs text-slate-500">{ev.detail}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone={KIND_TONE[ev.kind] ?? "slate"}>{ev.kind}</Badge>
                      {ev.employeeId && ev.employeeName && (
                        <Link
                          href={`/hr/employees/${ev.employeeId}`}
                          className="text-[11px] font-medium text-sky-600 hover:underline"
                        >
                          {ev.employeeName}
                        </Link>
                      )}
                      <span className="text-[11px] text-slate-400">{formatDate(ev.date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalEvents)} of{" "}
                {totalEvents}
              </p>
              <div className="flex items-center gap-2">
                {safePage > 1 ? (
                  <Link href={pageHref({ page: safePage - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    ← Previous
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  Page {safePage} of {totalPages}
                </span>
                {safePage < totalPages ? (
                  <Link href={pageHref({ page: safePage + 1 })} className="btn-secondary !py-1.5 text-xs">
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
      </section>
    </div>
  );
}
