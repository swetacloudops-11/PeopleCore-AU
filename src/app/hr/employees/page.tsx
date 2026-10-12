import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate, initials } from "@/lib/format";
import { EmployeeRowActions } from "./EmployeeActions";
import type { HrOptions, HrEmployeeRow } from "./EmployeeForm";

/** Chart palette — distinct from Badge tones. */
const CHART_TONE: Record<string, "emerald" | "sky" | "amber" | "rose" | "violet" | "slate"> = {
  ACTIVE: "emerald",
  PROBATION: "sky",
  CASUAL: "sky",
  CONTRACT: "violet",
  LEAVE: "amber",
  TERMINATED: "slate",
};

const PAGE_SIZE = 25;

const STATUS_CHIPS = ["ALL", "ACTIVE", "PROBATION", "CASUAL", "CONTRACT", "LEAVE", "TERMINATED"] as const;

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green",
  PROBATION: "blue",
  CASUAL: "purple",
  CONTRACT: "amber",
  LEAVE: "blue",
  TERMINATED: "red",
};

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CASUAL: "Casual",
  CONTRACT: "Contract",
};

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

type Row = HrEmployeeRow & {
  positionTitle: string | null;
  departmentName: string | null;
  teamName: string | null;
  locationName: string | null;
};

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; department?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const q = strParam(sp.q);
  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const departmentId = strParam(sp.department);
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { employeeNumber: { contains: q, mode: "insensitive" as const } },
            { workEmail: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status !== "ALL" ? { employmentStatus: status as never } : {}),
    ...(departmentId ? { departmentId } : {}),
  };

  const [
    total,
    active,
    onLeave,
    terminated,
    newStarters,
    totalRows,
    employees,
    departments,
    teams,
    locations,
    positions,
    managerOptions,
    statusBreakdown,
    byDepartment,
  ] = await Promise.all([
    prisma.employee.count({ where: { organisationId } }),
    prisma.employee.count({ where: { organisationId, employmentStatus: "ACTIVE" } }),
    prisma.employee.count({ where: { organisationId, employmentStatus: "LEAVE" } }),
    prisma.employee.count({ where: { organisationId, employmentStatus: "TERMINATED" } }),
    prisma.employee.count({ where: { organisationId, hireDate: { gte: D(-30) } } }),
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        department: { select: { name: true } },
        team: { select: { name: true } },
        location: { select: { name: true } },
        position: { select: { title: true } },
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.team.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.position.findMany({
      where: { organisationId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.employee.groupBy({
      by: ["employmentStatus"],
      where: { organisationId },
      _count: true,
    }),
    prisma.employee.groupBy({
      by: ["departmentId"],
      where: { organisationId, departmentId: { not: null } },
      _count: true,
      orderBy: { _count: { departmentId: "desc" } },
      take: 8,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const options: HrOptions = {
    departments,
    teams,
    locations,
    positions: positions.map((p) => ({ id: p.id, name: p.title })),
    managers: managerOptions.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` })),
  };

  // Plain serialisable rows — Decimal columns are converted with Number().
  const rows: Row[] = employees.map((e) => ({
    id: e.id,
    employeeNumber: e.employeeNumber,
    firstName: e.firstName,
    lastName: e.lastName,
    preferredName: e.preferredName,
    workEmail: e.workEmail,
    personalEmail: e.personalEmail,
    phone: e.phone,
    dateOfBirth: e.dateOfBirth ? e.dateOfBirth.toISOString() : null,
    gender: e.gender,
    taxFileNumber: e.taxFileNumber,
    employmentStatus: e.employmentStatus,
    employmentType: e.employmentType,
    hireDate: e.hireDate.toISOString(),
    probationEndDate: e.probationEndDate ? e.probationEndDate.toISOString() : null,
    terminationDate: e.terminationDate ? e.terminationDate.toISOString() : null,
    terminationReason: e.terminationReason,
    departmentId: e.departmentId,
    teamId: e.teamId,
    locationId: e.locationId,
    positionId: e.positionId,
    managerId: e.managerId,
    salaryType: e.salaryType,
    baseSalary: Number(e.baseSalary),
    hourlyRate: Number(e.hourlyRate),
    standardHoursPerWeek: Number(e.standardHoursPerWeek),
    superFundName: e.superFundName,
    superMemberNumber: e.superMemberNumber,
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: e.emergencyContactPhone,
    notes: e.notes,
    positionTitle: e.position?.title ?? null,
    departmentName: e.department?.name ?? null,
    teamName: e.team?.name ?? null,
    locationName: e.location?.name ?? null,
  }));

  const segments = (
    statusBreakdown
      .map((s) => ({
        label: s.employmentStatus.replace("_", " "),
        value: s._count,
        tone: CHART_TONE[s.employmentStatus] ?? "slate",
      }))
      .sort((a, b) => b.value - a.value) as DonutSegment[]
  );

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/employees${qs({ q, status, department: departmentId, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            All employees
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {total} employees on record
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/hr/employees/details" className="btn-secondary">
            Employee details
          </Link>
          <Link href="/hr/employees/new" className="btn-primary">
            + Add employee
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total" value={total} hint="All employee records" tone="sky" />
        <StatCard label="Active" value={active} hint={`${total - active} not active`} tone="emerald" />
        <StatCard label="On leave" value={onLeave} hint="Currently on leave" tone="amber" />
        <StatCard label="Terminated" value={terminated} hint="Historical records" tone="rose" />
        <StatCard label="New starters" value={newStarters} hint="Hired in last 30 days" tone="sky" />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Workforce by status" subtitle="All employee records">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={total}
            centerLabel="employees"
          />
        </ChartPanel>

        <ChartPanel
          title="Headcount by department"
          subtitle="Active and inactive records"
          action={
            <Link href="/hr/reports/headcount" className="text-[11px] text-sky-600 hover:underline">
              Report →
            </Link>
          }
        >
          <BarList
            items={byDepartment.map((d) => ({
              label: departments.find((x) => x.id === d.departmentId)?.name ?? "Unassigned",
              value: d._count,
              href: `/hr/employees?department=${d.departmentId}`,
            }))}
            valueFormat={(v) => String(v)}
          />
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/hr/employees" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, number or email…"
            className="input !w-64"
          />
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          {departmentId && <input type="hidden" name="department" value={departmentId} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <form action="/hr/employees" method="get" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <select name="department" defaultValue={departmentId} className="input !w-48">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        <div className="ml-auto flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((s) => {
            const activeChip = status === s;
            return (
              <Link
                key={s}
                href={pageHref({ status: s, page: 1 })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeChip
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Employee table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No employees match these filters"
            hint="Try a different search term or clear the status and department filters."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Job</th>
                  <th className="th">Department</th>
                  <th className="th">Team</th>
                  <th className="th">Location</th>
                  <th className="th">Type</th>
                  <th className="th">Status</th>
                  <th className="th">Hired</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-600">
                          {initials(`${e.firstName} ${e.lastName}`)}
                        </span>
                        <div>
                          <Link
                            href={`/hr/employees/${e.id}`}
                            className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                          >
                            {e.firstName} {e.lastName}
                          </Link>
                          <div className="text-[11px] text-slate-400">
                            {e.employeeNumber}
                            {e.workEmail ? ` · ${e.workEmail}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <div className="text-slate-700">{e.positionTitle ?? "—"}</div>
                      <div className="text-[11px] text-slate-400">
                        {TYPE_LABEL[e.employmentType] ?? e.employmentType}
                      </div>
                    </td>
                    <td className="td text-slate-600">{e.departmentName ?? "—"}</td>
                    <td className="td text-slate-600">{e.teamName ?? "—"}</td>
                    <td className="td text-slate-600">{e.locationName ?? "—"}</td>
                    <td className="td text-slate-600">
                      {TYPE_LABEL[e.employmentType] ?? e.employmentType}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[e.employmentStatus] ?? "slate"}>
                        {e.employmentStatus}
                      </Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(e.hireDate)}</td>
                    <td className="td">
                      <EmployeeRowActions employee={e} options={options} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
                {q || status !== "ALL" || departmentId ? " (filtered)" : ""}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
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
                  <Link href={pageHref({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
