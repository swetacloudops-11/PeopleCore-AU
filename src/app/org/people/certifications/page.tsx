import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { daysFromNow, formatDate } from "@/lib/format";
import {
  CertificationActions,
  DeleteCertificationButton,
  AssignmentActions,
  type CatalogueRow,
  type AssignmentRow,
} from "./CertificationActions";

const PAGE_SIZE = 25;
const EXPIRING_WINDOW_DAYS = 60;

const STATUS_CHIPS = ["ALL", "CURRENT", "EXPIRING", "EXPIRED", "PENDING"] as const;

const STATUS_TONE: Record<string, string> = {
  CURRENT: "green",
  EXPIRING: "amber",
  EXPIRED: "red",
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

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const q = strParam(sp.q);
  const page = intParam(sp.page, 1, 500);

  const assignmentWhere = {
    employee: { organisationId },
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
    catalogue,
    totalAssignments,
    assignments,
    employees,
    totalHolders,
    expiring,
    expired,
    mandatory,
    expiringSoon,
  ] = await Promise.all([
    prisma.certification.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    }),
    prisma.employeeCertification.count({ where: assignmentWhere }),
    prisma.employeeCertification.findMany({
      where: assignmentWhere,
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
    prisma.employeeCertification.count({ where: { employee: { organisationId } } }),
    prisma.employeeCertification.count({
      where: { employee: { organisationId }, status: "EXPIRING" },
    }),
    prisma.employeeCertification.count({
      where: { employee: { organisationId }, status: "EXPIRED" },
    }),
    prisma.certification.count({ where: { organisationId, isMandatory: true } }),
    prisma.employeeCertification.count({
      where: {
        employee: { organisationId },
        expiryDate: {
          gte: daysFromNow(0),
          lte: daysFromNow(EXPIRING_WINDOW_DAYS),
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalAssignments / PAGE_SIZE));
  const attention = expiring + expired + expiringSoon;

  const catalogueRows: CatalogueRow[] = catalogue.map((c) => ({
    id: c.id,
    name: c.name,
    issuingBody: c.issuingBody,
    description: c.description,
    validityMonths: c.validityMonths,
    isMandatory: c.isMandatory,
  }));

  const assignmentRows: AssignmentRow[] = assignments.map((a) => ({
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
    `/org/people/certifications${qs({ status, q, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Certifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track compliance certifications across your workforce.
          </p>
        </div>
        <AssignmentActions
          employees={employees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName} (${e.employeeNumber})`,
          }))}
          certifications={catalogueRows.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Certifications" value={catalogue.length} hint={`${mandatory} mandatory`} tone="indigo" />
        <StatCard label="Records" value={totalHolders} hint="Employee certifications" tone="emerald" />
        <StatCard label="Expiring soon" value={expiringSoon} hint={`Next ${EXPIRING_WINDOW_DAYS} days`} tone={expiringSoon ? "amber" : "emerald"} />
        <StatCard label="Expired" value={expired} hint="Renew before rostering" tone={expired ? "rose" : "emerald"} />
        <StatCard
          label="Needs attention"
          value={attention}
          hint="Expiring + expired + stale status"
          tone={attention ? "rose" : "emerald"}
        />
      </div>

      {attention > 0 && (
        <div className="card mt-4 flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50 px-4 py-3">
          <Badge tone="amber">{attention} NEED ATTENTION</Badge>
          <span className="text-sm text-amber-900">
            Certifications are expiring or expired — renew them to stay compliant.
          </span>
          <Link href={pageHref({ status: "EXPIRED", page: 1 })} className="btn-secondary ml-auto !py-1.5 text-xs">
            Review expired →
          </Link>
        </div>
      )}

      {/* ── (a) Catalogue ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Certification catalogue</h2>
        </div>
        {catalogueRows.length === 0 ? (
          <EmptyState
            title="No certifications defined"
            hint="Create the certifications your organisation tracks, then assign them to employees."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Certification</th>
                <th className="th">Issuing body</th>
                <th className="th">Validity</th>
                <th className="th">Mandatory</th>
                <th className="th">Holders</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {catalogue.map((c) => {
                const row = catalogueRows.find((r) => r.id === c.id)!;
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">{c.name}</div>
                      {c.description && (
                        <div className="max-w-md truncate text-[11px] text-slate-400">{c.description}</div>
                      )}
                    </td>
                    <td className="td text-slate-600">{c.issuingBody ?? "—"}</td>
                    <td className="td text-slate-600">
                      {c.validityMonths ? `${c.validityMonths} months` : "—"}
                    </td>
                    <td className="td">
                      {c.isMandatory ? <Badge tone="purple">MANDATORY</Badge> : <span className="text-slate-400">Optional</span>}
                    </td>
                    <td className="td">
                      <Badge tone={c._count.assignments > 0 ? "green" : "slate"}>
                        {c._count.assignments} {c._count.assignments === 1 ? "holder" : "holders"}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-3">
                        <CertificationActions certification={row} />
                        <DeleteCertificationButton certification={row} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ── (b) Employee certifications ── */}
      <section className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Employee certifications</h2>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-2" action="/org/people/certifications" method="get">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search employee or certification…"
                className="input !w-56 !py-1.5 text-xs"
              />
              {status !== "ALL" && <input type="hidden" name="status" value={status} />}
              <button type="submit" className="btn-secondary !py-1.5 text-xs">
                Search
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_CHIPS.map((s) => (
                <Link
                  key={s}
                  href={pageHref({ status: s, page: 1 })}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    status === s
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {assignmentRows.length === 0 ? (
          <EmptyState
            title="No employee certifications match"
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
                {assignments.map((a, i) => {
                  const shown = displayStatus(a.status, a.expiryDate);
                  const row = assignmentRows[i];
                  return (
                    <tr
                      key={a.id}
                      className={`hover:bg-slate-50/70 ${
                        shown === "EXPIRED" ? "bg-rose-50/40" : shown === "EXPIRING" ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="td">
                        <Link
                          href={`/org/people/${a.employee.id}`}
                          className="font-medium text-slate-800 hover:text-indigo-600 hover:underline"
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
                      <td className="td whitespace-nowrap text-slate-500">{formatDate(a.issuedDate)}</td>
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
                      <td className="td">
                        <AssignmentActions
                          assignment={row}
                          employees={[]}
                          certifications={[]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalAssignments)} of{" "}
                {totalAssignments}
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
      </section>
    </div>
  );
}
