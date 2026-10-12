import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  organisationId: z.string().min(1),
  integrationId: z.string().min(1),
  status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR", "PENDING"]).default("PENDING"),
  externalAccountId: z.string().max(120).nullish(),
  externalAccountName: z.string().max(160).nullish(),
  scopes: z.array(z.string().max(60)).default([]),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
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

  const [org, integration] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: data.organisationId } }),
    prisma.integration.findUnique({ where: { id: data.integrationId } }),
  ]);
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

  const existing = await prisma.organisationIntegration.findUnique({
    where: {
      organisationId_integrationId: {
        organisationId: data.organisationId,
        integrationId: data.integrationId,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: `${org.name} is already mapped to ${integration.name}` },
      { status: 409 }
    );
  }

  const mapping = await prisma.organisationIntegration.create({
    data: {
      ...data,
      externalAccountId: data.externalAccountId ?? null,
      externalAccountName: data.externalAccountName ?? null,
      connectedAt: data.status === "CONNECTED" ? new Date() : null,
      lastSyncStatus: null,
    },
  });

  await writeAudit({
    action: "INTEGRATION_MAPPING_CREATED",
    category: "Integrations",
    severity: "INFO",
    description: `Mapped ${integration.name} to '${org.name}' (status: ${data.status})`,
    entityType: "OrganisationIntegration",
    entityId: mapping.id,
    organisationId: org.id,
    metadata: { integration: integration.name, status: data.status },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: mapping.id }, { status: 201 });
}
