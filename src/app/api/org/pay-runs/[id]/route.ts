import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PayRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgApi, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const actionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "MARK_PAID"]),
});

/**
 * Legal pay run state transitions only. Anything else is rejected with a 422
 * so a stale tab can never jump a run from DRAFT straight to PAID.
 */
const TRANSITIONS: Record<
  string,
  { from: PayRunStatus[]; to: PayRunStatus; verb: string }
> = {
  SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL", verb: "submitted for approval" },
  APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED", verb: "approved" },
  MARK_PAID: { from: ["APPROVED"], to: "PAID", verb: "marked as paid" },
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 422 });
}

/** PATCH /api/org/pay-runs/[id] — submit / approve / mark paid. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const payRun = await prisma.payRun.findUnique({ where: { id } });
  if (!payRun || payRun.organisationId !== organisationId) {
    return NextResponse.json({ error: "Pay run not found" }, { status: 404 });
  }

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const transition = TRANSITIONS[parsed.data.action];
  if (!transition.from.includes(payRun.status)) {
    return badRequest(
      `Cannot ${parsed.data.action.replace("_", " ").toLowerCase()} a pay run in ${payRun.status} status`
    );
  }

  const now = new Date();
  const updated = await prisma.payRun.update({
    where: { id },
    data: {
      status: transition.to,
      ...(parsed.data.action === "APPROVE"
        ? { approvedAt: now, approvedById: auth.ctx.session.id }
        : {}),
      ...(parsed.data.action === "MARK_PAID" ? { paidAt: now } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: `pay_run.${parsed.data.action.toLowerCase()}`,
    category: "payroll",
    severity: parsed.data.action === "MARK_PAID" ? "WARNING" : "INFO",
    description: `Pay run "${payRun.label}" ${transition.verb}`,
    entityType: "PayRun",
    entityId: id,
    metadata: { fromStatus: payRun.status, toStatus: transition.to },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

/** DELETE /api/org/pay-runs/[id] — remove a draft pay run only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const payRun = await prisma.payRun.findUnique({ where: { id } });
  if (!payRun || payRun.organisationId !== organisationId) {
    return NextResponse.json({ error: "Pay run not found" }, { status: 404 });
  }

  if (payRun.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Only DRAFT pay runs can be deleted — this run is ${payRun.status}` },
      { status: 422 }
    );
  }

  await prisma.payRun.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "pay_run.deleted",
    category: "payroll",
    severity: "WARNING",
    description: `Deleted draft pay run "${payRun.label}"`,
    entityType: "PayRun",
    entityId: id,
    metadata: { periodStart: payRun.periodStart, periodEnd: payRun.periodEnd },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
