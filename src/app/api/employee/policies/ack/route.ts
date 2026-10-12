import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  policyId: z.string().min(1, "Policy is required"),
});

/**
 * POST /api/employee/policies/ack — the signed-in person acknowledges one of
 * their organisation's policies. Upserts on the unique [policyId, employeeId].
 */
export async function POST(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { policyId } = parsed.data;

  // The policy must belong to the caller's organisation.
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organisationId },
    select: { id: true, title: true },
  });
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const now = new Date();
  const ack = await prisma.policyAcknowledgement.upsert({
    where: { policyId_employeeId: { policyId, employeeId } },
    update: { status: "ACKNOWLEDGED", acknowledgedAt: now },
    create: {
      organisationId,
      policyId,
      employeeId, // self-service: always the signed-in person
      status: "ACKNOWLEDGED",
      acknowledgedAt: now,
      ipAddress: clientIp(req),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.policy.acknowledged",
    category: "self-service",
    description: `Acknowledged policy "${policy.title}"`,
    entityType: "PolicyAcknowledgement",
    entityId: ack.id,
    metadata: { policyId },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: ack.status });
}
