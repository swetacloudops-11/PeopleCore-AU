import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/format";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(160),
  abn: z.string().optional(),
  industry: z.string().optional(),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  employeeCount: z.coerce.number().int().min(0).optional(),
  planCode: z.string().optional(),
  cycle: z.enum(["MONTHLY", "ANNUAL"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
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
  const base = slugify(data.name);
  if (!base) {
    return NextResponse.json(
      { error: "Could not derive a URL slug from that name", fields: { name: "Invalid name" } },
      { status: 422 }
    );
  }

  // Guarantee slug uniqueness.
  let slug = base;
  for (let i = 2; await prisma.organisation.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }

  const email = data.email?.trim();
  if (email) {
    const clash = await prisma.organisation.findFirst({ where: { email } });
    if (clash) {
      return NextResponse.json(
        { error: "An organisation with that email already exists", fields: { email: "Already in use" } },
        { status: 409 }
      );
    }
  }

  const org = await prisma.organisation.create({
    data: {
      name: data.name.trim(),
      slug,
      abn: data.abn?.trim() || null,
      industry: data.industry || null,
      email: email || null,
      phone: data.phone?.trim() || null,
      addressLine1: data.addressLine1?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state || null,
      postcode: data.postcode?.trim() || null,
      employeeCount: data.employeeCount ?? 0,
      status: "ACTIVE",
    },
  });

  // Attach a plan when one was chosen.
  if (data.planCode) {
    const plan = await prisma.plan.findUnique({ where: { code: data.planCode } });
    if (plan) {
      await prisma.organisationSubscription.create({
        data: {
          organisationId: org.id,
          planId: plan.id,
          status: "TRIALING",
          cycle: data.cycle ?? "MONTHLY",
          seats: Math.max(1, Math.ceil((data.employeeCount ?? 1) / 8)),
          trialEndsAt: new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amount: (data.cycle ?? "MONTHLY") === "ANNUAL" ? plan.priceAnnual : plan.priceMonthly,
        },
      });
    }
  }

  await writeAudit({
    action: "ORG_CREATED",
    category: "Organisations",
    severity: "INFO",
    description: `Created organisation '${org.name}'`,
    entityType: "Organisation",
    entityId: org.id,
    metadata: { slug: org.slug, plan: data.planCode ?? null },
    organisationId: org.id,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: org.id, slug: org.slug }, { status: 201 });
}
