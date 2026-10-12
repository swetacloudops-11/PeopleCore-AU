import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { daysFromNow, formatDate } from "@/lib/format";

const PAGE_SIZE = 25;
const EXPIRING_WINDOW_DAYS = 60;

const STATUS_CHIPS = ["ALL", "CURRENT", "EXPIRING", "EXPIRED", "PENDING"] as const;

const STATUS_TONE: Record<string, string> = {
  CURRENT: "green",
  EXPIRING: "amber",
  EXPIRED: "red",
  PENDING: "slate",
};

const STATUS_CHART: Record<string, "emerald" | "amber" | "rose" | "slate"> = {
  CURRENT: "emerald",
  EXPIRING: "amber",
  EXPIRED: "rose",
  PENDING: "slate",
};

/** Stored status can be stale — derive what to show from the expiry date. */
function displayStatus(stored: string, expiryDate: Date | null): string {
  if (stored === "PENDING") return "PENDING";
  if (!expiryDate) return stored;
  const now = new Date();
  if (expiryDate.getTime() < now.getTime()) return "EXPIRED";
  const soon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000);
  if (expiryDate.getTime() <= soon.getTime()) return "EXPIRING";
  return "CURRENT";
}

export default async function EmployeeCertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; employee?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const employeeId = strParam(sp.employee);
  const page = intParam(sp.page, 1, 500);

  const where = {
    employee: { organisationId },
    ...(employeeId ? { employeeId } : {}),
    ...(status !== "ALL" ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { employee: { firstName: { contains: q, mode: "insensitive" as const } } },
            { employee: { lastName: { contains: q, mode: "insensitive" as const } } },
            { certification: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [
    total,
    assignments,
    employees,
    totalRecords,
    current,
    expiring,
    expired,
    pending,
    byStatus,
  ] = await Promise.all([
    prisma.employeeCertification.count({ where }),
    prisma.employeeCertification.findMany({
      where,
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        certification: { select: { id: true, name: true, isMandatory: true } },
      },
    }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.employeeCertification.count({ where: { employee: { organisationId } } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "CURRENT" } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "EXPIRING" } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "EXPIRED" } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "PENDING" } }),
    prisma.employeeCertification.groupBy({
      by: ["status"],
      where: { employee: { organisationId } },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const attention = expiring + expired;
  const soon = await prisma.employeeCertification.count({
    where: {
      employee: { organisationId },
      expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
    },
  });

  const segments = byStatus
    .map((s) => ({
      label: s.status,
      value: s._count,
      tone: STATUS_CHART[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value) as DonutSegment[];

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/employees/certifications${qs({ q, status, employee: employeeId, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/hr/employees" className="text-xs font-medium text-sky-600 hover:underline">
            ← Back to employees
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Certifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Per-employee certification records and compliance status.
          </p>
        </div>
        <Link href="/hr/certifications/records" className="btn-primary">
          + Manage records
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Records" value={totalRecords} hint="Employee certifications" tone="sky" />
        <StatCard label="Current" value={current} hint="In date" tone="emerald" />
        <StatCard
          label="Expiring"
          value={expiring}
          hint={`${soon} due in ${EXPIRING_WINDOW_DAYS} days`}
          tone={expiring ? "amber" : "emerald"}
        />
        <StatCard label="Expired" value={expired} hint="Renew before rostering" tone={expired ? "rose" : "emerald"} />
        <StatCard label="Pending" value={pending} hint="Awaiting evidence" tone={pending ? "amber" : "emerald"} />
      </div>

      {attention > 0 && (
        <div className="card mt-4 flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50 px-4 py-3">
          <Badge tone="amber">{attention} NEED ATTENTION</Badge>
          <span className="text-sm text-amber-900">
            Certifications are expiring or expired — renew them to stay compliant.
          </span>
          <Link
            href={pageHref({ status: "EXPIRED", page: 1 })}
            className="btn-secondary ml-auto !py-1.5 text-xs"
          >
            Review expired →
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Status breakdown" subtitle="All employee certification records">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={totalRecords}
            centerLabel="records"
          />
        </ChartPanel>
        <ChartPanel title="Compliance watchlist" subtitle="What needs action next">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Expiring in {EXPIRING_WINDOW_DAYS} days</span>
              <Badge tone={soon ? "amber" : "slate"}>{soon}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Expired records</span>
              <Badge tone={expired ? "red" : "slate"}>{expired}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Pending verification</span>
              <Badge tone="slate">{pending}</Badge>
            </li>
            <li className="pt-2">
              <Link
                href="/hr/certifications/expiring"
                className="text-xs font-medium text-sky-600 hover:underline"
              >
                Open the expiring report →
              </Link>
            </li>
          </ul>
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/hr/employees/certifications" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search employee or certification…"
            className="input !w-64"
          />
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          {employeeId && <input type="hidden" name="employee" value={employeeId} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
        <form action="/hr/employees/certifications" method="get" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <select name="employee" defaultValue={employeeId} className="input !w-56">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeNumber})
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        <div className="ml-auto flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((s) => (
            <Link
              key={s}
              href={pageHref({ status: s, page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                status === s ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {assignments.length === 0 ? (
          <EmptyState
            title="No certifications match these filters"
            hint="Assign a certification to an employee, or clear the search and status filters."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Certification</th>
                  <th className="th">Status</th>
                  <th className="th">Issued</th>
                  <th className="th">Expires</th>
                  <th className="th">Certificate #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((a) => {
                  const shown = displayStatus(a.status, a.expiryDate);
                  return (
                    <tr
                      key={a.id}
                      className={`hover:bg-slate-50/70 ${
                        shown === "EXPIRED"
                          ? "bg-rose-50/40"
                          : shown === "EXPIRING"
                          ? "bg-amber-50/40"
                          : ""
                      }`}
                    >
                      <td className="td">
                        <Link
                          href={`/hr/employees/${a.employee.id}`}
                          className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                        >
                          {a.employee.firstName} {a.employee.lastName}
                        </Link>
                        <div className="text-[11px] text-slate-400">{a.employee.employeeNumber}</div>
                      </td>
                      <td className="td">
                        <div className="text-slate-700">{a.certification.name}</div>
                        {a.certification.isMandatory && (
                          <span className="text-[11px] font-medium text-violet-500">Mandatory</span>
                        )}
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_TONE[shown] ?? "slate"}>{shown}</Badge>
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">
                        {formatDate(a.issuedDate)}
                      </td>
                      <td className="td whitespace-nowrap">
                        {a.expiryDate ? (
                          <span
                            className={
                              shown === "EXPIRED"
                                ? "font-medium text-rose-700"
                                : shown === "EXPIRING"
                                ? "font-medium text-amber-700"
                                : "text-slate-500"
                            }
                          >
                            {formatDate(a.expiryDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="td text-slate-600">{a.certificateNumber ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
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
