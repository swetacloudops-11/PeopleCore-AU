import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment, type Tone } from "@/components/charts";
import { formatDate, daysUntil } from "@/lib/format";

const PAGE = 25;
const WINDOW_DAYS = 60;

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

type Source = "DOCUMENT" | "CERTIFICATION" | "POLICY";

const SOURCE_LABEL: Record<Source, string> = {
  DOCUMENT: "Document",
  CERTIFICATION: "Certification",
  POLICY: "Policy",
};

const SOURCE_TONE: Record<Source, Tone> = {
  DOCUMENT: "sky",
  CERTIFICATION: "violet",
  POLICY: "amber",
};

const SOURCE_BADGE: Record<Source, string> = {
  DOCUMENT: "blue",
  CERTIFICATION: "purple",
  POLICY: "amber",
};

type Reminder = {
  key: string;
  source: Source;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  item: string;
  date: Date;
  daysLeft: number;
};

export default async function ExpiryRemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const source = ["DOCUMENT", "CERTIFICATION", "POLICY"].includes(strParam(sp.source))
    ? (strParam(sp.source) as Source)
    : undefined;
  const page = intParam(sp.page, 1, 500);
  const cutoff = D(WINDOW_DAYS);

  const [documents, certifications, acknowledgements] = await Promise.all([
    prisma.employeeDocument.findMany({
      where: { organisationId, expiryDate: { not: null, lte: cutoff } },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.employeeCertification.findMany({
      where: {
        employee: { organisationId },
        OR: [
          { expiryDate: { not: null, lte: cutoff } },
          { status: { in: ["EXPIRING", "EXPIRED"] } },
        ],
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        certification: { select: { name: true } },
      },
    }),
    prisma.policyAcknowledgement.findMany({
      where: {
        organisationId,
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { not: null, lte: cutoff },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        policy: { select: { title: true } },
      },
    }),
  ]);

  const reminders: Reminder[] = [];

  for (const d of documents) {
    if (!d.expiryDate) continue;
    reminders.push({
      key: `doc-${d.id}`,
      source: "DOCUMENT",
      employeeId: d.employee.id,
      employeeName: `${d.employee.firstName} ${d.employee.lastName}`,
      employeeNumber: d.employee.employeeNumber,
      item: d.title,
      date: d.expiryDate,
      daysLeft: daysUntil(d.expiryDate),
    });
  }

  for (const c of certifications) {
    if (!c.expiryDate) continue;
    reminders.push({
      key: `cert-${c.id}`,
      source: "CERTIFICATION",
      employeeId: c.employee.id,
      employeeName: `${c.employee.firstName} ${c.employee.lastName}`,
      employeeNumber: c.employee.employeeNumber,
      item: c.certification.name,
      date: c.expiryDate,
      daysLeft: daysUntil(c.expiryDate),
    });
  }

  for (const a of acknowledgements) {
    if (!a.dueDate) continue;
    reminders.push({
      key: `ack-${a.id}`,
      source: "POLICY",
      employeeId: a.employee.id,
      employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
      employeeNumber: a.employee.employeeNumber,
      item: a.policy.title,
      date: a.dueDate,
      daysLeft: daysUntil(a.dueDate),
    });
  }

  reminders.sort((a, b) => a.date.getTime() - b.date.getTime());

  const bySource = new Map<Source, number>();
  for (const r of reminders) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);

  const expired = reminders.filter((r) => r.daysLeft < 0).length;
  const dueSoon = reminders.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length;

  const segments: DonutSegment[] = (Object.keys(SOURCE_LABEL) as Source[])
    .map((s) => ({
      label: SOURCE_LABEL[s],
      value: bySource.get(s) ?? 0,
      tone: SOURCE_TONE[s],
    }))
    .filter((s) => s.value > 0);

  const filtered = source ? reminders.filter((r) => r.source === source) : reminders;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const base = { source: source ?? undefined };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Expiry reminders
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · documents, certifications and policy acknowledgements due within{" "}
          {WINDOW_DAYS} days
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Due or expired" value={reminders.length} hint="Within the window" tone="sky" />
        <StatCard
          label="Expired"
          value={expired}
          hint="Already past their date"
          tone={expired ? "rose" : "emerald"}
        />
        <StatCard label="Due in 30 days" value={dueSoon} hint="Coming up soon" tone="amber" />
        <StatCard
          label="Certifications"
          value={bySource.get("CERTIFICATION") ?? 0}
          hint="Expiring credentials"
          tone="indigo"
        />
      </div>

      {reminders.length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ChartPanel title="Reminders by source" subtitle="Where the expiries are coming from">
            <Donut
              segments={segments}
              size={140}
              thickness={16}
              centerValue={reminders.length}
              centerLabel="reminders"
            />
          </ChartPanel>
          <ChartPanel title="Filter" subtitle="Narrow by reminder source">
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href="/hr/notifications/expiry-reminders"
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  !source
                    ? "bg-sky-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                All · {reminders.length}
              </Link>
              {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                <Link
                  key={s}
                  href={`/hr/notifications/expiry-reminders?source=${s}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    source === s
                      ? "bg-sky-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {SOURCE_LABEL[s]} · {bySource.get(s) ?? 0}
                </Link>
              ))}
            </div>
          </ChartPanel>
        </div>
      )}

      <div className="mt-6">
        {pageRows.length === 0 ? (
          <EmptyState
            title="No upcoming expiries"
            hint="Documents, certifications and policy deadlines within the window will show here."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Source</th>
                  <th className="th">Item</th>
                  <th className="th">Date</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">
                      {r.employeeName}
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {r.employeeNumber}
                      </span>
                    </td>
                    <td className="td">
                      <Badge tone={SOURCE_BADGE[r.source]}>{SOURCE_LABEL[r.source]}</Badge>
                    </td>
                    <td className="td max-w-[20rem] truncate text-slate-600">{r.item}</td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(r.date)}</td>
                    <td className="td whitespace-nowrap">
                      {r.daysLeft < 0 ? (
                        <span className="font-medium text-rose-600">
                          Expired {Math.abs(r.daysLeft)}d ago
                        </span>
                      ) : r.daysLeft === 0 ? (
                        <span className="font-medium text-amber-600">Due today</span>
                      ) : (
                        <span
                          className={
                            r.daysLeft <= 30 ? "font-medium text-amber-600" : "text-slate-500"
                          }
                        >
                          In {r.daysLeft}d
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {pages} · {total} reminders
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={qs({ ...base, page: page - 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      ← Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link
                      href={qs({ ...base, page: page + 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
