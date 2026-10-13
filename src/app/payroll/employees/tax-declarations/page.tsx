import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/format";

/** Never render a full TFN — show only the last three digits. */
function maskTfn(tfn: string): string {
  const digits = tfn.replace(/\D/g, "");
  const last3 = digits.slice(-3).padStart(3, "X");
  return `XXX-XXX-${last3}`;
}

const DEFAULT_TAX_SCALE = "Resident tax-free threshold";

export default async function EmployeeTaxDeclarationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const filter = (sp.filter ?? "").trim().toLowerCase() === "missing" ? "missing" : "all";
  const yearStart = new Date(`${new Date().getFullYear()}-01-01`);

  const [setting, employees, paygGroups, totalWithheld] = await Promise.all([
    prisma.orgSetting.findUnique({
      where: { organisationId_key: { organisationId, key: "tax_scale" } },
      select: { value: true },
    }),
    prisma.employee.findMany({
      where: {
        organisationId,
        employmentStatus: { not: "TERMINATED" },
        ...(filter === "missing" ? { taxFileNumber: null } : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        taxFileNumber: true,
        salaryType: true,
      },
    }),
    prisma.paygRecord.groupBy({
      by: ["employeeId"],
      where: { organisationId, createdAt: { gte: yearStart } },
      _sum: { taxWithheld: true, grossPay: true },
    }),
    prisma.paygRecord.aggregate({
      where: { organisationId, createdAt: { gte: yearStart } },
      _sum: { taxWithheld: true },
    }),
  ]);

  const taxScale = setting?.value?.trim() || DEFAULT_TAX_SCALE;

  // Declarations on file across the whole (unfiltered) workforce.
  const [onFile, missing] = await Promise.all([
    prisma.employee.count({
      where: { organisationId, employmentStatus: { not: "TERMINATED" }, taxFileNumber: { not: null } },
    }),
    prisma.employee.count({
      where: { organisationId, employmentStatus: { not: "TERMINATED" }, taxFileNumber: null },
    }),
  ]);

  const byEmployee = new Map<string, { tax: number; gross: number }>();
  for (const g of paygGroups) {
    byEmployee.set(g.employeeId, {
      tax: Number(g._sum.taxWithheld ?? 0),
      gross: Number(g._sum.grossPay ?? 0),
    });
  }

  const rows = employees.map((e) => {
    const payg = byEmployee.get(e.id) ?? { tax: 0, gross: 0 };
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      employeeNumber: e.employeeNumber,
      maskedTfn: e.taxFileNumber ? maskTfn(e.taxFileNumber) : null,
      onFile: Boolean(e.taxFileNumber),
      taxScale,
      ytdGross: payg.gross,
      ytdTax: payg.tax,
    };
  });

  const ytdWithheld = Number(totalWithheld._sum.taxWithheld ?? 0);

  const chip = (value: string, label: string) => (
    <Link
      key={value}
      href={`/payroll/employees/tax-declarations${value === "missing" ? "?filter=missing" : ""}`}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        filter === value
          ? "bg-amber-500 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Tax declarations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · TFN declarations and year-to-date PAYG withheld
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/tax/declarations" className="btn-secondary">
            Tax overview
          </Link>
          <Link href="/payroll/employees" className="btn-secondary">
            All payroll details
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Declarations on file"
          value={onFile}
          hint="Employees with a TFN"
          tone="emerald"
        />
        <StatCard
          label="Missing TFN"
          value={missing}
          hint="No declaration recorded"
          tone={missing ? "rose" : "emerald"}
        />
        <StatCard
          label="YTD tax withheld"
          value={formatMoney(ytdWithheld)}
          hint={`Year ${new Date().getFullYear()}`}
          tone="amber"
        />
      </div>

      {/* ── Tax scale note ── */}
      <div className="mt-5 card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Applied tax scale
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">{taxScale}</p>
        </div>
        <p className="text-xs text-slate-500">
          From the organisation setting <span className="font-mono">tax_scale</span>. Update it in
          Payroll settings → Tax.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {chip("all", `All employees · ${onFile + missing}`)}
          {chip("missing", `Missing TFN · ${missing}`)}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title={filter === "missing" ? "Every employee has a TFN on file" : "No employees found"}
            hint={
              filter === "missing"
                ? "Nothing outstanding — all active employees have a tax declaration."
                : "Add employees in the HR console to manage their tax declarations."
            }
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Tax file number</th>
                <th className="th">Tax scale</th>
                <th className="th text-right">YTD gross</th>
                <th className="th text-right">YTD tax withheld</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className={e.onFile ? "hover:bg-slate-50/70" : "bg-amber-50/40 hover:bg-amber-50/70"}
                >
                  <td className="td">
                    <span className="font-medium text-slate-800">{e.name}</span>
                    <div className="text-[11px] text-slate-400">{e.employeeNumber}</div>
                  </td>
                  <td className="td">
                    {e.maskedTfn ? (
                      <span className="tabular-nums text-slate-600">{e.maskedTfn}</span>
                    ) : (
                      <Badge tone="red">Not on file</Badge>
                    )}
                  </td>
                  <td className="td text-slate-600">{e.onFile ? e.taxScale : "—"}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(e.ytdGross)}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(e.ytdTax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
