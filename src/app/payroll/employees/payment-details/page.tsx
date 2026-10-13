import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, strParam } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { EmployeePayrollActions, type PayrollEmployeeEditable } from "../EmployeePayrollActions";

/** Every employee is paid by EFT in this console's demo data. */
const PAYMENT_METHOD = "Bank transfer (EFT)";

type Row = PayrollEmployeeEditable & {
  employeeNumber: string;
  fundComplete: boolean;
};

export default async function PaymentDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const q = strParam(sp.q);
  const filter = (strParam(sp.filter) || "ALL").toUpperCase();

  const base: Prisma.EmployeeWhereInput = {
    organisationId,
    employmentStatus: { not: "TERMINATED" },
  };

  const conditions: Prisma.EmployeeWhereInput[] = [];
  if (q) {
    conditions.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { employeeNumber: { contains: q, mode: "insensitive" } },
        { superFundName: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (filter === "MISSING") {
    conditions.push({ OR: [{ superFundName: null }, { superMemberNumber: null }] });
  }

  const where: Prisma.EmployeeWhereInput = {
    ...base,
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };

  const [totalActive, withDetails, missingSuper, missingMember, missingEither, rows] =
    await Promise.all([
      prisma.employee.count({ where: base }),
      prisma.employee.count({
        where: { ...base, superFundName: { not: null }, superMemberNumber: { not: null } },
      }),
      prisma.employee.count({ where: { ...base, superFundName: null } }),
      prisma.employee.count({ where: { ...base, superMemberNumber: null } }),
      prisma.employee.count({
        where: { ...base, OR: [{ superFundName: null }, { superMemberNumber: null }] },
      }),
      prisma.employee.findMany({
        where,
        orderBy: [{ superFundName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          salaryType: true,
          baseSalary: true,
          hourlyRate: true,
          standardHoursPerWeek: true,
          superFundName: true,
          superMemberNumber: true,
          taxFileNumber: true,
        },
      }),
    ]);

  const mapped: Row[] = rows.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    salaryType: e.salaryType,
    baseSalary: Number(e.baseSalary),
    hourlyRate: Number(e.hourlyRate),
    standardHoursPerWeek: Number(e.standardHoursPerWeek),
    superFundName: e.superFundName,
    superMemberNumber: e.superMemberNumber,
    tfnOnFile: Boolean(e.taxFileNumber),
    maskedTfn: e.taxFileNumber ? "XXX-XXX-XXX" : null,
    employeeNumber: e.employeeNumber,
    fundComplete: Boolean(e.superFundName) && Boolean(e.superMemberNumber),
  }));

  const chip = (value: string, label: string) => (
    <Link
      key={value}
      href={`/payroll/employees/payment-details${qs({ q, filter: value })}`}
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
            Payment details
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · super funds and payment method per employee
          </p>
        </div>
        <Link href="/payroll/employees" className="btn-secondary">
          All payroll details
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={totalActive} hint="Active payroll records" tone="amber" />
        <StatCard
          label="With super details"
          value={withDetails}
          hint="Fund and member number"
          tone="emerald"
        />
        <StatCard
          label="Missing super fund"
          value={missingSuper}
          hint="No fund on file"
          tone={missingSuper ? "rose" : "emerald"}
        />
        <StatCard
          label="Missing member no."
          value={missingMember}
          hint="No membership number"
          tone={missingMember ? "amber" : "emerald"}
        />
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          action="/payroll/employees/payment-details"
          method="get"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, number or fund…"
            className="input !w-64"
          />
          {filter !== "ALL" && <input type="hidden" name="filter" value={filter} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {chip("ALL", "All employees")}
          {chip("MISSING", `Missing details · ${missingEither}`)}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {mapped.length === 0 ? (
          <EmptyState
            title="No employees match these filters"
            hint="Try a different search term or switch back to all employees."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Salary type</th>
                <th className="th">Super fund</th>
                <th className="th">Member number</th>
                <th className="th">Payment method</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mapped.map((e) => (
                <tr
                  key={e.id}
                  className={
                    e.fundComplete
                      ? "hover:bg-slate-50/70"
                      : "bg-amber-50/40 hover:bg-amber-50/70"
                  }
                >
                  <td className="td">
                    <span className="font-medium text-slate-800">
                      {e.firstName} {e.lastName}
                    </span>
                    <div className="text-[11px] text-slate-400">{e.employeeNumber}</div>
                  </td>
                  <td className="td text-slate-600">
                    {e.salaryType === "ANNUAL" ? "Salary" : "Hourly"}
                  </td>
                  <td
                    className={`td ${
                      e.superFundName ? "text-slate-600" : "font-medium text-amber-600"
                    }`}
                  >
                    {e.superFundName ?? "Missing"}
                  </td>
                  <td
                    className={`td ${
                      e.superMemberNumber ? "text-slate-600" : "font-medium text-amber-600"
                    }`}
                  >
                    {e.superMemberNumber ?? "Missing"}
                  </td>
                  <td className="td text-slate-600">{PAYMENT_METHOD}</td>
                  <td className="td">
                    <Badge tone={e.fundComplete ? "green" : "amber"}>
                      {e.fundComplete ? "Complete" : "Needs details"}
                    </Badge>
                  </td>
                  <td className="td">
                    <div className="flex justify-end">
                      <EmployeePayrollActions employee={e} />
                    </div>
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
