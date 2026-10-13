import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export const dynamic = "force-dynamic";

export default async function TaxSettingsPage() {
  const { organisationId, org } = await payrollContext();
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [rows, payg] = await Promise.all([
    prisma.orgSetting.findMany({
      where: { organisationId, key: { in: ["tax_scale", "payg_withholding_enabled"] } },
      orderBy: { key: "asc" },
    }),
    prisma.paygRecord.aggregate({
      where: { organisationId, createdAt: { gte: yearStart } },
      _sum: { grossPay: true, taxWithheld: true },
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

  const taxScale = rows.find((r) => r.key === "tax_scale")?.value;
  const withholding = rows.find((r) => r.key === "payg_withholding_enabled")?.value === "true";

  const withheld = Number(payg._sum.taxWithheld ?? 0);
  const gross = Number(payg._sum.grossPay ?? 0);
  const effectiveRate = gross > 0 ? (withheld / gross) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Tax Settings"
        subtitle={`${org.name} · PAYG withholding scale and year-to-date totals`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="PAYG withheld YTD" value={formatMoney(withheld)} hint={String(new Date().getFullYear())} tone="amber" />
        <StatCard label="Taxable gross YTD" value={formatMoney(gross)} hint="PAYG record gross" tone="indigo" />
        <StatCard
          label="Effective rate"
          value={gross > 0 ? `${effectiveRate.toFixed(1)}%` : "—"}
          hint="Withheld ÷ gross"
          tone="sky"
        />
        <StatCard
          label="Withholding"
          value={withholding ? "On" : "Off"}
          hint="PAYG withholding setting"
          tone={withholding ? "emerald" : "rose"}
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">Tax scale</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The scale used to calculate PAYG withholding on each pay run. This is a demo
            calculation only &mdash; production lodgements should use an ATO-registered tax table.
          </p>
          <p className="mt-3">
            <Badge tone="amber">{taxScale ?? "Not configured"}</Badge>
          </p>
          <div className="mt-4">
            <Link href="/payroll/tax/payg" className="btn-secondary !py-1.5 text-xs">
              View PAYG records →
            </Link>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">This year</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">PAYG records</dt>
              <dd className="font-medium text-slate-800">{payg._count}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Gross</dt>
              <dd className="font-medium text-slate-800">{formatMoney(gross)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
              <dt className="text-slate-500">Withheld</dt>
              <dd className="font-medium text-slate-800">{formatMoney(withheld)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mt-6">
        <SettingsForm settings={settings} title="tax" />
      </div>
    </div>
  );
}
