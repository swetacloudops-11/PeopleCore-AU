import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullish(),
  priceMonthly: z.coerce.number().min(0),
  priceAnnual: z.coerce.number().min(0),
  currency: z.string().length(3).default("AUD"),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
  maxEmployees: z.coerce.number().int().min(0).default(0),
  maxOrganisations: z.coerce.number().int().min(0).default(0),
  trialDays: z.coerce.number().int().min(0).max(365).default(14),
  features: z.array(z.string().max(120)).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const code = data.code.trim().toUpperCase().replace(/\s+/g, "-");

  const clash = await prisma.plan.findUnique({ where: { code } });
  if (clash) {
    return NextResponse.json(
      { error: "A plan with that code already exists", fields: { code: "Already in use" } },
      { status: 409 }
    );
  }

  const plan = await prisma.plan.create({ data: { ...data, code } });

  await writeAudit({
    action: "PLAN_CREATED",
    category: "Subscriptions",
    severity: "INFO",
    description: `Created plan '${plan.name}' (${code}) at ${data.priceMonthly}/mo`,
    entityType: "Plan",
    entityId: plan.id,
    metadata: { code, priceMonthly: data.priceMonthly },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: plan.id }, { status: 201 });
}
