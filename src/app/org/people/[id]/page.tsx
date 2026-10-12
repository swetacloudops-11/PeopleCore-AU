import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, initials, isPast, timeAgo } from "@/lib/format";
import { DetailActions } from "./Actions";
import type { EmployeeRow } from "../EmployeeForm";

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
          <Link href={href} className="text-xs font-medium text-indigo-600 hover:underline">
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
  const { organisationId } = await orgContext();

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
          attendance: true,
          leaveRequests: true,
          shifts: true,
          payslips: true,
          reviews: true,
        },
      },
    },
  });
  if (!employee) notFound();

  const eid = employee.id;

  const [
    recentAttendance,
    recentLeave,
    recentShifts,
    recentPayslips,
    recentReviews,
    recentDocuments,
    certifications,
    departments,
    teams,
    locations,
    positions,
    managers,
  ] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.leaveRequest.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { appliedAt: "desc" },
      take: 5,
      include: { leaveType: { select: { name: true, colour: true } } },
    }),
    prisma.shift.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { date: "desc" },
      take: 5,
      include: { location: { select: { name: true } } },
    }),
    prisma.payslip.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { periodEnd: "desc" },
      take: 5,
    }),
    prisma.review.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { reviewer: { select: { firstName: true, lastName: true } } },
    }),
    prisma.employeeDocument.findMany({
      where: { organisationId, employeeId: eid },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.employeeCertification.findMany({
      where: { employee: { id: eid, organisationId } },
      include: { certification: { select: { name: true, issuingBody: true } } },
      orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
    }),
    prisma.department.findMany({ where: { organisationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({ where: { organisationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { organisationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.position.findMany({ where: { organisationId }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" }, id: { not: eid } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  // Plain serialisable shape for the client actions (Decimals → Number).
  const row: EmployeeRow = {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName,
    workEmail: employee.workEmail,
    personalEmail: employee.personalEmail,
    phone: employee.phone,
    employmentStatus: employee.employmentStatus,
    employmentType: employee.employmentType,
    hireDate: employee.hireDate.toISOString(),
    probationEndDate: employee.probationEndDate ? employee.probationEndDate.toISOString() : null,
    departmentId: employee.departmentId,
    teamId: employee.teamId,
    locationId: employee.locationId,
    positionId: employee.positionId,
    managerId: employee.managerId,
    salaryType: employee.salaryType,
    baseSalary: Number(employee.baseSalary),
    hourlyRate: Number(employee.hourlyRate),
    standardHoursPerWeek: Number(employee.standardHoursPerWeek),
    superFundName: employee.superFundName,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    notes: employee.notes,
  };

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link href="/org/people" className="text-xs font-medium text-indigo-600 hover:underline">
          ← Back to people
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-indigo-100 text-base font-semibold text-indigo-600">
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
                <Badge tone="slate">{TYPE_LABEL[employee.employmentType] ?? employee.employmentType}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {employee.employeeNumber} · {employee.position?.title ?? "No position"} ·{" "}
                {employee.department?.name ?? "No department"}
              </p>
            </div>
          </div>
          <DetailActions employee={row} options={{ departments, teams, locations, positions: positions.map((p) => ({ id: p.id, name: p.title })), managers: managers.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` })) }} />
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
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Identity</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Employee #" value={employee.employeeNumber} />
            <Info label="Preferred name" value={employee.preferredName} />
            <Info label="Work email" value={employee.workEmail} />
            <Info label="Personal email" value={employee.personalEmail} />
            <Info label="Phone" value={employee.phone} />
            <Info label="Date of birth" value={formatDate(employee.dateOfBirth)} />
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Job &amp; organisation</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info
              label="Position"
              value={
                employee.position ? (
                  <Link href={`/org/people/positions`} className="text-indigo-600 hover:underline">
                    {employee.position.title}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Info label="Hire date" value={formatDate(employee.hireDate)} />
            <Info
              label="Department"
              value={
                <Link href={`/org/people/departments`} className="text-indigo-600 hover:underline">
                  {employee.department?.name ?? "—"}
                </Link>
              }
            />
            <Info label="Probation end" value={formatDate(employee.probationEndDate)} />
            <Info
              label="Team"
              value={
                <Link href={`/org/people/teams`} className="text-indigo-600 hover:underline">
                  {employee.team?.name ?? "—"}
                </Link>
              }
            />
            <Info
              label="Location"
              value={
                <Link href={`/org/people/locations`} className="text-indigo-600 hover:underline">
                  {employee.location?.name ?? "—"}
                </Link>
              }
            />
            <Info
              label="Manager"
              value={
                employee.manager ? (
                  <Link
                    href={`/org/people/${employee.manager.id}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {employee.manager.firstName} {employee.manager.lastName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Info label="Direct reports" value={employee._count.reports} />
          </dl>
        </div>

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
            <Info label="Super fund" value={employee.superFundName} />
          </dl>
          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-800">Emergency contact</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Name" value={employee.emergencyContactName} />
            <Info label="Phone" value={employee.emergencyContactPhone} />
          </dl>
        </div>
      </div>

      {employee.notes && (
        <div className="card mt-4 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{employee.notes}</p>
        </div>
      )}

      {/* ── Activity & records ── */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">Activity &amp; records</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Attendance"
          count={employee._count.attendance}
          href={`/org/time/attendance?employee=${eid}`}
          hrefLabel="View all"
        >
          {recentAttendance.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No attendance records yet.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentAttendance.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-slate-700">{formatDate(a.date)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {Math.floor(a.workedMinutes / 60)}h {a.workedMinutes % 60}m
                    </span>
                    <Badge tone={a.status === "PRESENT" ? "green" : a.status === "ABSENT" ? "red" : "amber"}>
                      {a.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Leave"
          count={employee._count.leaveRequests}
          href={`/org/time/leave?employee=${eid}`}
          hrefLabel="View all"
        >
          {recentLeave.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No leave requests yet.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentLeave.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `${l.leaveType.colour}1a`, color: l.leaveType.colour }}
                    >
                      {l.leaveType.name}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {formatDate(l.startDate)} → {formatDate(l.endDate)}
                    </span>
                  </div>
                  <Badge
                    tone={
                      l.status === "APPROVED" ? "green" : l.status === "PENDING" ? "amber" : "slate"
                    }
                  >
                    {l.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Shifts"
          count={employee._count.shifts}
          href={`/org/roster?employee=${eid}`}
          hrefLabel="View roster"
        >
          {recentShifts.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No shifts scheduled.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentShifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-slate-700">
                    {formatDate(s.date)} · {s.startTime}–{s.endTime}
                    {s.location && <span className="text-xs text-slate-400"> · {s.location.name}</span>}
                  </span>
                  <Badge tone={s.status === "COMPLETED" ? "green" : s.status === "MISSED" ? "red" : "blue"}>
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Payslips"
          count={employee._count.payslips}
          href={`/org/payroll/payslips?employee=${eid}`}
          hrefLabel="View all"
        >
          {recentPayslips.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No payslips issued yet.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentPayslips.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-slate-700">
                    {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{formatMoney(p.netPay)}</span>
                    <Badge tone={p.status === "ISSUED" || p.status === "VIEWED" ? "green" : "amber"}>
                      {p.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Reviews"
          count={employee._count.reviews}
          href={`/org/performance/reviews?employee=${eid}`}
          hrefLabel="View all"
        >
          {recentReviews.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No performance reviews yet.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentReviews.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span className="text-sm text-slate-700">{r.title}</span>
                    <span className="block text-xs text-slate-400">
                      {r.type} · due {formatDate(r.dueDate)}
                      {r.reviewer && ` · ${r.reviewer.firstName} ${r.reviewer.lastName}`}
                    </span>
                  </div>
                  <Badge tone={r.status === "COMPLETED" ? "green" : r.status === "IN_PROGRESS" ? "amber" : "slate"}>
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Documents"
          count={employee._count.documents}
          href={`/org/people/documents?q=${encodeURIComponent(fullName)}`}
          hrefLabel="Manage"
        >
          {recentDocuments.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No documents on file.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentDocuments.map((d) => {
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
                      {d.expiryDate && <Badge tone={expired ? "red" : "amber"}>Exp. {formatDate(d.expiryDate)}</Badge>}
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
          href={`/org/people/certifications?q=${encodeURIComponent(fullName)}`}
          hrefLabel="Manage"
        >
          {certifications.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No certifications recorded.</p>
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
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
