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

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  code: z.string().trim().min(2, "Code is required").max(20),
  type: z.enum(CATEGORY_TYPES),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(9999),
  unit: z.enum(CATEGORY_UNITS),
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

const isType = (value: string): value is (typeof CATEGORY_TYPES)[number] =>
  (CATEGORY_TYPES as readonly string[]).includes(value);

/** GET /api/payroll/categories?type=ORDINARY — categories for the tenant. */
export async function GET(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;

  const typeParam = new URL(req.url).searchParams.get("type") ?? "";
  const type = isType(typeParam) ? typeParam : null;

  const categories = await prisma.payCategory.findMany({
    where: { organisationId: auth.ctx.organisationId, ...(type ? { type } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ categories });
}

/** POST /api/payroll/categories — create a pay category. */
export async function POST(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
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
        rate: d.rate,
        unit: d.unit,
        isTaxable: d.isTaxable ?? true,
        isSuperable: d.isSuperable ?? true,
        isActive: d.isActive ?? true,
        appliesTo: d.appliesTo && d.appliesTo.length > 0 ? d.appliesTo : "ALL",
        sortOrder: d.sortOrder ?? 0,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "payroll.category.created",
      category: "payroll",
      description: `Created pay category "${category.name}" (${category.code})`,
      entityType: "PayCategory",
      entityId: category.id,
      metadata: { type: category.type, rate: Number(category.rate) },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, item: category }, { status: 201 });
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
