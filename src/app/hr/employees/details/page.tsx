import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, strParam } from "@/lib/hr";
import { Badge, EmptyState } from "@/components/ui";
import { formatDate, formatMoney, initials, isPast } from "@/lib/format";

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

export default async function EmployeeDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; employee?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const employeeId = strParam(sp.employee);

  const listWhere = {
    organisationId,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { employeeNumber: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [directory, totalEmployees] = await Promise.all([
    prisma.employee.findMany({
      where: listWhere,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 60,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        employmentStatus: true,
        position: { select: { title: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.employee.count({ where: { organisationId } }),
  ]);

  const selectedId = employeeId || directory[0]?.id || "";

  const selected = selectedId
    ? await prisma.employee.findFirst({
        where: { id: selectedId, organisationId },
        include: {
          department: { select: { name: true } },
          team: { select: { name: true } },
          location: { select: { name: true } },
          position: { select: { title: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { reports: true, documents: true, certifications: true } },
        },
      })
    : null;

  const documents = selected
    ? await prisma.employeeDocument.findMany({
        where: { organisationId, employeeId: selected.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  const certifications = selected
    ? await prisma.employeeCertification.findMany({
        where: { employee: { id: selected.id, organisationId } },
        include: { certification: { select: { name: true } } },
        orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
      })
    : [];

  const selectedName = selected ? `${selected.firstName} ${selected.lastName}` : "";
  const docsHref = selected ? `/hr/employees/documents?employee=${selected.id}` : "/hr/employees/documents";
  const certsHref = selected
    ? `/hr/employees/certifications?employee=${selected.id}`
    : "/hr/employees/certifications";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/hr/employees" className="text-xs font-medium text-sky-600 hover:underline">
            ← Back to employees
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee details
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Search the directory and open a full profile without leaving the page.
          </p>
        </div>
        <Link href="/hr/employees/new" className="btn-primary">
          + Add employee
        </Link>
      </div>

      {totalEmployees === 0 ? (
        <EmptyState
          title="No employees on record"
          hint="Add your first employee to start building the HR directory."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* ── Directory selector ── */}
          <div className="card overflow-hidden">
            <form action="/hr/employees/details" method="get" className="border-b border-slate-100 p-3">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search by name or number…"
                className="input !w-full"
              />
              <button type="submit" className="btn-secondary mt-2 w-full">
                Search
              </button>
            </form>
            <div className="max-h-[560px] overflow-y-auto">
              {directory.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  No employees match “{q}”.
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {directory.map((e) => {
                    const isActive = e.id === selectedId;
                    return (
                      <li key={e.id}>
                        <Link
                          href={`/hr/employees/details${qs({ q, employee: e.id })}`}
                          className={`flex items-center gap-2.5 px-3 py-2.5 transition ${
                            isActive ? "bg-sky-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                              isActive ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {initials(`${e.firstName} ${e.lastName}`)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-medium ${
                                isActive ? "text-sky-700" : "text-slate-700"
                              }`}
                            >
                              {e.firstName} {e.lastName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {e.position?.title ?? "No position"}
                              {e.department ? ` · ${e.department.name}` : ""}
                            </span>
                          </span>
                          <Badge tone={STATUS_TONE[e.employmentStatus] ?? "slate"}>
                            {e.employmentStatus}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ── Inline profile ── */}
          <div>
            {!selected ? (
              <EmptyState
                title={employeeId ? "Employee not found" : "Select an employee"}
                hint={
                  employeeId
                    ? "That record may have been removed. Pick another from the directory."
                    : "Choose someone from the directory to view their full profile."
                }
              />
            ) : (
              <div>
                <div className="card mb-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-sky-100 text-base font-semibold text-sky-600">
                        {initials(selectedName)}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                            {selectedName}
                          </h2>
                          <Badge tone={STATUS_TONE[selected.employmentStatus] ?? "slate"}>
                            {selected.employmentStatus}
                          </Badge>
                          <Badge tone="slate">
                            {TYPE_LABEL[selected.employmentType] ?? selected.employmentType}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {selected.employeeNumber} · {selected.position?.title ?? "No position"} ·{" "}
                          {selected.department?.name ?? "No department"}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/hr/employees/${selected.id}`}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      Open full page →
                    </Link>
                  </div>
                  {selected.employmentStatus === "TERMINATED" && (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      <span className="font-semibold">
                        Terminated {formatDate(selected.terminationDate)}
                      </span>
                      {selected.terminationReason && <> — {selected.terminationReason}</>}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Personal details</h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <Info label="Employee #" value={selected.employeeNumber} />
                      <Info label="Preferred name" value={selected.preferredName} />
                      <Info label="Date of birth" value={formatDate(selected.dateOfBirth)} />
                      <Info label="Gender" value={GENDER_LABEL[selected.gender ?? ""] ?? "—"} />
                      <Info label="Tax file number" value={selected.taxFileNumber} />
                    </dl>
                  </div>

                  <div className="card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Employment details</h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <Info label="Hire date" value={formatDate(selected.hireDate)} />
                      <Info label="Probation end" value={formatDate(selected.probationEndDate)} />
                      <Info label="Team" value={selected.team?.name ?? "—"} />
                      <Info label="Location" value={selected.location?.name ?? "—"} />
                      <Info
                        label="Manager"
                        value={
                          selected.manager ? (
                            <Link
                              href={`/hr/employees/details${qs({ q, employee: selected.manager.id })}`}
                              className="text-sky-600 hover:underline"
                            >
                              {selected.manager.firstName} {selected.manager.lastName}
                            </Link>
                          ) : (
                            "—"
                          )
                        }
                      />
                      <Info label="Direct reports" value={selected._count.reports} />
                    </dl>
                  </div>

                  <div className="card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Contact</h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <Info label="Work email" value={selected.workEmail} />
                      <Info label="Personal email" value={selected.personalEmail} />
                      <Info label="Phone" value={selected.phone} />
                    </dl>
                    <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-800">
                      Emergency contact
                    </h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <Info label="Name" value={selected.emergencyContactName} />
                      <Info label="Phone" value={selected.emergencyContactPhone} />
                    </dl>
                  </div>

                  <div className="card p-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Pay &amp; super</h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <Info label="Salary type" value={selected.salaryType} />
                      <Info
                        label={selected.salaryType === "HOURLY" ? "Hourly rate" : "Base salary"}
                        value={
                          selected.salaryType === "HOURLY"
                            ? formatMoney(selected.hourlyRate)
                            : `${formatMoney(selected.baseSalary)} p.a.`
                        }
                      />
                      <Info
                        label="Hours / week"
                        value={String(Number(selected.standardHoursPerWeek))}
                      />
                      <Info label="Super fund" value={selected.superFundName} />
                    </dl>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800">
                        Documents
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {selected._count.documents}
                        </span>
                      </h3>
                      <Link href={docsHref} className="text-xs font-medium text-sky-600 hover:underline">
                        Manage →
                      </Link>
                    </div>
                    {documents.length === 0 ? (
                      <p className="text-sm text-slate-400">No documents on file.</p>
                    ) : (
                      <ul className="divide-y divide-slate-50">
                        {documents.map((d) => {
                          const expired = isPast(d.expiryDate);
                          return (
                            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-slate-700">
                                  {d.title}
                                </span>
                                <span className="block text-xs text-slate-400">{d.category}</span>
                              </span>
                              {d.expiryDate && (
                                <Badge tone={expired ? "red" : "amber"}>
                                  {formatDate(d.expiryDate)}
                                </Badge>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800">
                        Certifications
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {selected._count.certifications}
                        </span>
                      </h3>
                      <Link href={certsHref} className="text-xs font-medium text-sky-600 hover:underline">
                        Manage →
                      </Link>
                    </div>
                    {certifications.length === 0 ? (
                      <p className="text-sm text-slate-400">No certifications recorded.</p>
                    ) : (
                      <ul className="divide-y divide-slate-50">
                        {certifications.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-slate-700">
                                {c.certification.name}
                              </span>
                              {c.expiryDate && (
                                <span className="block text-xs text-slate-400">
                                  expires {formatDate(c.expiryDate)}
                                </span>
                              )}
                            </span>
                            <Badge tone={CERT_TONE[c.status] ?? "slate"}>{c.status}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
