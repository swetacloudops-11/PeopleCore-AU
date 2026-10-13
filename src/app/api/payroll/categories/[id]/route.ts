import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

const CATEGORY_TYPES = [
  "ORDINARY",
  "OVERTIME",
  "ALLOWANCE",
  "BONUS",
  "SUPER",
  "TAX",
  "DEDUCTION",
  "REIMBURSEMENT",
] as const;

const CATEGORY_UNITS = [
  "AMOUNT",
  "HOURS",
  "PERCENT",
  "MULTIPLIER",
  "PER_KM",
  "PER_DAY",
] as const;

const patchSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80).optional(),
  code: z.string().trim().min(2, "Code is required").max(20).optional(),
  type: z.enum(CATEGORY_TYPES).optional(),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(9999).optional(),
  unit: z.enum(CATEGORY_UNITS).optional(),
  isTaxable: z.boolean().optional(),
  isSuperable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  appliesTo: z.string().trim().max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Invalid payload", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** PATCH /api/payroll/categories/[id] — edit or toggle a pay category. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const { id } = await params;
  const existing = await prisma.payCategory.findFirst({ where: { id, organisationId } });
  if (!existing) {
    return NextResponse.json({ error: "Pay category not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  try {
    const category = await prisma.payCategory.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.code !== undefined ? { code: d.code.toUpperCase() } : {}),
        ...(d.type !== undefined ? { type: d.type } : {}),
        ...(d.rate !== undefined ? { rate: d.rate } : {}),
        ...(d.unit !== undefined ? { unit: d.unit } : {}),
        ...(d.isTaxable !== undefined ? { isTaxable: d.isTaxable } : {}),
        ...(d.isSuperable !== undefined ? { isSuperable: d.isSuperable } : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
        ...(d.appliesTo !== undefined ? { appliesTo: d.appliesTo } : {}),
        ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "payroll.category.updated",
      category: "payroll",
      description: `Updated pay category "${category.name}" (${category.code})`,
      entityType: "PayCategory",
      entityId: id,
      metadata: { isActive: category.isActive, rate: Number(category.rate) },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, item: category });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error: "A pay category with this code already exists",
          fields: { code: "Already in use" },
        },
        { status: 422 }
      );
    }
    throw err;
  }
}

/** DELETE /api/payroll/categories/[id] — remove a pay category. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const { id } = await params;
  const existing = await prisma.payCategory.findFirst({ where: { id, organisationId } });
  if (!existing) {
    return NextResponse.json({ error: "Pay category not found" }, { status: 404 });
  }

  await prisma.payCategory.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "payroll.category.deleted",
    category: "payroll",
    severity: "WARNING",
    description: `Deleted pay category "${existing.name}" (${existing.code})`,
    entityType: "PayCategory",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
