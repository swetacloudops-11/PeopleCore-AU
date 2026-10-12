import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR", "PENDING"]).optional(),
  externalAccountId: z.string().max(120).nullish(),
  externalAccountName: z.string().max(160).nullish(),
  scopes: z.array(z.string().max(60)).optional(),
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
  const existing = await prisma.organisationIntegration.findUnique({
    where: { id },
    include: {
      organisation: { select: { name: true } },
      integration: { select: { name: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
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
  const patch: Record<string, unknown> = { ...data };

  if (data.status && data.status !== existing.status) {
    if (data.status === "CONNECTED") {
      patch.connectedAt = new Date();
      patch.errorMessage = null;
      patch.lastSyncStatus = null;
    }
    if (data.status === "DISCONNECTED") {
      patch.connectedAt = null;
      patch.errorMessage = null;
    }
  }

  const updated = await prisma.organisationIntegration.update({
    where: { id },
    data: patch,
  });

  const label = `${existing.integration.name} ↔ '${existing.organisation.name}'`;

  await writeAudit({
    action:
      data.status && data.status !== existing.status
        ? data.status === "CONNECTED"
          ? "INTEGRATION_CONNECTED"
          : data.status === "DISCONNECTED"
          ? "INTEGRATION_DISCONNECTED"
          : "INTEGRATION_MAPPING_UPDATED"
        : "INTEGRATION_MAPPING_UPDATED",
    category: "Integrations",
    severity: data.status === "ERROR" ? "WARNING" : "INFO",
    description:
      data.status && data.status !== existing.status
        ? `${data.status === "CONNECTED" ? "Connected" : "Set"} ${label} — status ${existing.status} → ${data.status}`
        : `Updated mapping ${label}`,
    entityType: "OrganisationIntegration",
    entityId: id,
    organisationId: existing.organisationId,
    metadata: { changes: data },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, mapping: updated });
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
  const existing = await prisma.organisationIntegration.findUnique({
    where: { id },
    include: {
      organisation: { select: { name: true } },
      integration: { select: { name: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
  }

  await prisma.organisationIntegration.delete({ where: { id } });

  await writeAudit({
    action: "INTEGRATION_MAPPING_REMOVED",
    category: "Integrations",
    severity: "WARNING",
    description: `Removed ${existing.integration.name} mapping from '${existing.organisation.name}'`,
    entityType: "OrganisationIntegration",
    entityId: id,
    organisationId: existing.organisationId,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
