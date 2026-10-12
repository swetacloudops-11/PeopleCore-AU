import Link from "next/link";
import { employeeContext } from "@/lib/employee";
import { Badge } from "@/components/ui";
import { formatDate, formatMoney, initials } from "@/lib/format";

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

/** Mask a tax file number — only the last 3 digits are ever shown. */
function maskTFN(tfn: string | null): string {
  if (!tfn) return "—";
  const digits = tfn.replace(/\D/g, "");
  return digits.length >= 3 ? `XXX-XXX-${digits.slice(-3)}` : "XXX-XXX-XXX";
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {note && <span className="text-[11px] text-slate-400">{note}</span>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export default async function EmployeeProfilePage() {
  const { employee, org } = await employeeContext();

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const payValue =
    employee.salaryType === "HOURLY"
      ? `${formatMoney(employee.hourlyRate)} / hour`
      : `${formatMoney(employee.baseSalary)} p.a.`;
  const emergencyMissing =
    !employee.emergencyContactName && !employee.emergencyContactPhone;

  return (
    <div>
      {/* ── Profile summary header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-violet-100 text-base font-semibold text-violet-600">
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
              {employee.employeeNumber} · {employee.positionTitle ?? "No position"} ·{" "}
              {org.name}
            </p>
          </div>
        </div>
        <Link href="/employee/profile/edit" className="btn-primary">
          Update profile
        </Link>
      </div>

      {/* ── Section shortcuts ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: "Personal details", href: "#personal" },
          { label: "Contact information", href: "#contact" },
          { label: "Employment details", href: "#employment" },
          { label: "Emergency contacts", href: "#emergency" },
        ].map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        {/* ── Personal details ── */}
        <Section id="personal" title="Personal details">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="Full name" value={fullName} />
            <Info label="Preferred name" value={employee.preferredName} />
            <Info label="Date of birth" value={formatDate(employee.dateOfBirth)} />
            <Info label="Employee number" value={employee.employeeNumber} />
            <Info
              label="Employment status"
              value={
                <Badge tone={STATUS_TONE[employee.employmentStatus] ?? "slate"}>
                  {employee.employmentStatus}
                </Badge>
              }
            />
          </dl>
        </Section>

        {/* ── Contact information ── */}
        <Section id="contact" title="Contact information" note="Editable by you">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="Work email" value={employee.workEmail} />
            <Info label="Personal email" value={employee.personalEmail} />
            <Info label="Phone" value={employee.phone} />
          </dl>
        </Section>

        {/* ── Employment details ── */}
        <Section
          id="employment"
          title="Employment details"
          note="Managed by HR — contact your HR team to correct anything here"
        >
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Info label="Position" value={employee.positionTitle} />
            <Info label="Department" value={employee.departmentName} />
            <Info label="Team" value={employee.teamName} />
            <Info label="Location" value={employee.locationName} />
            <Info label="Manager" value={employee.managerName} />
            <Info label="Employment type" value={TYPE_LABEL[employee.employmentType] ?? employee.employmentType} />
            <Info label="Hire date" value={formatDate(employee.hireDate)} />
            <Info label="Salary type" value={employee.salaryType === "ANNUAL" ? "Annual" : "Hourly"} />
            <Info label="Pay" value={payValue} />
            <Info
              label="Tax file number"
              value={
                <span className="inline-flex items-center gap-1.5">
                  🔒 {maskTFN(employee.taxFileNumber)}
                </span>
              }
            />
          </dl>
        </Section>

        {/* ── Emergency contacts ── */}
        <Section id="emergency" title="Emergency contacts" note="Editable by you">
          {emergencyMissing ? (
            <p className="text-sm text-slate-500">
              No emergency contact recorded yet — add one via{" "}
              <Link href="/employee/profile/edit" className="text-violet-600 hover:underline">
                Update profile
              </Link>
              .
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <Info label="Contact name" value={employee.emergencyContactName} />
              <Info label="Contact phone" value={employee.emergencyContactPhone} />
            </dl>
          )}
        </Section>
      </div>
    </div>
  );
}
