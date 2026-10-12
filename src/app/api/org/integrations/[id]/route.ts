import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR", "PENDING"]).optional(),
  externalAccountName: z.string().max(120).nullish(),
});

/**
 * Loads this organisation's mapping only — a mapping owned by another tenant
 * is indistinguishable from one that does not exist (404).
 */
async function loadMapping(id: string, organisationId: string) {
  const mapping = await prisma.organisationIntegration.findUnique({
    where: { id },
    include: { integration: { select: { name: true, key: true } } },
  });
  if (!mapping || mapping.organisationId !== organisationId) return null;
  return mapping;
}

/** PATCH /api/org/integrations/[id] — connect / disconnect / rename account. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await loadMapping(id, organisationId);
  if (!existing) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const { status, externalAccountName } = parsed.data;
  const now = new Date();

  await prisma.organisationIntegration.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(externalAccountName !== undefined
        ? { externalAccountName: externalAccountName?.trim() || null }
        : {}),
      ...(status === "CONNECTED"
        ? { connectedAt: existing.connectedAt ?? now, errorMessage: null }
        : {}),
      ...(status === "DISCONNECTED" ? { errorMessage: null } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: status === "DISCONNECTED" ? "ORG_INTEGRATION_DISCONNECTED" : "ORG_INTEGRATION_UPDATED",
    category: "Integrations",
    severity: status === "DISCONNECTED" ? "WARNING" : "INFO",
    description: `${status === "DISCONNECTED" ? "Disconnected" : "Updated"} '${existing.integration.name}' (${existing.status}${status ? ` → ${status}` : ""})`,
    entityType: "OrganisationIntegration",
    entityId: id,
    metadata: { from: existing.status, to: status ?? existing.status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: status ?? existing.status });
}

/** DELETE /api/org/integrations/[id] — remove this org's mapping only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await loadMapping(id, organisationId);
  if (!existing) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  await prisma.organisationIntegration.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "ORG_INTEGRATION_REMOVED",
    category: "Integrations",
    severity: "WARNING",
    description: `Removed mapping for '${existing.integration.name}'`,
    entityType: "OrganisationIntegration",
    entityId: id,
    metadata: { integrationKey: existing.integration.key },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
