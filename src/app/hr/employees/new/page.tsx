import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { EmployeeForm, type HrOptions } from "../EmployeeForm";

export default async function NewEmployeePage() {
  const { organisationId, org } = await hrContext();

  const [departments, teams, locations, positions, managers] = await Promise.all([
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
  ]);

  const options: HrOptions = {
    departments,
    teams,
    locations,
    positions: positions.map((p) => ({ id: p.id, name: p.title })),
    managers: managers.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` })),
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/hr/employees" className="text-xs font-medium text-sky-600 hover:underline">
          ← Back to employees
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Add employee
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a new employee record for {org.name}. Fields marked by validation must be completed.
        </p>
      </div>

      <div className="card max-w-4xl p-5">
        <EmployeeForm options={options} />
      </div>
    </div>
  );
}
