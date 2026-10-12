import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";
import {
  CertificationActions,
  type AssignmentRow,
} from "../CertificationActions";

const PAGE_SIZE = 25;
const STATUS_CHIPS = ["ALL", "CURRENT", "EXPIRING", "EXPIRED", "PENDING"] as const;

const STATUS_TONE: Record<string, string> = {
  CURRENT: "green",
  EXPIRING: "amber",
  EXPIRED: "red",
  PENDING: "slate",
};

export default async function CertificationRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    employee?: string;
    certification?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const employeeId = strParam(sp.employee);
  const certificationId = strParam(sp.certification);
  const page = intParam(sp.page, 1, 500);

  const where = {
    employee: { organisationId },
    ...(status !== "ALL" ? { status: status as never } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(certificationId ? { certificationId } : {}),
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
    records,
    employees,
    catalogue,
    totalAll,
    currentCount,
    expiringCount,
    expiredCount,
    pendingCount,
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
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.certification.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employeeCertification.count({ where: { employee: { organisationId } } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "CURRENT" } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "EXPIRING" } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "EXPIRED" } }),
    prisma.employeeCertification.count({ where: { employee: { organisationId }, status: "PENDING" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: AssignmentRow[] = records.map((a) => ({
    id: a.id,
    employeeId: a.employee.id,
    employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
    certificationId: a.certification.id,
    certificationName: a.certification.name,
    status: a.status,
    issuedDate: a.issuedDate ? a.issuedDate.toISOString() : null,
    expiryDate: a.expiryDate ? a.expiryDate.toISOString() : null,
    certificateNumber: a.certificateNumber,
    notes: a.notes,
  }));

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/certifications/records${qs({
      q,
      status,
      employee: employeeId,
      certification: certificationId,
      page,
      ...overrides,
    })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Certification records
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every employee certification on record, with status and dates.
          </p>
        </div>
        <CertificationActions
          employees={employees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName} (${e.employeeNumber})`,
          }))}
          certifications={catalogue.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Records" value={totalAll} hint="All employee certifications" tone="sky" />
        <StatCard label="Current" value={currentCount} hint="In good standing" tone="emerald" />
        <StatCard label="Expiring" value={expiringCount} hint="Renewal due" tone={expiringCount ? "amber" : "emerald"} />
        <StatCard label="Expired" value={expiredCount} hint="Out of compliance" tone={expiredCount ? "rose" : "emerald"} />
        <StatCard label="Pending" value={pendingCount} hint="Awaiting issue" tone="indigo" />
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/hr/certifications/records" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search employee or certification…"
            className="input !w-56"
          />
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          {employeeId && <input type="hidden" name="employee" value={employeeId} />}
          {certificationId && <input type="hidden" name="certification" value={certificationId} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <form className="flex flex-wrap items-center gap-2" action="/hr/certifications/records" method="get">
          {q && <input type="hidden" name="q" value={q} />}
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <select name="employee" defaultValue={employeeId} className="input !w-52">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeNumber})
              </option>
            ))}
          </select>
          <select name="certification" defaultValue={certificationId} className="input !w-48">
            <option value="">All certifications</option>
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
                status === s
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No certification records match"
            hint="Assign a certification to an employee, or clear the filters."
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
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((a, i) => {
                  const row = rows[i];
                  const expiredRow = a.status === "EXPIRED";
                  const expiringRow = a.status === "EXPIRING";
                  return (
                    <tr
                      key={a.id}
                      className={cx(
                        "hover:bg-slate-50/70",
                        expiredRow ? "bg-rose-50/40" : expiringRow ? "bg-amber-50/40" : ""
                      )}
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
                        <Badge tone={STATUS_TONE[a.status] ?? "slate"}>{a.status}</Badge>
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">{formatDate(a.issuedDate)}</td>
                      <td className="td whitespace-nowrap text-slate-500">{formatDate(a.expiryDate)}</td>
                      <td className="td text-slate-600">{a.certificateNumber ?? "—"}</td>
                      <td className="td">
                        <CertificationActions assignment={row} />
                      </td>
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
