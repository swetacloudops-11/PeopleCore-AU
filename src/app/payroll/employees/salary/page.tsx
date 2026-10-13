import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import {
  ChartPanel,
  Donut,
  BarList,
  type DonutSegment,
  type BarItem,
} from "@/components/charts";
import { formatMoney } from "@/lib/format";
import { EmployeePayrollActions, type PayrollEmployeeEditable } from "../EmployeePayrollActions";

/** Annualised cost: salary, or hourly rate × standard hours × 52 weeks. */
function annualisedCost(e: { salaryType: string; baseSalary: number; hourlyRate: number; standardHoursPerWeek: number }) {
  return e.salaryType === "ANNUAL" ? e.baseSalary : e.hourlyRate * e.standardHoursPerWeek * 52;
}

type Row = PayrollEmployeeEditable & {
  employeeNumber: string;
  annualised: number;
};

export default async function SalaryWagesPage() {
  const { organisationId, org } = await payrollContext();

  const employees = await prisma.employee.findMany({
    where: { organisationId, employmentStatus: { not: "TERMINATED" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
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
  });

  const rows: Row[] = employees
    .map((e) => {
      const baseSalary = Number(e.baseSalary);
      const hourlyRate = Number(e.hourlyRate);
      const standardHoursPerWeek = Number(e.standardHoursPerWeek);
      const editable: PayrollEmployeeEditable = {
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        salaryType: e.salaryType,
        baseSalary,
        hourlyRate,
        standardHoursPerWeek,
        superFundName: e.superFundName,
        superMemberNumber: e.superMemberNumber,
        tfnOnFile: Boolean(e.taxFileNumber),
        maskedTfn: e.taxFileNumber ? "XXX-XXX-XXX" : null,
      };
      return {
        ...editable,
        employeeNumber: e.employeeNumber,
        annualised: annualisedCost({ salaryType: e.salaryType, baseSalary, hourlyRate, standardHoursPerWeek }),
      };
    })
    .sort((a, b) => b.annualised - a.annualised);

  const salaried = rows.filter((r) => r.salaryType === "ANNUAL");
  const hourly = rows.filter((r) => r.salaryType === "HOURLY");
  const totalCost = rows.reduce((a, r) => a + r.annualised, 0);
  const average = rows.length > 0 ? totalCost / rows.length : 0;

  const segments = (
    [
      { label: "Annual salary", value: salaried.length, tone: "amber" },
      { label: "Hourly", value: hourly.length, tone: "sky" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  const topSalaries = rows.slice(0, 10).map(
    (r): BarItem => ({
      label: `${r.firstName} ${r.lastName}`,
      value: Math.round(r.annualised),
      hint: `${r.employeeNumber} · ${r.salaryType === "ANNUAL" ? "Salary" : "Hourly"}`,
    })
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Salary &amp; wages
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · annualised cost across {rows.length} employees
          </p>
        </div>
        <Link href="/payroll/employees" className="btn-secondary">
          All payroll details
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Annualised payroll"
          value={formatMoney(totalCost)}
          hint="Salary + hourly equivalent"
          tone="amber"
        />
        <StatCard
          label="Average salary"
          value={formatMoney(average)}
          hint="Across all employees"
          tone="emerald"
        />
        <StatCard
          label="Hourly headcount"
          value={hourly.length}
          hint={`${salaried.length} on salary`}
          tone="sky"
        />
        <StatCard
          label="Employees"
          value={rows.length}
          hint="Active payroll records"
          tone="indigo"
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Salary type split" subtitle="Employees by pay basis">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={rows.length}
            centerLabel="employees"
          />
        </ChartPanel>

        <ChartPanel title="Top 10 salaries" subtitle="Highest annualised cost">
          <BarList
            items={topSalaries}
            tone="amber"
            valueFormat={(v) => formatMoney(v)}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No employees on the payroll yet"
            hint="Add employees in the HR console to see salary and wage costs here."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Salary type</th>
                <th className="th text-right">Base salary</th>
                <th className="th text-right">Hourly rate</th>
                <th className="th text-right">Std hours</th>
                <th className="th text-right">Annualised cost</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="font-medium text-slate-800">
                      {e.firstName} {e.lastName}
                    </span>
                    <div className="text-[11px] text-slate-400">{e.employeeNumber}</div>
                  </td>
                  <td className="td">
                    <Badge tone={e.salaryType === "ANNUAL" ? "green" : "blue"}>
                      {e.salaryType === "ANNUAL" ? "Salary" : "Hourly"}
                    </Badge>
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {e.salaryType === "ANNUAL" ? formatMoney(e.baseSalary) : "—"}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {e.salaryType === "HOURLY" ? formatMoney(e.hourlyRate) : "—"}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {e.standardHoursPerWeek}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(e.annualised)}
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
