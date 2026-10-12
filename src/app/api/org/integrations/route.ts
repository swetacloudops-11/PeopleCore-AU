import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const createSchema = z.object({
  integrationId: z.string().min(1, "Choose an integration"),
  externalAccountName: z.string().max(120).nullish(),
  scopes: z.array(z.string().max(60)).max(20).optional(),
});

/**
 * POST /api/org/integrations — map a catalogue integration onto this
 * organisation. The Integration catalogue is global (read-only here); only
 * this tenant's OrganisationIntegration row is ever created.
 */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const organisationId = auth.ctx.organisationId;
  const { integrationId, externalAccountName, scopes } = parsed.data;

  const [integration, org, existing] = await Promise.all([
    prisma.integration.findUnique({ where: { id: integrationId } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true } }),
    prisma.organisationIntegration.findUnique({
      where: { organisationId_integrationId: { organisationId, integrationId } },
    }),
  ]);

  if (!integration) {
    return NextResponse.json(
      { error: "Integration not found", fields: { integrationId: "Unknown integration" } },
      { status: 404 }
    );
  }
  if (existing) {
    return NextResponse.json(
      { error: `${integration.name} is already mapped to this organisation` },
      { status: 409 }
    );
  }

  const mapping = await prisma.organisationIntegration.create({
    data: {
      organisationId,
      integrationId,
      status: "CONNECTED",
      externalAccountName: externalAccountName?.trim() || `${org?.name ?? "Organisation"} · ${integration.name}`,
      scopes: scopes?.length ? scopes : ["read", "write"],
      connectedAt: new Date(),
    },
    include: { integration: { select: { name: true } } },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_INTEGRATION_CONNECTED",
    category: "Integrations",
    severity: "INFO",
    description: `Connected '${integration.name}' (${integration.provider})`,
    entityType: "OrganisationIntegration",
    entityId: mapping.id,
    metadata: { integrationKey: integration.key, status: mapping.status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: mapping.id, status: mapping.status }, { status: 201 });
}
