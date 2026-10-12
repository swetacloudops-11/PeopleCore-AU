import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
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

const patchSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60).optional(),
  code: z.string().trim().min(2, "Code is required").max(30).optional(),
  type: z.enum(CATEGORY_TYPES).optional(),
  isTaxable: z.boolean().optional(),
  isSuperable: z.boolean().optional(),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(100000).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
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
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** PATCH /api/org/pay-categories/[id] — edit or toggle a pay category. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const existing = await prisma.payCategory.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
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
        ...(d.isTaxable !== undefined ? { isTaxable: d.isTaxable } : {}),
        ...(d.isSuperable !== undefined ? { isSuperable: d.isSuperable } : {}),
        ...(d.rate !== undefined ? { rate: d.rate } : {}),
        ...(d.unit !== undefined ? { unit: d.unit } : {}),
        ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "pay_category.updated",
      category: "payroll",
      description: `Updated pay category "${category.name}" (${category.code})`,
      entityType: "PayCategory",
      entityId: id,
      metadata: { isActive: category.isActive, rate: Number(category.rate) },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ category });
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

/** DELETE /api/org/pay-categories/[id] — remove a pay category. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const existing = await prisma.payCategory.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "Pay category not found" }, { status: 404 });
  }

  await prisma.payCategory.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "pay_category.deleted",
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
