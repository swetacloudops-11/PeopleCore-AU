import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, intParam } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime } from "@/lib/format";

const PAGE_SIZE = 20;

export default async function CompletedTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId } = await employeeContext();
  const page = intParam(sp.page, 1, 500);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [totalRows, rows, completedCount, waivedCount, monthCount] = await Promise.all([
    prisma.onboardingTask.count({
      where: { employeeId: employee.id, organisationId, status: { in: ["COMPLETED", "WAIVED"] } },
    }),
    prisma.onboardingTask.findMany({
      where: { employeeId: employee.id, organisationId, status: { in: ["COMPLETED", "WAIVED"] } },
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { checklist: { select: { name: true } } },
    }),
    prisma.onboardingTask.count({
      where: { employeeId: employee.id, organisationId, status: "COMPLETED" },
    }),
    prisma.onboardingTask.count({
      where: { employeeId: employee.id, organisationId, status: "WAIVED" },
    }),
    prisma.onboardingTask.count({
      where: {
        employeeId: employee.id,
        organisationId,
        status: "COMPLETED",
        completedAt: { gte: monthStart },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const segments = ([
    { label: "Completed", value: completedCount, tone: "emerald" },
    { label: "Waived", value: waivedCount, tone: "slate" },
  ] as DonutSegment[]).filter((s) => s.value > 0);

  const pageHref = (p: number) => `/employee/tasks/completed${p > 1 ? `?page=${p}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Completed tasks"
        subtitle="Tasks you have finished or that were waived · newest first"
        action={{ label: "My tasks", href: "/employee/tasks" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Closed" value={totalRows} hint="Completed or waived" tone="indigo" />
        <StatCard label="Completed" value={completedCount} hint="Signed off by you" tone="emerald" />
        <StatCard label="Waived" value={waivedCount} hint="No longer required" tone="sky" />
        <StatCard label="This month" value={monthCount} hint="Completed since the 1st" tone="emerald" />
      </div>

      {/* ── Completed vs waived ── */}
      {totalRows > 0 && (
        <div className="mt-5">
          <ChartPanel title="Outcomes" subtitle="Completed vs waived tasks">
            <Donut segments={segments} size={140} thickness={16} centerValue={totalRows} centerLabel="closed" />
          </ChartPanel>
        </div>
      )}

      {/* ── Archive table ── */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No completed tasks yet"
            hint="When you mark a task complete it moves into this archive."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Task</th>
                  <th className="th">Stage</th>
                  <th className="th">Category</th>
                  <th className="th">Status</th>
                  <th className="th">Completed</th>
                  <th className="th">Due date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <Link
                        href={`/employee/tasks/${t.id}`}
                        className="font-medium text-slate-800 hover:text-violet-600 hover:underline"
                      >
                        {t.title}
                      </Link>
                      {t.checklist && (
                        <div className="text-[11px] text-slate-400">{t.checklist.name}</div>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={t.stage === "ONBOARDING" ? "purple" : "slate"}>
                        {t.stage === "ONBOARDING" ? "Onboarding" : "Offboarding"}
                      </Badge>
                    </td>
                    <td className="td text-slate-600">{t.category}</td>
                    <td className="td">
                      <Badge tone={t.status === "COMPLETED" ? "green" : "slate"}>{t.status}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {t.completedAt ? formatDateTime(t.completedAt) : "—"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {t.dueDate ? formatDate(t.dueDate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                  {totalRows}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="btn-secondary !py-1.5 text-xs">
                      ← Previous
                    </Link>
                  ) : (
                    <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                      ← Previous
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)} className="btn-secondary !py-1.5 text-xs">
                      Next →
                    </Link>
                  ) : (
                    <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                      Next →
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
