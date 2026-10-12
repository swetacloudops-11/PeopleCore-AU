import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type OrgAuditInput = {
  organisationId: string;
  action: string;
  category?: string;
  severity?: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

/** Writes an audit row scoped to the acting organisation. */
export async function writeOrgAudit(input: OrgAuditInput) {
  const session = await getSession().catch(() => null);
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        category: input.category ?? "general",
        severity: input.severity ?? "INFO",
        description: input.description,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        organisationId: input.organisationId,
        userId: session?.id ?? null,
      },
    });
  } catch (err) {
    console.error("[org-audit] failed to write log", err);
  }
}
