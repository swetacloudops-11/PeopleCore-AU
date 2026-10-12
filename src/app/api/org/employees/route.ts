import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional free-text field: empty strings are treated as "not provided". */
const optText = z.union([z.string().trim().max(500), z.literal("")]).optional();
const optDate = z.union([z.string().regex(DATE_RE), z.literal("")]).optional();

const createSchema = z.object({
  employeeNumber: z.string().trim().min(1, "Employee number is required"),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  preferredName: optText,
  workEmail: optText,
  personalEmail: optText,
  phone: optText,
  employmentStatus: z
    .enum(["ACTIVE", "PROBATION", "CASUAL", "CONTRACT", "LEAVE", "TERMINATED"])
    .default("ACTIVE"),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CASUAL", "CONTRACT"])
    .default("FULL_TIME"),
  hireDate: z.string().regex(DATE_RE, "Hire date is required"),
  probationEndDate: optDate,
  departmentId: optText,
  teamId: optText,
  locationId: optText,
  positionId: optText,
  managerId: optText,
  salaryType: z.enum(["ANNUAL", "HOURLY"]).default("ANNUAL"),
  baseSalary: z.coerce.number().min(0).optional(),
  hourlyRate: z.coerce.number().min(0).optional(),
  standardHoursPerWeek: z.coerce.number().min(0).max(80).optional(),
  superFundName: optText,
  superMemberNumber: optText,
  emergencyContactName: optText,
  emergencyContactPhone: optText,
  notes: optText,
});

type CreateInput = z.infer<typeof createSchema>;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Verify that every org-unit / manager reference belongs to this tenant. */
async function refErrors(
  organisationId: string,
  d: {
    departmentId?: string;
    teamId?: string;
    locationId?: string;
    positionId?: string;
    managerId?: string;
  },
  selfId?: string
): Promise<Record<string, string>> {
  const fields: Record<string, string> = {};

  if (d.departmentId) {
    const r = await prisma.department.findFirst({
      where: { id: d.departmentId, organisationId },
      select: { id: true },
    });
    if (!r) fields.departmentId = "Unknown department";
  }
  if (d.teamId) {
    const r = await prisma.team.findFirst({
      where: { id: d.teamId, organisationId },
      select: { id: true },
    });
    if (!r) fields.teamId = "Unknown team";
  }
  if (d.locationId) {
    const r = await prisma.location.findFirst({
      where: { id: d.locationId, organisationId },
      select: { id: true },
    });
    if (!r) fields.locationId = "Unknown location";
  }
  if (d.positionId) {
    const r = await prisma.position.findFirst({
      where: { id: d.positionId, organisationId },
      select: { id: true },
    });
    if (!r) fields.positionId = "Unknown position";
  }
  if (d.managerId) {
    if (selfId && d.managerId === selfId) {
      fields.managerId = "An employee cannot be their own manager";
    } else {
      const r = await prisma.employee.findFirst({
        where: { id: d.managerId, organisationId },
        select: { id: true },
      });
      if (!r) fields.managerId = "Unknown manager";
    }
  }

  return fields;
}

/** Map cleaned schema input onto Prisma create/update data. */
function employeeData(d: CreateInput) {
  return {
    employeeNumber: d.employeeNumber,
    firstName: d.firstName,
    lastName: d.lastName,
    preferredName: d.preferredName || null,
    workEmail: d.workEmail || null,
    personalEmail: d.personalEmail || null,
    phone: d.phone || null,
    employmentStatus: d.employmentStatus,
    employmentType: d.employmentType,
    hireDate: new Date(d.hireDate),
    probationEndDate: d.probationEndDate ? new Date(d.probationEndDate) : null,
    departmentId: d.departmentId || null,
    teamId: d.teamId || null,
    locationId: d.locationId || null,
    positionId: d.positionId || null,
    managerId: d.managerId || null,
    salaryType: d.salaryType,
    ...(d.baseSalary !== undefined ? { baseSalary: d.baseSalary } : {}),
    ...(d.hourlyRate !== undefined ? { hourlyRate: d.hourlyRate } : {}),
    ...(d.standardHoursPerWeek !== undefined
      ? { standardHoursPerWeek: d.standardHoursPerWeek }
      : {}),
    superFundName: d.superFundName || null,
    superMemberNumber: d.superMemberNumber || null,
    emergencyContactName: d.emergencyContactName || null,
    emergencyContactPhone: d.emergencyContactPhone || null,
    notes: d.notes || null,
  };
}

/** GET /api/org/employees — paginated, filterable employee list. */
export async function GET(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "";
  const departmentId = url.searchParams.get("departmentId") ?? "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25));

  const where = {
    organisationId: auth.ctx.organisationId,
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
    ...(status ? { employmentStatus: status as never } : {}),
    ...(departmentId ? { departmentId } : {}),
  };

  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        department: { select: { name: true } },
        team: { select: { name: true } },
        location: { select: { name: true } },
        position: { select: { title: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    employees: employees.map((e) => ({
      ...e,
      baseSalary: Number(e.baseSalary),
      hourlyRate: Number(e.hourlyRate),
      standardHoursPerWeek: Number(e.standardHoursPerWeek),
      manager: e.manager
        ? `${e.manager.firstName} ${e.manager.lastName}`
        : null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/** POST /api/org/employees — create an employee. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;
  const organisationId = auth.ctx.organisationId;

  const refs = await refErrors(organisationId, d);
  if (Object.keys(refs).length > 0) {
    return NextResponse.json({ error: "Invalid references", fields: refs }, { status: 422 });
  }

  const dupe = await prisma.employee.findFirst({
    where: { organisationId, employeeNumber: d.employeeNumber },
    select: { id: true },
  });
  if (dupe) {
    return NextResponse.json(
      { error: "Employee number already in use", fields: { employeeNumber: "Already in use" } },
      { status: 422 }
    );
  }

  let created;
  try {
    created = await prisma.employee.create({
      data: { ...employeeData(d), organisationId },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Employee number already in use", fields: { employeeNumber: "Already in use" } },
        { status: 422 }
      );
    }
    throw err;
  }

  await writeOrgAudit({
    organisationId,
    action: "employee.created",
    category: "people",
    description: `Created employee ${created.firstName} ${created.lastName} (${created.employeeNumber})`,
    entityType: "Employee",
    entityId: created.id,
    metadata: { employeeNumber: created.employeeNumber },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ employee: created }, { status: 201 });
}
