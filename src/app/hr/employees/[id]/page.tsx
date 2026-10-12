import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, initials, isPast, timeAgo } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green",
  PROBATION: "blue",
  CASUAL: "purple",
  CONTRACT: "amber",
  LEAVE: "blue",
  TERMINATED: "red",
};

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CASUAL: "Casual",
  CONTRACT: "Contract",
};

const CERT_TONE: Record<string, string> = {
  CURRENT: "green",
  EXPIRING: "amber",
  EXPIRED: "red",
  PENDING: "slate",
};

const GENDER_LABEL: Record<string, string> = {
  FEMALE: "Female",
  MALE: "Male",
  NON_BINARY: "Non-binary",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}

function SectionCard({
  title,
  count,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  count?: number;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {title}
          {count !== undefined && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {count}
            </span>
          )}
        </h3>
        {href && hrefLabel && (
          <Link href={href} className="text-xs font-medium text-sky-600 hover:underline">
            {hrefLabel} →
          </Link>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organisationId } = await hrContext();

  // Scoped fetch — a record from another tenant 404s here.
  const employee = await prisma.employee.findFirst({
    where: { id, organisationId },
    include: {
      department: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      position: { select: { id: true, title: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
      _count: {
        select: {
          reports: true,
          documents: true,
          certifications: true,
          leaveRequests: true,
          onboardingTasks: true,
        },
      },
    },
  });
  if (!employee) notFound();

  const eid = employee.id;

  const [documents, certifications, reports, recentAudit] = await Promise.all([
    prisma.employeeDocument.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.employeeCertification.findMany({
      where: { employee: { id: eid, organisationId } },
      include: { certification: { select: { name: true, issuingBody: true } } },
      orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
    }),
    prisma.employee.findMany({
      where: { organisationId, managerId: eid },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employmentStatus: true },
    }),
    prisma.auditLog.findMany({
      where: { organisationId, category: "people", entityId: eid },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const docsHref = `/hr/employees/documents?employee=${eid}`;
  const certsHref = `/hr/employees/certifications?employee=${eid}`;

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link href="/hr/employees" className="text-xs font-medium text-sky-600 hover:underline">
          ← Back to employees
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-sky-100 text-base font-semibold text-sky-600">
              {initials(fullName)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                  {fullName}
                </h1>
                <Badge tone={STATUS_TONE[employee.employmentStatus] ?? "slate"}>
                  {employee.employmentStatus}
                </Badge>
                <Badge tone="slate">
                  {TYPE_LABEL[employee.employmentType] ?? employee.employmentType}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {employee.employeeNumber} · {employee.position?.title ?? "No position"} ·{" "}
                {employee.department?.name ?? "No department"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={docsHref} className="btn-secondary">
              Documents
            </Link>
            <Link href={certsHref} className="btn-secondary">
              Certifications
            </Link>
            <Link
              href={`/hr/employees/history?employee=${eid}`}
              className="btn-secondary"
            >
              History
            </Link>
          </div>
        </div>

        {employee.employmentStatus === "TERMINATED" && (
          <div className="card mt-4 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span className="font-semibold">Terminated {formatDate(employee.terminationDate)}</span>
            {employee.terminationReason && <> — {employee.terminationReason}</>}
          </div>
        )}
      </div>

      {/* ── Profile details ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Personal details</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Employee #" value={employee.employeeNumber} />
            <Info label="Preferred name" value={employee.preferredName} />
            <Info label="Date of birth" value={formatDate(employee.dateOfBirth)} />
            <Info label="Gender" value={GENDER_LABEL[employee.gender ?? ""] ?? "—"} />
            <Info label="Tax file number" value={employee.taxFileNumber} />
            <Info label="Record created" value={timeAgo(employee.createdAt)} />
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Employment details</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info
              label="Position"
              value={employee.position ? employee.position.title : "—"}
            />
            <Info label="Hire date" value={formatDate(employee.hireDate)} />
            <Info label="Department" value={employee.department?.name ?? "—"} />
            <Info label="Probation end" value={formatDate(employee.probationEndDate)} />
            <Info label="Team" value={employee.team?.name ?? "—"} />
            <Info label="Location" value={employee.location?.name ?? "—"} />
            <Info
              label="Manager"
              value={
                employee.manager ? (
                  <Link
                    href={`/hr/employees/${employee.manager.id}`}
                    className="text-sky-600 hover:underline"
                  >
                    {employee.manager.firstName} {employee.manager.lastName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Info label="Direct reports" value={employee._count.reports} />
            {employee.employmentStatus === "TERMINATED" && (
              <>
                <Info label="Termination date" value={formatDate(employee.terminationDate)} />
                <Info label="Reason" value={employee.terminationReason} />
              </>
            )}
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Contact</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Work email" value={employee.workEmail} />
            <Info label="Personal email" value={employee.personalEmail} />
            <Info label="Phone" value={employee.phone} />
          </dl>
          <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-800">Emergency contact</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Name" value={employee.emergencyContactName} />
            <Info label="Phone" value={employee.emergencyContactPhone} />
          </dl>
        </div>
      </div>

      {/* ── Pay & super ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Pay &amp; hours</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Salary type" value={employee.salaryType} />
            <Info
              label={employee.salaryType === "HOURLY" ? "Hourly rate" : "Base salary"}
              value={
                employee.salaryType === "HOURLY"
                  ? formatMoney(employee.hourlyRate)
                  : `${formatMoney(employee.baseSalary)} p.a.`
              }
            />
            <Info label="Hours / week" value={String(Number(employee.standardHoursPerWeek))} />
          </dl>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Superannuation</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Fund" value={employee.superFundName} />
            <Info label="Member number" value={employee.superMemberNumber} />
          </dl>
        </div>
        <SectionCard title="Activity">
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <dt className="text-slate-500">Record created</dt>
              <dd>{timeAgo(employee.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Last updated</dt>
              <dd>{formatDateTime(employee.updatedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Leave requests</dt>
              <dd>{employee._count.leaveRequests}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Open HR tasks</dt>
              <dd>{employee._count.onboardingTasks}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      {employee.notes && (
        <div className="card mt-4 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{employee.notes}</p>
        </div>
      )}

      {/* ── Records ── */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">Records on file</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Documents"
          count={employee._count.documents}
          href={docsHref}
          hrefLabel="View all"
        >
          {documents.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">
              No documents on file.{" "}
              <Link href="/hr/documents/upload" className="text-sky-600 hover:underline">
                Upload one →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {documents.map((d) => {
                const expired = isPast(d.expiryDate);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <span className="text-sm text-slate-700">{d.title}</span>
                      <span className="block text-xs text-slate-400">
                        {d.category} · {d.fileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {d.isConfidential && <Badge tone="purple">🔒</Badge>}
                      {d.expiryDate && (
                        <Badge tone={expired ? "red" : "amber"}>
                          {expired ? "Expired " : "Exp. "}
                          {formatDate(d.expiryDate)}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Certifications"
          count={employee._count.certifications}
          href={certsHref}
          hrefLabel="View all"
        >
          {certifications.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">
              No certifications recorded.{" "}
              <Link href="/hr/certifications/records" className="text-sky-600 hover:underline">
                Assign one →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {certifications.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span className="text-sm text-slate-700">{c.certification.name}</span>
                    <span className="block text-xs text-slate-400">
                      {c.certification.issuingBody ?? "—"}
                      {c.expiryDate && ` · expires ${formatDate(c.expiryDate)}`}
                    </span>
                  </div>
                  <Badge tone={CERT_TONE[c.status] ?? "slate"}>{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Direct reports"
          count={reports.length}
        >
          {reports.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No direct reports.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <Link
                    href={`/hr/employees/${r.id}`}
                    className="text-sm font-medium text-slate-700 hover:text-sky-600 hover:underline"
                  >
                    {r.firstName} {r.lastName}
                  </Link>
                  <Badge tone={STATUS_TONE[r.employmentStatus] ?? "slate"}>
                    {r.employmentStatus}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent HR activity">
          {recentAudit.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No recorded HR activity.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentAudit.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] font-medium text-slate-600">{a.action}</code>
                    <span className="text-[11px] text-slate-400">{timeAgo(a.createdAt)}</span>
                  </div>
                  {a.description && (
                    <p className="mt-0.5 text-xs text-slate-500">{a.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
