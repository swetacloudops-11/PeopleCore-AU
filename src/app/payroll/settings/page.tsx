import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import SettingsForm, { type SettingRow } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function PayrollSettingsPage() {
  const { organisationId, org } = await payrollContext();

  const rows = await prisma.orgSetting.findMany({
    where: {
      organisationId,
      OR: [{ group: "payroll" }, { group: "general", key: { startsWith: "pay" } }],
    },
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  const settings: SettingRow[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
    group: s.group,
  }));

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const superRate = byKey.get("super_rate");
  const payDay = byKey.get("pay_day");
  const payslipDelivery = byKey.get("payslip_delivery");
  const stpEnabled = byKey.get("stp_enabled") === "true";

  return (
    <div>
      <PageHeader
        title="Payroll Preferences"
        subtitle={`${org.name} · defaults that drive pay runs, tax, super and payslips`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Payroll settings" value={settings.length} hint="Group: payroll" tone="amber" />
        <StatCard
          label="Toggles"
          value={settings.filter((s) => s.dataType === "boolean").length}
          hint="Boolean switches"
          tone="emerald"
        />
        <StatCard
          label="Numeric"
          value={settings.filter((s) => s.dataType === "number").length}
          hint="Number values"
          tone="indigo"
        />
        <StatCard
          label="Secrets"
          value={settings.filter((s) => s.isSecret).length}
          hint="Masked values"
          tone="sky"
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">At a glance</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Super rate</dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                {superRate ? `${superRate}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Pay day</dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">{payDay ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Payslip delivery</dt>
              <dd className="mt-0.5 text-lg font-semibold capitalize text-slate-900">
                {payslipDelivery ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">STP status</dt>
              <dd className="mt-1">
                <Badge tone={stpEnabled ? "green" : "slate"}>
                  {stpEnabled ? "ENABLED" : "DISABLED"}
                </Badge>
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/payroll/settings/pay-run" className="btn-secondary !py-1.5 text-xs">
              Pay run settings
            </Link>
            <Link href="/payroll/settings/tax" className="btn-secondary !py-1.5 text-xs">
              Tax settings
            </Link>
            <Link href="/payroll/settings/super" className="btn-secondary !py-1.5 text-xs">
              Super settings
            </Link>
            <Link href="/payroll/settings/payslip" className="btn-secondary !py-1.5 text-xs">
              Payslip settings
            </Link>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Scope</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            These preferences apply to every new pay run for {org.name}. Historical payslips keep
            the values they were generated with, so changing a rate never rewrites past pay.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Badge tone="amber">PAYROLL</Badge>
            <span>Changes save as you go.</span>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <SettingsForm settings={settings} title="payroll" />
      </div>
    </div>
  );
}
