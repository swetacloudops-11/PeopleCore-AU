import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { CreatePayRunForm } from "./CreatePayRunForm";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

export default async function NewPayRunPage() {
  const { organisationId, org } = await payrollContext();

  const [schedules, runCount] = await Promise.all([
    prisma.paySchedule.findMany({
      where: { organisationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, frequency: true },
    }),
    prisma.payRun.count({ where: { organisationId } }),
  ]);

  // Suggest a label for the coming week ending on Sunday.
  const daysToSunday = (7 - new Date().getDay()) % 7;
  const suggestedLabel = `Pay run ${runCount + 1} — week ending ${formatDate(D(daysToSunday))}`;

  return (
    <div>
      <Link href="/payroll/pay-runs" className="text-sm text-amber-600 hover:underline">
        ← All pay runs
      </Link>

      <div className="mt-3">
        <PageHeader
          title="Create pay run"
          subtitle={`${org.name} · choose a schedule and period, then calculate to generate lines`}
        />
      </div>

      <div className="max-w-2xl">
        <CreatePayRunForm schedules={schedules} suggestedLabel={suggestedLabel} />
      </div>
    </div>
  );
}
