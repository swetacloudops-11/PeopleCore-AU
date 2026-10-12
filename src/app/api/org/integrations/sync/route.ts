import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  /** Optional: sync a single mapping. Defaults to the org's first connected mapping. */
  mappingId: z.string().optional(),
  direction: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]).default("BIDIRECTIONAL"),
});

/**
 * POST /api/org/integrations/sync — simulate a synchronisation run for THIS
 * organisation: writes a SyncLog row and updates the mapping's last-sync
 * bookkeeping. Outcome is deterministic (mirrors the platform /api/sync
 * pattern) and always scoped to auth.ctx.organisationId.
 */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const organisationId = auth.ctx.organisationId;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }
  const { direction } = parsed.data;

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, status: true, employeeCount: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  // Resolve the target mapping (this org's own rows only).
  let mapping = null;
  if (parsed.data.mappingId) {
    mapping = await prisma.organisationIntegration.findFirst({
      where: { id: parsed.data.mappingId, organisationId },
      include: { integration: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
  } else {
    mapping = await prisma.organisationIntegration.findFirst({
      where: { organisationId, status: { in: ["CONNECTED", "PENDING", "ERROR"] } },
      orderBy: { updatedAt: "desc" },
      include: { integration: true },
    });
  }

  const integrationId = mapping?.integrationId ?? (await fallbackIntegrationId());
  if (!integrationId) {
    return NextResponse.json(
      { error: "No integration is available to sync" },
      { status: 409 }
    );
  }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (integration && integration.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `${integration.name} is ${integration.status.toLowerCase()} — activate it before syncing` },
      { status: 409 }
    );
  }

  // Deterministic-but-plausible outcome, scoped to this tenant.
  const disabled = org.status === "DISABLED";
  const mappingError = mapping?.status === "ERROR";
  const mappingDisconnected = mapping?.status === "DISCONNECTED";
  const total = 60 + ((org.employeeCount * 7 + org.name.length * 13) % 640);
  const failedRun = disabled || mappingError;
  const failed = failedRun ? total : total % 7 === 0 ? Math.ceil(total * 0.1) : 0;
  const durationMs = 700 + ((total * 11) % 5200);

  const status = failedRun
    ? "FAILED"
    : mappingDisconnected
    ? "SKIPPED"
    : failed > 0
    ? "PARTIAL"
    : "SUCCESS";

  const log = await prisma.syncLog.create({
    data: {
      organisationId,
      integrationId,
      mappingId: mapping?.id ?? null,
      direction,
      trigger: "MANUAL",
      status,
      recordsTotal: total,
      recordsSuccess: status === "SKIPPED" ? 0 : total - failed,
      recordsFailed: failed,
      durationMs,
      message: failedRun
        ? mappingError
          ? `Connector is in an error state — reconnect '${integration?.name ?? "the integration"}' and retry`
          : "Organisation is disabled — synchronisation refused"
        : status === "SKIPPED"
        ? "Skipped — mapping is disconnected"
        : failed > 0
        ? `${failed} records rejected during validation`
        : `Synced ${total} records successfully`,
      errorCode: failedRun ? (mappingError ? "MAPPING_ERROR" : "ORG_DISABLED") : failed > 0 ? "VALIDATION_ERRORS" : null,
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
        errorMessage: failedRun ? log.message : null,
        status: failedRun ? "ERROR" : mapping.status === "PENDING" ? "CONNECTED" : mapping.status,
      },
    });
  }

  await writeOrgAudit({
    organisationId,
    action: "ORG_SYNC_TRIGGERED",
    category: "Integrations",
    severity: status === "FAILED" ? "WARNING" : "INFO",
    description: `Manual sync via ${log.integration.name}: ${log.status} (${log.recordsSuccess}/${total} records in ${durationMs}ms)`,
    entityType: "SyncLog",
    entityId: log.id,
    metadata: { status: log.status, records: total, durationMs, mappingId: mapping?.id ?? null },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    {
      ok: true,
      id: log.id,
      status: log.status,
      records: total,
      success: log.recordsSuccess,
      durationMs,
      message: log.message,
    },
    { status: 201 }
  );
}

/** Read-only lookup into the global catalogue when the org has no mapping yet. */
async function fallbackIntegrationId(): Promise<string | null> {
  const active = await prisma.integration.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (active) return active.id;
  const any = await prisma.integration.findFirst({ select: { id: true } });
  return any?.id ?? null;
}
