import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  abn: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("").transform(() => null)),
  phone: z.string().nullish(),
  industry: z.string().nullish(),
  addressLine1: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  postcode: z.string().nullish(),
  employeeCount: z.coerce.number().int().min(0).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "PENDING"]).optional(),
  disabledReason: z.string().nullish(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.organisation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
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
  const now = new Date();

  // Enabling/disabling drives the companion fields.
  if (data.status && data.status !== existing.status) {
    if (data.status === "DISABLED") {
      data.disabledReason = data.disabledReason ?? "Disabled by platform administrator";
    }
    if (data.status === "ACTIVE") {
      data.disabledReason = null;
    }
  }

  const patch: Record<string, unknown> = { ...data };
  if (data.status === "DISABLED" && existing.status !== "DISABLED") patch.disabledAt = now;
  if (data.status === "ACTIVE") patch.disabledAt = null;

  // Keep a unique email across organisations.
  if (data.email && data.email !== existing.email) {
    const clash = await prisma.organisation.findFirst({
      where: { email: data.email, NOT: { id } },
    });
    if (clash) {
      return NextResponse.json(
        { error: "Another organisation already uses that email", fields: { email: "Already in use" } },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.organisation.update({ where: { id }, data: patch });

  const changed = Object.keys(data).filter(
    (k) => (existing as unknown as Record<string, unknown>)[k] !== data[k as keyof typeof data]
  );

  await writeAudit({
    action:
      data.status && data.status !== existing.status
        ? data.status === "DISABLED"
          ? "ORG_DISABLED"
          : "ORG_ENABLED"
        : "ORG_UPDATED",
    category: "Organisations",
    severity: data.status === "DISABLED" ? "WARNING" : "INFO",
    description:
      data.status && data.status !== existing.status
        ? `${data.status === "DISABLED" ? "Disabled" : "Enabled"} organisation '${existing.name}'`
        : `Updated organisation '${existing.name}' (${changed.join(", ") || "no field changes"})`,
    entityType: "Organisation",
    entityId: id,
    metadata: { changes: data },
    organisationId: id,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  void session;
  return NextResponse.json({ ok: true, organisation: updated });
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
  const existing = await prisma.organisation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  await prisma.organisation.delete({ where: { id } });

  await writeAudit({
    action: "ORG_DELETED",
    category: "Organisations",
    severity: "WARNING",
    description: `Deleted organisation '${existing.name}' along with its subscriptions, mappings and sync history`,
    entityType: "Organisation",
    entityId: id,
    metadata: { slug: existing.slug, status: existing.status },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
