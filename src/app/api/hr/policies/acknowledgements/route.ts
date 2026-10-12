import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const postSchema = z.object({
  action: z.literal("remind"),
  policyId: z.string().min(1).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1, "id is required"),
  status: z.enum(["PENDING", "ACKNOWLEDGED", "OVERDUE", "WAIVED"]),
});

/** POST /api/hr/policies/acknowledgements — send an acknowledgement reminder. */
export async function POST(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { policyId } = parsed.data;

  let title = "Policy acknowledgement reminder";
  let body = "Please review and acknowledge the outstanding company policies.";
  let scopeLabel = "all policies";

  if (policyId) {
    const policy = await prisma.policy.findFirst({
      where: { id: policyId, organisationId },
      select: { id: true, title: true },
    });
    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }
    const outstanding = await prisma.policyAcknowledgement.count({
      where: { organisationId, policyId, status: { in: ["PENDING", "OVERDUE"] } },
    });
    title = `Reminder: acknowledge '${policy.title}'`;
    body = `${outstanding} acknowledgement${
      outstanding === 1 ? "" : "s"
    } outstanding for '${policy.title}'. Please acknowledge as soon as possible.`;
    scopeLabel = policy.title;
  }

  const created = await prisma.orgNotification.create({
    data: {
      organisationId,
      event: "POLICY_REMINDER",
      title,
      body,
      channel: "IN_APP",
      isRead: false,
      linkUrl: "/hr/policies/acknowledgements",
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "HR_POLICY_REMINDER_SENT",
    category: "policies",
    description: `Sent policy acknowledgement reminder for ${scopeLabel}`,
    entityType: "OrgNotification",
    entityId: created.id,
    metadata: { policyId: policyId ?? null },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

/** PATCH /api/hr/policies/acknowledgements — update an acknowledgement status. */
export async function PATCH(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { id, status } = parsed.data;

  const ack = await prisma.policyAcknowledgement.findFirst({
    where: { id, organisationId },
    include: { policy: { select: { title: true } } },
  });
  if (!ack) {
    return NextResponse.json({ error: "Acknowledgement not found" }, { status: 404 });
  }

  await prisma.policyAcknowledgement.update({
    where: { id },
    data: {
      status,
      acknowledgedAt: status === "ACKNOWLEDGED" ? new Date() : null,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "HR_POLICY_ACK_UPDATED",
    category: "policies",
    description: `Set acknowledgement of '${ack.policy.title}' to ${status}`,
    entityType: "PolicyAcknowledgement",
    entityId: id,
    metadata: { status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
