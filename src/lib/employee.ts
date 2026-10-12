import "server-only";
import { redirect } from "next/navigation";
import { requireOrgSession, homeFor, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The employee console is data-scoped: an account can use it when it belongs
 * to an organisation AND has an Employee record linked to it (Employee.userId).
 * Every query in /employee is then scoped to that single employee.
 */
export async function canUseEmployeeConsole(session: SessionUser): Promise<boolean> {
  if (!session.organisationId) return false;
  const emp = await prisma.employee.findFirst({
    where: { organisationId: session.organisationId, userId: session.id },
    select: { id: true },
  });
  return Boolean(emp);
}

export type EmployeeContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
  org: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    city: string | null;
    state: string | null;
  };
  /** The signed-in person's own employee record — the scope for every query. */
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    workEmail: string | null;
    personalEmail: string | null;
    phone: string | null;
    dateOfBirth: Date | null;
    employmentStatus: string;
    employmentType: string;
    hireDate: Date;
    salaryType: string;
    baseSalary: string; // Decimal as string
    hourlyRate: string;
    standardHoursPerWeek: string;
    superFundName: string | null;
    superMemberNumber: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    taxFileNumber: string | null;
    departmentName: string | null;
    teamName: string | null;
    locationName: string | null;
    positionTitle: string | null;
    managerName: string | null;
  };
};

/**
 * Every /employee page must call this first. Resolves the session, verifies an
 * employee profile is linked, and returns the person-scoped context.
 */
export async function employeeContext(): Promise<EmployeeContext> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) redirect("/login");

  const row = await prisma.employee.findFirst({
    where: { organisationId: session.organisationId, userId: session.id },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      workEmail: true,
      personalEmail: true,
      phone: true,
      dateOfBirth: true,
      employmentStatus: true,
      employmentType: true,
      hireDate: true,
      salaryType: true,
      baseSalary: true,
      hourlyRate: true,
      standardHoursPerWeek: true,
      superFundName: true,
      superMemberNumber: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      taxFileNumber: true,
      department: { select: { name: true } },
      team: { select: { name: true } },
      location: { select: { name: true } },
      position: { select: { title: true } },
      manager: { select: { firstName: true, lastName: true } },
    },
  });

  if (!row) redirect(homeFor(session));

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: { id: true, name: true, slug: true, status: true, industry: true, city: true, state: true },
  });
  if (!org) redirect("/login");
  if (org.status === "DISABLED") redirect("/login?error=organisation_disabled");

  return {
    session,
    organisationId: session.organisationId,
    org: { id: org.id, name: org.name, slug: org.slug, industry: org.industry, city: org.city, state: org.state },
    employee: {
      id: row.id,
      employeeNumber: row.employeeNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      preferredName: row.preferredName,
      workEmail: row.workEmail,
      personalEmail: row.personalEmail,
      phone: row.phone,
      dateOfBirth: row.dateOfBirth,
      employmentStatus: row.employmentStatus,
      employmentType: row.employmentType,
      hireDate: row.hireDate,
      salaryType: row.salaryType,
      baseSalary: row.baseSalary.toString(),
      hourlyRate: row.hourlyRate.toString(),
      standardHoursPerWeek: row.standardHoursPerWeek.toString(),
      superFundName: row.superFundName,
      superMemberNumber: row.superMemberNumber,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      taxFileNumber: row.taxFileNumber,
      departmentName: row.department?.name ?? null,
      teamName: row.team?.name ?? null,
      locationName: row.location?.name ?? null,
      positionTitle: row.position?.title ?? null,
      managerName: row.manager ? `${row.manager.firstName} ${row.manager.lastName}` : null,
    },
  };
}

/** Shared, side-effect-free query helpers (same semantics as the other consoles). */
export { intParam, strParam, qs } from "@/lib/org";
