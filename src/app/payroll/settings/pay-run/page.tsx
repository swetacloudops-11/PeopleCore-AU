import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export const dynamic = "force-dynamic";

export default async function PayRunSettingsPage() {
  const { organisationId, org } = await payrollContext();

  const rows = await prisma.orgSetting.findMany({
    where: {
      organisationId,
      OR: [
        { key: { startsWith: "pay_run_" } },
        { key: { in: ["pay_day", "pay_period_lock_day", "rounding"] } },
      ],
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

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const autoCalculate = byKey.get("pay_run_auto_calculate") === "true";
  const lockDay = byKey.get("pay_period_lock_day");
  const rounding = byKey.get("rounding")?.replace(/_/g, " ");
  const payDay = byKey.get("pay_day");

  return (
    <div>
      <PageHeader
        title="Pay Run Settings"
        subtitle={`${org.name} · cadence, locking and rounding for pay run processing`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Pay run settings" value={settings.length} hint="Filtered keys" tone="amber" />
        <StatCard
          label="Auto-calculate"
          value={autoCalculate ? "On" : "Off"}
          hint="Calculate on run creation"
          tone={autoCalculate ? "emerald" : "rose"}
        />
        <StatCard label="Lock after" value={lockDay ? `${lockDay} days` : "—"} hint="Pay period lock" tone="indigo" />
        <StatCard label="Rounding" value={rounding ?? "—"} hint="Amount rounding rule" tone="sky" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Pay day</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The default day pay lands in employee accounts. Individual schedules can override
            this with their own pay day.
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">{payDay ?? "—"}</p>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Period locking</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Once a pay run exists for a period it is treated as locked, so it cannot be
            accidentally double-paid. This window delays locking by the given number of days.
          </p>
          <p className="mt-3">
            <Badge tone="amber">{lockDay ? `${lockDay} day grace` : "Immediate"}</Badge>
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Rounding</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Controls how calculated amounts are rounded before totalling a pay run. Rounding is
            applied per line after tax and super are computed.
          </p>
          <p className="mt-3 text-lg font-semibold capitalize text-slate-900">{rounding ?? "—"}</p>
        </div>
      </div>

      <div className="mt-6">
        <SettingsForm settings={settings} title="pay run" />
      </div>
    </div>
  );
}
