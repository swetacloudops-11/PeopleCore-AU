import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/format";

const DEFAULT_TAX_SCALE = "Resident tax-free threshold";

export default async function TaxDeclarationsOverviewPage() {
  const { organisationId, org } = await payrollContext();
  const yearStart = new Date(`${new Date().getFullYear()}-01-01`);

  const [setting, employees, payg, missingTfn] = await Promise.all([
    prisma.orgSetting.findUnique({
      where: { organisationId_key: { organisationId, key: "tax_scale" } },
      select: { value: true },
    }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, taxFileNumber: true },
    }),
    prisma.paygRecord.aggregate({
      where: { organisationId, createdAt: { gte: yearStart } },
      _sum: { grossPay: true, taxWithheld: true, cumulativeTax: true },
      _count: true,
    }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" }, taxFileNumber: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 25,
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
  ]);

  const taxScale = setting?.value?.trim() || DEFAULT_TAX_SCALE;

  const total = employees.length;
  const onFile = employees.filter((e) => Boolean(e.taxFileNumber)).length;
  const missing = total - onFile;

  const ytdGross = Number(payg._sum.grossPay ?? 0);
  const ytdTax = Number(payg._sum.taxWithheld ?? 0);

  // The console applies a single organisation-wide scale, so the summary has one row.
  const scaleRows =
    total > 0
      ? [{ scale: taxScale, employees: total, onFile, missing }]
      : [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Tax declarations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · declaration coverage and {new Date().getFullYear()} PAYG totals
          </p>
        </div>
        <Link href="/payroll/employees/tax-declarations" className="btn-primary">
          Manage TFNs
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees covered" value={total} hint="Active payroll records" tone="amber" />
        <StatCard
          label="Declarations on file"
          value={onFile}
          hint={`${missing} missing a TFN`}
          tone="emerald"
        />
        <StatCard
          label="Missing TFN"
          value={missing}
          hint="Action required"
          tone={missing ? "rose" : "emerald"}
        />
        <StatCard
          label={`${new Date().getFullYear()} PAYG withheld`}
          value={formatMoney(ytdTax)}
          hint={`${payg._count} records · ${formatMoney(ytdGross)} gross`}
          tone="indigo"
        />
      </div>

      {/* ── Declarations by tax scale ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Declarations by tax scale</h2>
        {scaleRows.length === 0 ? (
          <EmptyState
            title="No employees to declare for"
            hint="Add employees in the HR console to track tax declarations."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Tax scale</th>
                <th className="th text-right">Employees</th>
                <th className="th text-right">On file</th>
                <th className="th text-right">Missing</th>
                <th className="th text-right">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scaleRows.map((r) => (
                <tr key={r.scale} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{r.scale}</td>
                  <td className="td text-right tabular-nums text-slate-600">{r.employees}</td>
                  <td className="td text-right tabular-nums text-slate-600">{r.onFile}</td>
                  <td className="td text-right tabular-nums text-slate-600">{r.missing}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {r.employees > 0 ? Math.round((r.onFile / r.employees) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* ── Missing TFNs + PAYG totals ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Employees missing a TFN</h2>
            <Link
              href="/payroll/employees/tax-declarations?filter=missing"
              className="text-xs text-amber-600 hover:underline"
            >
              Open list →
            </Link>
          </div>
          {missingTfn.length === 0 ? (
            <EmptyState
              title="No missing declarations"
              hint="Every active employee has a tax file number on file."
            />
          ) : (
            <div className="card divide-y divide-slate-100">
              {missingTfn.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-slate-800">
                      {e.firstName} {e.lastName}
                    </p>
                    <p className="text-[11px] text-slate-400">{e.employeeNumber}</p>
                  </div>
                  <Badge tone="red">No TFN</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">
            {new Date().getFullYear()} PAYG totals
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Year to date, from PAYG withholding records
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Gross pay</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatMoney(ytdGross)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Tax withheld</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatMoney(ytdTax)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <dt className="text-slate-500">Effective withholding rate</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {ytdGross > 0 ? `${((ytdTax / ytdGross) * 100).toFixed(1)}%` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Records</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{payg._count}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
