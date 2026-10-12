import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  provider: z.string().min(2).max(80).optional(),
  category: z.enum(["ACCOUNTING", "BANKING", "PAYROLL", "HRIS", "IDENTITY", "CUSTOM"]).optional(),
  description: z.string().max(400).nullish(),
  websiteUrl: z.string().url().nullish().or(z.literal("").transform(() => null)),
  docsUrl: z.string().url().nullish().or(z.literal("").transform(() => null)),
  isOfficial: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
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
  const existing = await prisma.integration.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
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
  const updated = await prisma.integration.update({ where: { id }, data });

  await writeAudit({
    action: data.status && data.status !== existing.status ? "INTEGRATION_STATUS_CHANGED" : "INTEGRATION_UPDATED",
    category: "Integrations",
    severity: "INFO",
    description:
      data.status && data.status !== existing.status
        ? `Integration '${existing.name}' status ${existing.status} → ${data.status}`
        : `Updated integration '${existing.name}'`,
    entityType: "Integration",
    entityId: id,
    metadata: { changes: data },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, integration: updated });
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
  const existing = await prisma.integration.findUnique({
    where: { id },
    include: { _count: { select: { mappings: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  if (existing._count.mappings > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete — ${existing._count.mappings} organisation(s) are mapped to it. Set it to INACTIVE instead.`,
      },
      { status: 409 }
    );
  }

  await prisma.integration.delete({ where: { id } });

  await writeAudit({
    action: "INTEGRATION_DELETED",
    category: "Integrations",
    severity: "WARNING",
    description: `Deleted integration '${existing.name}'`,
    entityType: "Integration",
    entityId: id,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
