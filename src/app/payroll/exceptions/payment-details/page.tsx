import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";

export default async function PayrollPaymentDetailsIssuesPage() {
  const { organisationId, org } = await payrollContext();

  const employees = await prisma.employee.findMany({
    where: {
      organisationId,
      employmentStatus: { not: "TERMINATED" },
      OR: [
        { superFundName: null },
        { superMemberNumber: null },
        { taxFileNumber: null },
        { baseSalary: 0, hourlyRate: 0 },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      superFundName: true,
      superMemberNumber: true,
      taxFileNumber: true,
      baseSalary: true,
      hourlyRate: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows = employees.map((e) => {
    const missingSuperFund = !e.superFundName;
    const missingMemberNumber = !e.superMemberNumber;
    const missingTfn = !e.taxFileNumber;
    const missingRate = Number(e.baseSalary) === 0 && Number(e.hourlyRate) === 0;
    return {
      employee: e,
      missingSuperFund,
      missingMemberNumber,
      missingTfn,
      missingRate,
      issueCount: [missingSuperFund, missingMemberNumber, missingTfn, missingRate].filter(Boolean)
        .length,
    };
  });

  const countOf = (key: "missingSuperFund" | "missingMemberNumber" | "missingTfn" | "missingRate") =>
    rows.filter((r) => r[key]).length;

  const issues = [
    {
      key: "superFund",
      icon: "🏦",
      title: "Missing super fund",
      count: countOf("missingSuperFund"),
      body: "No superannuation fund is set. A super fund is required before a pay run can include super contributions.",
    },
    {
      key: "member",
      icon: "🆔",
      title: "Missing member number",
      count: countOf("missingMemberNumber"),
      body: "A fund is set but the member number is blank. Contributions may be rejected without it.",
    },
    {
      key: "tfn",
      icon: "🇦🇺",
      title: "Missing tax file number",
      count: countOf("missingTfn"),
      body: "No TFN on file — PAYG will be withheld at the no-TFN rate. Collect the declaration.",
    },
    {
      key: "rate",
      icon: "💵",
      title: "No pay rate",
      count: countOf("missingRate"),
      body: "Both the annual salary and hourly rate are zero, so this employee would calculate to nothing.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payment Details Issues"
        subtitle={`${rows.length} active employee${rows.length === 1 ? "" : "s"} with incomplete pay details for ${org.name}`}
        action={{ label: "Payment details", href: "/payroll/employees/payment-details" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Employees flagged"
          value={rows.length}
          hint="Missing at least one detail"
          tone={rows.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Missing super fund"
          value={countOf("missingSuperFund")}
          hint="No fund set"
          tone={countOf("missingSuperFund") ? "rose" : "emerald"}
        />
        <StatCard
          label="Missing TFN"
          value={countOf("missingTfn")}
          hint="Tax declaration needed"
          tone={countOf("missingTfn") ? "rose" : "emerald"}
        />
        <StatCard
          label="No pay rate"
          value={countOf("missingRate")}
          hint="Salary and rate are zero"
          tone={countOf("missingRate") ? "rose" : "emerald"}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {issues.map((issue) => (
          <div key={issue.key} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{issue.icon}</span>
                <h3 className="text-sm font-semibold text-slate-800">{issue.title}</h3>
              </div>
              <span
                className={`text-lg font-semibold ${
                  issue.count > 0 ? "text-amber-600" : "text-slate-400"
                }`}
              >
                {issue.count}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{issue.body}</p>
            <Link
              href="/payroll/employees/payment-details"
              className="mt-3 inline-block text-[11px] text-amber-600 hover:underline"
            >
              Fix in payment details →
            </Link>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Employees with issues</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="All payment details complete"
            hint="Every active employee has a super fund, member number, tax file number and pay rate."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Department</th>
                <th className="th">Super fund</th>
                <th className="th">Member no.</th>
                <th className="th">Tax file no.</th>
                <th className="th">Pay rate</th>
                <th className="th">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.employee.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">
                      {r.employee.firstName} {r.employee.lastName}
                    </div>
                    <div className="text-xs text-slate-400">{r.employee.employeeNumber}</div>
                  </td>
                  <td className="td text-slate-500">{r.employee.department?.name ?? "—"}</td>
                  <td className="td">
                    {r.missingSuperFund ? (
                      <Badge tone="amber">Missing</Badge>
                    ) : (
                      <span className="text-xs text-slate-500">{r.employee.superFundName}</span>
                    )}
                  </td>
                  <td className="td">
                    {r.missingMemberNumber ? (
                      <Badge tone="amber">Missing</Badge>
                    ) : (
                      <span className="text-xs text-slate-500">{r.employee.superMemberNumber}</span>
                    )}
                  </td>
                  <td className="td">
                    {r.missingTfn ? (
                      <Badge tone="amber">Missing</Badge>
                    ) : (
                      <span className="text-xs text-slate-500">{r.employee.taxFileNumber}</span>
                    )}
                  </td>
                  <td className="td">
                    {r.missingRate ? (
                      <Badge tone="amber">Missing</Badge>
                    ) : (
                      <span className="text-xs text-slate-500">Set</span>
                    )}
                  </td>
                  <td className="td text-slate-600">{r.issueCount}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
