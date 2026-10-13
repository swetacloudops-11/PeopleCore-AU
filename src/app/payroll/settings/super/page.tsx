import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export const dynamic = "force-dynamic";

export default async function SuperSettingsPage() {
  const { organisationId, org } = await payrollContext();
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [rows, superRecords] = await Promise.all([
    prisma.orgSetting.findMany({
      where: { organisationId, key: { in: ["super_rate", "super_default_fund"] } },
      orderBy: { key: "asc" },
    }),
    prisma.superannuationRecord.aggregate({
      where: { organisationId, createdAt: { gte: yearStart } },
      _sum: { salaryBase: true, superAmount: true },
      _count: true,
    }),
  ]);

  const settings: SettingRow[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
    group: s.group,
  }));

  const superRate = rows.find((r) => r.key === "super_rate")?.value;
  const defaultFund = rows.find((r) => r.key === "super_default_fund")?.value;

  const accrued = Number(superRecords._sum.superAmount ?? 0);
  const salaryBase = Number(superRecords._sum.salaryBase ?? 0);

  return (
    <div>
      <PageHeader
        title="Superannuation Settings"
        subtitle={`${org.name} · super guarantee rate, default fund and year-to-date accrual`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Super rate"
          value={superRate ? `${superRate}%` : "—"}
          hint="SG rate applied to pay runs"
          tone="amber"
        />
        <StatCard label="Super accrued YTD" value={formatMoney(accrued)} hint={String(new Date().getFullYear())} tone="emerald" />
        <StatCard label="Salary base YTD" value={formatMoney(salaryBase)} hint="Superable earnings" tone="indigo" />
        <StatCard label="Super records" value={superRecords._count} hint="This year" tone="sky" />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">Default fund</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The super fund new employees are defaulted to when they do not nominate their own.
            Employees can override this in their payroll details.
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">{defaultFund ?? "Not configured"}</p>
          <div className="mt-4">
            <Link href="/payroll/tax/superannuation" className="btn-secondary !py-1.5 text-xs">
              View superannuation records →
            </Link>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Accrual check</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Super is calculated per pay run line and recorded against the employee period.
          </p>
          <p className="mt-3">
            <Badge tone="amber">{superRate ? `${superRate}% SG` : "Rate not set"}</Badge>
          </p>
        </div>
      </section>

      <div className="mt-6">
        <SettingsForm settings={settings} title="superannuation" />
      </div>
    </div>
  );
}
