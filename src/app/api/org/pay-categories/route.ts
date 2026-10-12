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

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  code: z.string().trim().min(2, "Code is required").max(30),
  type: z.enum(CATEGORY_TYPES),
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

/** POST /api/org/pay-categories — create a pay category. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  try {
    const category = await prisma.payCategory.create({
      data: {
        organisationId,
        name: d.name,
        code: d.code.toUpperCase(),
        type: d.type,
        isTaxable: d.isTaxable ?? true,
        isSuperable: d.isSuperable ?? false,
        rate: d.rate ?? 0,
        unit: d.unit ?? "AMOUNT",
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive ?? true,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "pay_category.created",
      category: "payroll",
      description: `Created pay category "${category.name}" (${category.code})`,
      entityType: "PayCategory",
      entityId: category.id,
      metadata: { type: category.type, rate: Number(category.rate) },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ category }, { status: 201 });
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
