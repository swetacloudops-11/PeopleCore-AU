import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  planId: z.string().optional(),
  status: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
  cycle: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  seats: z.coerce.number().int().min(1).max(100000).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
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
  const existing = await prisma.organisationSubscription.findUnique({
    where: { id },
    include: { plan: true, organisation: { select: { name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const data = parsed.data;
  const patch: Record<string, unknown> = { ...data };
  const notes: string[] = [];

  // Swapping plan reprices the subscription against the new plan's rates.
  if (data.planId && data.planId !== existing.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
    if (!plan) {
      return NextResponse.json({ error: "Target plan not found" }, { status: 404 });
    }
    patch.amount =
      (data.cycle ?? existing.cycle) === "ANNUAL" ? plan.priceAnnual : plan.priceMonthly;
    notes.push(`plan ${existing.plan.name} → ${plan.name}`);
  } else if (data.cycle && data.cycle !== existing.cycle) {
    patch.amount =
      data.cycle === "ANNUAL" ? existing.plan.priceAnnual : existing.plan.priceMonthly;
    notes.push(`cycle ${existing.cycle} → ${data.cycle}`);
  }

  if (data.status && data.status !== existing.status) {
    notes.push(`status ${existing.status} → ${data.status}`);
  }
  if (data.seats !== undefined && data.seats !== existing.seats) {
    notes.push(`seats ${existing.seats} → ${data.seats}`);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Renewing from a lapsed state restarts the billing period.
  if (data.status === "ACTIVE" && existing.status !== "ACTIVE") {
    patch.currentPeriodStart = new Date();
    patch.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    patch.trialEndsAt = null;
  }

  const updated = await prisma.organisationSubscription.update({
    where: { id },
    data: patch,
    include: { plan: true },
  });

  await writeAudit({
    action: notes.some((n) => n.startsWith("status"))
      ? "SUBSCRIPTION_STATUS_CHANGED"
      : "SUBSCRIPTION_CHANGED",
    category: "Subscriptions",
    severity: data.status === "CANCELLED" ? "WARNING" : "INFO",
    description: `Updated subscription for '${existing.organisation.name}': ${
      notes.join(", ") || "no effective change"
    }`,
    entityType: "OrganisationSubscription",
    entityId: id,
    metadata: { changes: data, amount: String(updated.amount) },
    organisationId: existing.organisationId,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, subscription: updated });
}
