import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(300).nullish(),
  priceMonthly: z.coerce.number().min(0).optional(),
  priceAnnual: z.coerce.number().min(0).optional(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  maxEmployees: z.coerce.number().int().min(0).optional(),
  maxOrganisations: z.coerce.number().int().min(0).optional(),
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
  features: z.array(z.string().max(120)).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
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
  const updated = await prisma.plan.update({ where: { id }, data });

  await writeAudit({
    action: "PLAN_UPDATED",
    category: "Subscriptions",
    severity: "INFO",
    description: `Updated plan '${existing.name}'`,
    entityType: "Plan",
    entityId: id,
    metadata: {
      changes: data,
      priceChange:
        data.priceMonthly !== undefined && data.priceMonthly !== Number(existing.priceMonthly)
          ? `${existing.priceMonthly} → ${data.priceMonthly}`
          : undefined,
    },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, plan: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if (existing._count.subscriptions > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete — ${existing._count.subscriptions} organisation(s) still subscribe to this plan. Retire it instead by disabling it.`,
      },
      { status: 409 }
    );
  }

  await prisma.plan.delete({ where: { id } });

  await writeAudit({
    action: "PLAN_DELETED",
    category: "Subscriptions",
    severity: "WARNING",
    description: `Deleted plan '${existing.name}' (${existing.code})`,
    entityType: "Plan",
    entityId: id,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
