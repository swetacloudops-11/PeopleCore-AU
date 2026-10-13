import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

/** Optional free-text field, capped at 120 chars, where "" clears the value. */
const optText = z.union([z.string().trim().max(120), z.literal("")]).optional();

const updateSchema = z.object({
  salaryType: z.enum(["ANNUAL", "HOURLY"]).optional(),
  baseSalary: z.coerce.number().min(0).optional(),
  hourlyRate: z.coerce.number().min(0).optional(),
  standardHoursPerWeek: z.coerce.number().min(0).max(80).optional(),
  superFundName: optText,
  superMemberNumber: optText,
  taxFileNumber: optText,
});

// Fields that become null when the client sends an empty string.
const NULLABLE_TEXT = ["superFundName", "superMemberNumber", "taxFileNumber"];

/**
 * PATCH /api/payroll/employees/[id] — update the payroll-relevant fields only.
 * The employee must belong to the caller's organisation.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { organisationId } = auth.ctx;

  const row = await prisma.employee.findFirst({
    where: { id, organisationId },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
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

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    data[k] = NULLABLE_TEXT.includes(k) && v === "" ? null : v;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No payroll fields supplied" }, { status: 422 });
  }

  const updated = await prisma.employee.update({ where: { id }, data });

  await writeOrgAudit({
    organisationId,
    action: "payroll.employee.updated",
    category: "payroll",
    description: `Updated payroll details for ${updated.firstName} ${updated.lastName} (${updated.employeeNumber})`,
    entityType: "Employee",
    entityId: updated.id,
    metadata: { changed: Object.keys(data) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    employee: {
      id: updated.id,
      salaryType: updated.salaryType,
      baseSalary: Number(updated.baseSalary),
      hourlyRate: Number(updated.hourlyRate),
      standardHoursPerWeek: Number(updated.standardHoursPerWeek),
      superFundName: updated.superFundName,
      superMemberNumber: updated.superMemberNumber,
      tfnOnFile: Boolean(updated.taxFileNumber),
    },
  });
}
