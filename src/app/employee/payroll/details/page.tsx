import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { PageHeader, Badge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

const EMPLOYMENT_TYPE: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CASUAL: "Casual",
  CONTRACT: "Contract",
};

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly",
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** TFN is never shown in full — only the last 3 digits are visible. */
function maskTFN(tfn: string | null): string {
  if (!tfn) return "Not provided";
  return `XXX-XXX-${tfn.slice(-3)}`;
}

/** Super member numbers show only their last 4 digits. */
function maskMemberNumber(no: string | null): string {
  if (!no) return "Not provided";
  return `•••• ${no.slice(-4)}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-right text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default async function PaymentDetailsPage() {
  const { employee, organisationId } = await employeeContext();

  const paySchedule = await prisma.paySchedule.findFirst({
    where: { organisationId, isActive: true },
  });

  const isAnnual = employee.salaryType === "ANNUAL";

  return (
    <div>
      <PageHeader
        title="Payment details"
        subtitle="Your pay, super and tax information on file — read-only"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Pay ── */}
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Pay</h2>
            <Badge tone="purple">{EMPLOYMENT_TYPE[employee.employmentType] ?? employee.employmentType}</Badge>
          </div>
          <Row label="Pay type" value={isAnnual ? "Annual" : "Hourly"} />
          <Row
            label={isAnnual ? "Base salary" : "Hourly rate"}
            value={formatMoney(Number(isAnnual ? employee.baseSalary : employee.hourlyRate))}
          />
          <Row label="Standard hours / week" value={`${Number(employee.standardHoursPerWeek)} h`} />
          <Row label="Employment type" value={EMPLOYMENT_TYPE[employee.employmentType] ?? employee.employmentType} />
        </section>

        {/* ── Superannuation ── */}
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Superannuation</h2>
          <Row label="Super fund" value={employee.superFundName ?? "Not provided"} />
          <Row label="Member number" value={maskMemberNumber(employee.superMemberNumber)} />
        </section>

        {/* ── Tax ── */}
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Tax</h2>
          <Row label="Tax file number" value={maskTFN(employee.taxFileNumber)} />
        </section>

        {/* ── Pay schedule ── */}
        {paySchedule && (
          <section className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Pay schedule</h2>
              <Badge tone="green">Active</Badge>
            </div>
            <Row label="Schedule" value={paySchedule.name} />
            <Row
              label="Frequency"
              value={FREQUENCY_LABEL[paySchedule.frequency] ?? paySchedule.frequency}
            />
            <Row label="Pay day" value={WEEKDAYS[paySchedule.payDay] ?? "—"} />
            <Row
              label="Next run"
              value={paySchedule.nextRunDate ? formatDate(paySchedule.nextRunDate) : "—"}
            />
          </section>
        )}
      </div>

      {/* ── Contact HR note ── */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <span className="text-lg leading-none">ℹ️</span>
        <div>
          <p className="text-sm font-medium text-amber-900">
            To change your bank or super details contact HR.
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            Bank account and super fund changes are handled by your HR team for security —
            this page is read-only.
          </p>
        </div>
      </div>
    </div>
  );
}
