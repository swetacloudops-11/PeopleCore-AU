import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, BarList } from "@/components/charts";
import { daysFromNow } from "@/lib/format";

const EXPIRING_WINDOW_DAYS = 60;

export default async function EmployeeDocumentsPage() {
  const { organisationId } = await hrContext();

  const [groups, confidentialGroups, expiredGroups, expiringGroups, employees, totalDocs] =
    await Promise.all([
      prisma.employeeDocument.groupBy({
        by: ["employeeId"],
        where: { organisationId },
        _count: true,
      }),
      prisma.employeeDocument.groupBy({
        by: ["employeeId"],
        where: { organisationId, isConfidential: true },
        _count: true,
      }),
      prisma.employeeDocument.groupBy({
        by: ["employeeId"],
        where: { organisationId, expiryDate: { lt: daysFromNow(0) } },
        _count: true,
      }),
      prisma.employeeDocument.groupBy({
        by: ["employeeId"],
        where: {
          organisationId,
          expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
        },
        _count: true,
      }),
      prisma.employee.findMany({
        where: { organisationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          department: { select: { name: true } },
        },
      }),
      prisma.employeeDocument.count({ where: { organisationId } }),
    ]);

  const confMap = new Map(confidentialGroups.map((r) => [r.employeeId, r._count]));
  const expMap = new Map(expiredGroups.map((r) => [r.employeeId, r._count]));
  const soonMap = new Map(expiringGroups.map((r) => [r.employeeId, r._count]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  const rows = groups
    .map((g) => {
      const emp = empById.get(g.employeeId);
      return {
        id: g.employeeId,
        name: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown employee",
        employeeNumber: emp?.employeeNumber ?? "—",
        department: emp?.department?.name ?? null,
        total: g._count,
        confidential: confMap.get(g.employeeId) ?? 0,
        expired: expMap.get(g.employeeId) ?? 0,
        expiring: soonMap.get(g.employeeId) ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const confidentialTotal = rows.reduce((a, r) => a + r.confidential, 0);
  const expiredTotal = rows.reduce((a, r) => a + r.expired, 0);

  return (
    <div>
      <PageHeader
        title="Employee documents"
        subtitle="Documents grouped by employee, with coverage and compliance counts."
        action={{ label: "Upload documents", href: "/hr/documents/upload" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees covered" value={rows.length} hint="Holding at least one document" tone="sky" />
        <StatCard label="Documents" value={totalDocs} hint="Across all employees" tone="indigo" />
        <StatCard label="Confidential" value={confidentialTotal} hint="Restricted records" tone="amber" />
        <StatCard
          label="Expired"
          value={expiredTotal}
          hint="Past their expiry date"
          tone={expiredTotal ? "rose" : "emerald"}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-5">
          <ChartPanel title="Most documented employees" subtitle="Records on file per person">
            <BarList
              items={rows.slice(0, 8).map((r) => ({
                label: r.name,
                value: r.total,
                hint: `${r.confidential} confidential · ${r.expired} expired`,
                href: `/hr/employees/${r.id}`,
              }))}
              valueFormat={(v) => String(v)}
            />
          </ChartPanel>
        </div>
      )}

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No documents recorded yet"
            hint="Documents will appear here, grouped by employee, once they are recorded."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Department</th>
                <th className="th">Documents</th>
                <th className="th">Confidential</th>
                <th className="th">Expiring ≤60d</th>
                <th className="th">Expired</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/hr/employees/${r.id}`}
                      className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="text-[11px] text-slate-400">{r.employeeNumber}</div>
                  </td>
                  <td className="td text-slate-600">{r.department ?? "—"}</td>
                  <td className="td">
                    <Badge tone="blue">{r.total}</Badge>
                  </td>
                  <td className="td">
                    {r.confidential > 0 ? (
                      <Badge tone="purple">{r.confidential}</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td">
                    {r.expiring > 0 ? (
                      <Badge tone="amber">{r.expiring}</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td">
                    {r.expired > 0 ? (
                      <Badge tone="red">{r.expired}</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td text-right">
                    <Link
                      href={`/hr/documents?employee=${r.id}`}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      View documents
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
