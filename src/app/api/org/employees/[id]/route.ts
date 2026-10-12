import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const optText = z.union([z.string().trim().max(500), z.literal("")]).optional();
const optDate = z.union([z.string().regex(DATE_RE), z.literal("")]).optional();

const updateSchema = z.object({
  employeeNumber: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  preferredName: optText,
  workEmail: optText,
  personalEmail: optText,
  phone: optText,
  employmentStatus: z
    .enum(["ACTIVE", "PROBATION", "CASUAL", "CONTRACT", "LEAVE", "TERMINATED"])
    .optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CASUAL", "CONTRACT"]).optional(),
  hireDate: z.string().regex(DATE_RE).optional(),
  probationEndDate: optDate,
  terminationDate: optDate,
  terminationReason: optText,
  departmentId: optText,
  teamId: optText,
  locationId: optText,
  positionId: optText,
  managerId: optText,
  salaryType: z.enum(["ANNUAL", "HOURLY"]).optional(),
  baseSalary: z.coerce.number().min(0).optional(),
  hourlyRate: z.coerce.number().min(0).optional(),
  standardHoursPerWeek: z.coerce.number().min(0).max(80).optional(),
  superFundName: optText,
  superMemberNumber: optText,
  emergencyContactName: optText,
  emergencyContactPhone: optText,
  notes: optText,
});

type UpdateInput = z.infer<typeof updateSchema>;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

async function refErrors(
  organisationId: string,
  d: UpdateInput,
  selfId: string
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
    if (d.managerId === selfId) {
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

/** PATCH /api/org/employees/[id] — update or terminate an employee. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const row = await prisma.employee.findFirst({
    where: { id, organisationId },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
  });
  if (!row) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const refs = await refErrors(organisationId, d, id);
  if (Object.keys(refs).length > 0) {
    return NextResponse.json({ error: "Invalid references", fields: refs }, { status: 422 });
  }

  if (d.employeeNumber && d.employeeNumber !== row.employeeNumber) {
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
  }

  // Strip empty strings → null where the schema allows "" as a clearing value.
  const data: Record<string, unknown> = {};
  const nullable = [
    "preferredName", "workEmail", "personalEmail", "phone", "probationEndDate",
    "terminationDate", "terminationReason", "departmentId", "teamId", "locationId",
    "positionId", "managerId", "superFundName", "superMemberNumber",
    "emergencyContactName", "emergencyContactPhone", "notes",
  ];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    if (nullable.includes(k)) {
      data[k] = v === "" ? null : k.endsWith("Date") ? new Date(v as string) : v;
    } else if (k === "hireDate") {
      data[k] = new Date(v as string);
    } else {
      data[k] = v;
    }
  }

  // Terminating without an explicit date defaults to today.
  if (data.employmentStatus === "TERMINATED" && !data.terminationDate) {
    data.terminationDate = new Date();
  }
  // Leaving termination state clears the old values.
  if (data.employmentStatus && data.employmentStatus !== "TERMINATED") {
    if (data.terminationDate === undefined) data.terminationDate = null;
    if (data.terminationReason === undefined) data.terminationReason = null;
  }

  let updated;
  try {
    updated = await prisma.employee.update({ where: { id }, data });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Employee number already in use", fields: { employeeNumber: "Already in use" } },
        { status: 422 }
      );
    }
    throw err;
  }

  const terminated = data.employmentStatus === "TERMINATED";
  await writeOrgAudit({
    organisationId,
    action: terminated ? "employee.terminated" : "employee.updated",
    category: "people",
    severity: terminated ? "WARNING" : "INFO",
    description: terminated
      ? `Terminated ${updated.firstName} ${updated.lastName} (${updated.employeeNumber})`
      : `Updated employee ${updated.firstName} ${updated.lastName} (${updated.employeeNumber})`,
    entityType: "Employee",
    entityId: updated.id,
    metadata: { changed: Object.keys(data) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ employee: updated });
}

/** DELETE /api/org/employees/[id] — remove an employee record. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const row = await prisma.employee.findFirst({
    where: { id, organisationId },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  });
  if (!row) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  await prisma.employee.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "employee.deleted",
    category: "people",
    severity: "WARNING",
    description: `Deleted employee ${row.firstName} ${row.lastName} (${row.employeeNumber})`,
    entityType: "Employee",
    entityId: row.id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
