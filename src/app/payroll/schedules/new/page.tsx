import { PageHeader } from "@/components/ui";
import { payrollContext } from "@/lib/payroll";
import ScheduleForm from "../ScheduleForm";

export const dynamic = "force-dynamic";

export default async function NewPaySchedulePage() {
  const { org } = await payrollContext();

  return (
    <div>
      <PageHeader
        title="Create Pay Schedule"
        subtitle={`${org.name} · choose the cadence, pay day and starting run date`}
      />

      <div className="card max-w-2xl p-5 sm:p-6">
        <ScheduleForm />
      </div>

      <div className="mt-4 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        A schedule only sets the cadence. Pay runs are still created and approved from
        the Pay Runs module.
      </div>
    </div>
  );
}
