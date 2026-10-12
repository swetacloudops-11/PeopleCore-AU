import { prisma } from "@/lib/prisma";
import { orgContext, strParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const toKey = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const parseKey = (value: string, fallback: Date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
};

const STATUS_META: Array<{ key: string; label: string; tone: string; bar: string }> = [
  { key: "PRESENT", label: "Present", tone: "green", bar: "bg-emerald-500" },
  { key: "REMOTE", label: "Remote", tone: "blue", bar: "bg-sky-500" },
  { key: "LATE", label: "Late", tone: "amber", bar: "bg-amber-500" },
  { key: "HALF_DAY", label: "Half day", tone: "amber", bar: "bg-amber-400" },
  { key: "ON_LEAVE", label: "On leave", tone: "purple", bar: "bg-violet-500" },
  { key: "ABSENT", label: "Absent", tone: "red", bar: "bg-rose-500" },
  { key: "MISSING", label: "Missing", tone: "slate", bar: "bg-slate-400" },
];

const ATTENDED = ["PRESENT", "REMOTE", "LATE", "HALF_DAY"];

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = parseKey(strParam(one(sp.from)), defaultFrom);
  const to = parseKey(strParam(one(sp.to)), today);

  const [records, departments] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { organisationId, date: { gte: from, lte: to } },
      select: {
        status: true,
        workedMinutes: true,
        overtimeMinutes: true,
        date: true,
        employee: { select: { departmentId: true } },
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const counts = new Map<string, number>();
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  for (const r of records) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    workedMinutes += r.workedMinutes;
    overtimeMinutes += r.overtimeMinutes;
  }

  const total = records.length;
  const attended = records.filter((r) => ATTENDED.includes(r.status)).length;
  const attendanceRate = total ? Math.round((attended / total) * 100) : 0;
  const workedHours = Math.round((workedMinutes / 60) * 10) / 10;
  const overtimeHours = Math.round((overtimeMinutes / 60) * 10) / 10;
  const maxCount = Math.max(1, ...STATUS_META.map((s) => counts.get(s.key) ?? 0));

  // ── Per-department breakdown ──
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const byDept = new Map<
    string,
    { records: number; attended: number; worked: number; overtime: number }
  >();
  for (const r of records) {
    const key = r.employee.departmentId ?? "none";
    const cur = byDept.get(key) ?? { records: 0, attended: 0, worked: 0, overtime: 0 };
    cur.records += 1;
    if (ATTENDED.includes(r.status)) cur.attended += 1;
    cur.worked += r.workedMinutes;
    cur.overtime += r.overtimeMinutes;
    byDept.set(key, cur);
  }
  const deptRows = [...byDept.entries()]
    .map(([id, v]) => ({
      id,
      name: id === "none" ? "Unassigned" : deptName.get(id) ?? "Unknown",
      ...v,
      rate: v.records ? Math.round((v.attended / v.records) * 100) : 0,
      hours: Math.round((v.worked / 60) * 10) / 10,
      overtime: Math.round((v.overtime / 60) * 10) / 10,
    }))
    .sort((a, b) => b.records - a.records);

  return (
    <div>
      <PageHeader
        title="Attendance Reports"
        subtitle="Day counts, worked hours and attendance rate for a date range."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Attendance rate"
          value={`${attendanceRate}%`}
          hint={`${attended}/${total} day records`}
          tone={attendanceRate >= 90 ? "emerald" : attendanceRate >= 75 ? "amber" : "rose"}
        />
        <StatCard label="Worked hours" value={workedHours} hint={`${total} records`} tone="indigo" />
        <StatCard label="Overtime hours" value={overtimeHours} hint="Recorded overtime" tone={overtimeHours ? "amber" : "emerald"} />
        <StatCard
          label="Absent + missing"
          value={(counts.get("ABSENT") ?? 0) + (counts.get("MISSING") ?? 0)}
          hint="Needs follow-up"
          tone="sky"
        />
      </div>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        method="get"
      >
        <label className="text-xs font-medium text-slate-500">Range</label>
        <input
          type="date"
          name="from"
          key={`from-${toKey(from)}`}
          defaultValue={toKey(from)}
          className="input !w-44"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          name="to"
          key={`to-${toKey(to)}`}
          defaultValue={toKey(to)}
          className="input !w-44"
        />
        <button type="submit" className="btn-secondary">
          Apply
        </button>
        <span className="ml-auto text-xs text-slate-400">
          {formatDate(from)} → {formatDate(to)}
        </span>
      </form>

      {total === 0 ? (
        <EmptyState
          title="No attendance records in this range"
          hint="Widen the date range or clock some shifts in."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Days by status</h2>
              {STATUS_META.map((s) => {
                const count = counts.get(s.key) ?? 0;
                return (
                  <div key={s.key} className="flex items-center gap-3 py-1.5">
                    <span className="w-24 shrink-0 text-xs text-slate-600">{s.label}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className={`h-full rounded ${s.bar}`}
                        style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500">
                      {count} days{" "}
                      <span className="text-slate-400">
                        ({total ? Math.round((count / total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Summary</h2>
              <dl className="divide-y divide-slate-100 text-sm">
                {[
                  ["Date range", `${formatDate(from)} → ${formatDate(to)}`],
                  ["Total day records", String(total)],
                  ["Worked hours", `${workedHours} h`],
                  ["Overtime hours", `${overtimeHours} h`],
                  ["Avg worked hours / record", total ? `${(workedHours / total).toFixed(2)} h` : "—"],
                  ["Attendance rate", `${attendanceRate}%`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium tabular-nums text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Per-department breakdown
            </h2>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Department</th>
                  <th className="th">Day records</th>
                  <th className="th">Attended</th>
                  <th className="th">Worked hours</th>
                  <th className="th">Overtime hours</th>
                  <th className="th">Attendance rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptRows.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{d.name}</td>
                    <td className="td tabular-nums text-slate-700">{d.records}</td>
                    <td className="td tabular-nums text-slate-700">{d.attended}</td>
                    <td className="td tabular-nums text-slate-700">{d.hours} h</td>
                    <td className="td tabular-nums text-slate-700">{d.overtime} h</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cx(
                              "h-full rounded-full",
                              d.rate >= 90 ? "bg-emerald-500" : d.rate >= 75 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${d.rate}%` }}
                          />
                        </div>
                        <Badge tone={d.rate >= 90 ? "green" : d.rate >= 75 ? "amber" : "red"}>
                          {d.rate}%
                        </Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </>
      )}
    </div>
  );
}
