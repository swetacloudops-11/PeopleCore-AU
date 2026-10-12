import { prisma } from "@/lib/prisma";
import { orgContext, strParam } from "@/lib/org";
import { formatDate } from "@/lib/format";
import ShiftForm from "./Actions";

export const dynamic = "force-dynamic";

/** Today ± n days as a calendar date (UTC midnight — how Prisma stores @db.Date). */
const D = (days: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

/** "YYYY-MM-DD" → that calendar date (UTC midnight), or the fallback. */
const pd = (value: string | undefined, fallback: Date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : fallback;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

const mondayOf = (d: Date) => {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(t).getUTCDay();
  return new Date(t - ((dow + 6) % 7) * 86400000);
};

export default async function CreateShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ roster?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const rosterId = strParam(sp.roster);
  const week = pd(sp.week, mondayOf(D(0)));

  const [rosters, employees, locations] = await Promise.all([
    prisma.roster.findMany({
      where: { organisationId },
      orderBy: { weekStart: "desc" },
      take: 20,
      select: { id: true, name: true, weekStart: true, weekEnd: true, status: true },
    }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.location.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const selected = rosters.find((r) => r.id === rosterId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Create shifts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · add a single shift, or repeat one employee across weekdays
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ShiftForm
            rosters={rosters.map((r) => ({
              id: r.id,
              name: r.name,
              weekStart: iso(new Date(r.weekStart)),
              range: `${formatDate(r.weekStart)} → ${formatDate(r.weekEnd)}`,
              status: r.status,
            }))}
            employees={employees.map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName} (${e.employeeNumber})`,
            }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            defaultRosterId={selected ? selected.id : ""}
            defaultWeek={selected ? iso(new Date(selected.weekStart)) : iso(week)}
            defaultDate={iso(selected ? new Date(selected.weekStart) : week)}
          />
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800">How it works</h2>
            <ol className="mt-2 space-y-2 text-xs leading-relaxed text-slate-500">
              <li>
                <strong className="text-slate-700">1. Pick a roster</strong> — or choose “New roster
                for a week” and we&apos;ll create it automatically.
              </li>
              <li>
                <strong className="text-slate-700">2. Choose the employee</strong> and the date (or
                several weekdays for a repeating pattern).
              </li>
              <li>
                <strong className="text-slate-700">3. Set the times</strong> — hours are calculated
                for you, minus the unpaid break.
              </li>
              <li>
                <strong className="text-slate-700">4. Publish</strong> from the Publish Rosters page
                so employees can see it.
              </li>
            </ol>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800">Quick links</h2>
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              <a href="/org/roster" className="text-indigo-600 hover:underline">
                Roster calendar →
              </a>
              <a href="/org/roster/publish" className="text-indigo-600 hover:underline">
                Publish rosters →
              </a>
              <a href="/org/roster/conflicts" className="text-indigo-600 hover:underline">
                Roster conflicts →
              </a>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800">Rosters</h2>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-500">
              {rosters.length === 0 && <li>No rosters yet — create one above.</li>}
              {rosters.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-600">{r.name}</span>
                  <span className="shrink-0 text-slate-400">{formatDate(r.weekStart)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
