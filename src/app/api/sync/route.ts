import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  organisationId: z.string().optional(),
  mappingId: z.string().optional(),
  direction: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]).default("BIDIRECTIONAL"),
});

/**
 * Simulates a synchronisation run: writes a SyncLog row with realistic
 * record counts and updates the mapping's last-sync bookkeeping.
 */
export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const { organisationId, mappingId, direction } = parsed.data;

  let mapping = null;
  if (mappingId) {
    mapping = await prisma.organisationIntegration.findUnique({
      where: { id: mappingId },
      include: { organisation: true, integration: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
  }

  const orgId = mapping?.organisationId ?? organisationId;
  if (!orgId) {
    return NextResponse.json(
      { error: "Provide either an organisationId or a mappingId" },
      { status: 422 }
    );
  }

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const integrationId = mapping?.integrationId;
  if (integrationId) {
    const blocked = await prisma.integration.findUnique({ where: { id: integrationId } });
    if (blocked && blocked.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `${blocked.name} is ${blocked.status.toLowerCase()} — activate it before syncing` },
        { status: 409 }
      );
    }
  }

  // Deterministic-but-plausible outcome: orgs that are disabled always fail.
  const failedRun = org.status === "DISABLED";
  const total = 60 + ((org.employeeCount * 7 + org.name.length * 13) % 640);
  const failed = failedRun ? total : total % 7 === 0 ? Math.ceil(total * 0.1) : 0;
  const durationMs = 700 + ((total * 11) % 5200);

  const log = await prisma.syncLog.create({
    data: {
      organisationId: org.id,
      integrationId: integrationId ?? (await firstIntegrationId()),
      mappingId: mapping?.id ?? null,
      direction,
      trigger: "MANUAL",
      status: failedRun ? "FAILED" : failed > 0 ? "PARTIAL" : "SUCCESS",
      recordsTotal: total,
      recordsSuccess: total - failed,
      recordsFailed: failed,
      durationMs,
      message: failedRun
        ? "Organisation is disabled — synchronisation refused"
        : failed > 0
        ? `${failed} records rejected during validation`
        : `Synced ${total} records successfully`,
      errorCode: failedRun ? "ORG_DISABLED" : failed > 0 ? "VALIDATION_ERRORS" : null,
      startedAt: new Date(Date.now() - durationMs),
      finishedAt: new Date(),
    },
    include: { integration: { select: { name: true } } },
  });

  if (mapping) {
    await prisma.organisationIntegration.update({
      where: { id: mapping.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: log.status,
        errorMessage: failedRun ? "Organisation is disabled" : null,
        status: failedRun ? "ERROR" : mapping.status === "PENDING" ? "CONNECTED" : mapping.status,
      },
    });
  }

  await writeAudit({
    action: "SYNC_TRIGGERED",
    category: "Integrations",
    severity: failedRun ? "WARNING" : "INFO",
    description: `Manual sync for '${org.name}' via ${log.integration.name}: ${log.status} (${total - failed}/${total} records in ${durationMs}ms)`,
    entityType: "SyncLog",
    entityId: log.id,
    organisationId: org.id,
    metadata: { status: log.status, records: total, durationMs },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    { ok: true, id: log.id, status: log.status, records: total, durationMs },
    { status: 201 }
  );
}

async function firstIntegrationId() {
  const first = await prisma.integration.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (first) return first.id;
  const any = await prisma.integration.findFirst({ select: { id: true } });
  if (!any) throw new Error("NO_INTEGRATIONS");
  return any.id;
}
