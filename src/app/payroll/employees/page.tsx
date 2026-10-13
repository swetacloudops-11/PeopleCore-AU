import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam, strParam } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { EmployeePayrollActions, type PayrollEmployeeEditable } from "./EmployeePayrollActions";

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CASUAL: "Casual",
  CONTRACT: "Contract",
};

/** Never render a full TFN — show only the last three digits. */
function maskTfn(tfn: string): string {
  const digits = tfn.replace(/\D/g, "");
  const last3 = digits.slice(-3).padStart(3, "X");
  return `XXX-XXX-${last3}`;
}

type Row = PayrollEmployeeEditable & {
  employeeNumber: string;
  employmentType: string;
  departmentName: string | null;
  ready: boolean;
  missing: string[];
};

export default async function PayrollEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const q = strParam(sp.q);
  const departmentId = strParam(sp.department);
  const page = intParam(sp.page, 1, 500);

  const base: Prisma.EmployeeWhereInput = {
    organisationId,
    employmentStatus: { not: "TERMINATED" },
  };
  const where: Prisma.EmployeeWhereInput = {
    ...base,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { employeeNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(departmentId ? { departmentId } : {}),
  };
  const missingWhere: Prisma.EmployeeWhereInput = {
    ...base,
    OR: [
      { superFundName: null },
      { superMemberNumber: null },
      { taxFileNumber: null },
      { AND: [{ salaryType: "ANNUAL" }, { baseSalary: { lte: 0 } }] },
      { AND: [{ salaryType: "HOURLY" }, { hourlyRate: { lte: 0 } }] },
    ],
  };

  const [totalActive, hourly, salaried, missingDetails, totalRows, employees, departments] =
    await Promise.all([
      prisma.employee.count({ where: base }),
      prisma.employee.count({ where: { ...base, salaryType: "HOURLY" } }),
      prisma.employee.count({ where: { ...base, salaryType: "ANNUAL" } }),
      prisma.employee.count({ where: missingWhere }),
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          employmentType: true,
          salaryType: true,
          baseSalary: true,
          hourlyRate: true,
          standardHoursPerWeek: true,
          superFundName: true,
          superMemberNumber: true,
          taxFileNumber: true,
          department: { select: { name: true } },
        },
      }),
      prisma.department.findMany({
        where: { organisationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  const rows: Row[] = employees.map((e) => {
    const editable: PayrollEmployeeEditable = {
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
      maskedTfn: e.taxFileNumber ? maskTfn(e.taxFileNumber) : null,
    };
    const hasRate =
      e.salaryType === "ANNUAL" ? Number(e.baseSalary) > 0 : Number(e.hourlyRate) > 0;
    const missing = [
      hasRate ? null : "pay rate",
      e.superFundName ? null : "super fund",
      e.superMemberNumber ? null : "member number",
      e.taxFileNumber ? null : "tax file number",
    ].filter((x): x is string => x !== null);
    return {
      ...editable,
      employeeNumber: e.employeeNumber,
      employmentType: e.employmentType,
      departmentName: e.department?.name ?? null,
      ready: missing.length === 0,
      missing,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/payroll/employees${qs({ q, department: departmentId, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee payroll details
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {totalActive} employees on the payroll
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/employees/salary" className="btn-secondary">
            Salary &amp; wages
          </Link>
          <Link href="/payroll/employees/payment-details" className="btn-secondary">
            Payment details
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={totalActive} hint="Active payroll records" tone="amber" />
        <StatCard label="On hourly" value={hourly} hint="Paid an hourly rate" tone="sky" />
        <StatCard label="On salary" value={salaried} hint="Annual salary" tone="emerald" />
        <StatCard
          label="Missing details"
          value={missingDetails}
          hint="TFN, super or pay rate"
          tone={missingDetails ? "rose" : "emerald"}
        />
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/payroll/employees" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or employee number…"
            className="input !w-64"
          />
          {departmentId && <input type="hidden" name="department" value={departmentId} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <form action="/payroll/employees" method="get" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          <select name="department" defaultValue={departmentId} className="input !w-48">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        {(q || departmentId) && (
          <Link
            href="/payroll/employees"
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
          >
            Clear
          </Link>
        )}
      </div>

      {/* ── Employee table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No employees match these filters"
            hint="Try a different search term or clear the department filter."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Type</th>
                  <th className="th">Salary type</th>
                  <th className="th text-right">Base / hourly</th>
                  <th className="th">Super fund</th>
                  <th className="th">TFN</th>
                  <th className="th">Readiness</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div>
                        <span className="font-medium text-slate-800">
                          {e.firstName} {e.lastName}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {e.employeeNumber}
                          {e.departmentName ? ` · ${e.departmentName}` : ""}
                        </div>
                      </div>
                    </td>
                    <td className="td text-slate-600">
                      {TYPE_LABEL[e.employmentType] ?? e.employmentType}
                    </td>
                    <td className="td">
                      <Badge tone={e.salaryType === "ANNUAL" ? "green" : "blue"}>
                        {e.salaryType === "ANNUAL" ? "Salary" : "Hourly"}
                      </Badge>
                    </td>
                    <td className="td text-right tabular-nums text-slate-700">
                      {e.salaryType === "ANNUAL"
                        ? formatMoney(e.baseSalary)
                        : formatMoney(e.hourlyRate)}
                      <div className="text-[11px] font-normal text-slate-400">
                        {e.salaryType === "ANNUAL"
                          ? "per year"
                          : `${e.standardHoursPerWeek} h/week`}
                      </div>
                    </td>
                    <td className="td text-slate-600">
                      {e.superFundName ?? <span className="text-amber-600">Missing</span>}
                      <div className="text-[11px] text-slate-400">
                        {e.superMemberNumber ?? "No member number"}
                      </div>
                    </td>
                    <td className="td">
                      {e.tfnOnFile ? (
                        <span className="tabular-nums text-slate-600">{e.maskedTfn}</span>
                      ) : (
                        <Badge tone="red">Not on file</Badge>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={e.ready ? "green" : "amber"}>
                        {e.ready ? "Ready" : "Needs details"}
                      </Badge>
                      {!e.ready && (
                        <div className="mt-0.5 text-[11px] text-amber-600">
                          Missing {e.missing.join(", ")}
                        </div>
                      )}
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

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
                {q || departmentId ? " (filtered)" : ""}
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
