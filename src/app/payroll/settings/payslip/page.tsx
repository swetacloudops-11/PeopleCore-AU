import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export const dynamic = "force-dynamic";

export default async function PayslipSettingsPage() {
  const { organisationId, org } = await payrollContext();

  const rows = await prisma.orgSetting.findMany({
    where: {
      organisationId,
      key: { in: ["payslip_footer", "payslip_delivery", "payslip_show_hours"] },
    },
    orderBy: { key: "asc" },
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

  const footer = rows.find((r) => r.key === "payslip_footer")?.value;
  const delivery = rows.find((r) => r.key === "payslip_delivery")?.value;
  const showHours = rows.find((r) => r.key === "payslip_show_hours")?.value === "true";

  return (
    <div>
      <PageHeader
        title="Payslip Settings"
        subtitle={`${org.name} · how payslips are delivered and what they show`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Payslip settings" value={settings.length} hint="Delivery & display" tone="amber" />
        <StatCard
          label="Delivery"
          value={delivery ? delivery.charAt(0).toUpperCase() + delivery.slice(1) : "—"}
          hint="How staff receive payslips"
          tone="indigo"
        />
        <StatCard
          label="Show hours"
          value={showHours ? "Yes" : "No"}
          hint="Hours on payslip lines"
          tone={showHours ? "emerald" : "sky"}
        />
        <StatCard
          label="Footer"
          value={footer ? "Set" : "None"}
          hint="Note printed on payslips"
          tone="sky"
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Preview</h2>
            <Badge tone="amber">PAYSLIP</Badge>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{org.name}</p>
                <p className="text-[11px] text-slate-500">
                  ABN {org.abn ?? "—"} {org.city ? `· ${org.city}` : ""} {org.state ? org.state : ""}
                </p>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <p className="font-semibold text-slate-700">Payslip</p>
                <p>Period 01 Jul – 14 Jul</p>
                <p>Pay date 18 Jul</p>
              </div>
            </div>

            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Employee</dt>
                <dd className="font-medium text-slate-800">Sample Employee · EMP-0001</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Gross pay</dt>
                <dd className="font-medium text-slate-800">$3,200.00</dd>
              </div>
              {showHours && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Ordinary hours</dt>
                  <dd className="font-medium text-slate-800">76.00 h</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">PAYG withheld</dt>
                <dd className="font-medium text-slate-800">−$800.00</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                <dt className="text-slate-500">Net pay</dt>
                <dd className="font-semibold text-slate-900">$2,400.00</dd>
              </div>
            </dl>

            {footer && (
              <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">{footer}</p>
            )}
          </div>
        </div>

        <div>
          <SettingsForm settings={settings} title="payslips" />
        </div>
      </section>
    </div>
  );
}
