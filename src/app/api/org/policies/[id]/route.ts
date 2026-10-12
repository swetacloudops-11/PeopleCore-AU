import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z.object({
  action: z.enum(["update", "publish", "acknowledge", "waive"]).default("update"),
  acknowledgementId: z.string().optional(),
  title: z.string().min(2).max(160).optional(),
  category: z.string().min(1).max(60).optional(),
  content: z.string().min(10).max(40000).optional(),
  version: z.string().min(1).max(20).optional(),
  effectiveDate: dateStr.optional(),
  reviewDate: dateStr.nullish(),
  isMandatory: z.boolean().optional(),
});

function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

function dueIn(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function loadPolicy(id: string, organisationId: string) {
  const policy = await prisma.policy.findUnique({
    where: { id },
    include: { _count: { select: { acknowledgements: true } } },
  });
  if (!policy || policy.organisationId !== organisationId) return null;
  return policy;
}

/** PATCH /api/org/policies/[id] — edit, publish, or act on an acknowledgement. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const policy = await loadPolicy(id, organisationId);
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  // ── Publish: issue acknowledgement records to every active employee ──
  if (data.action === "publish") {
    const employees = await prisma.employee.findMany({
      where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
      select: { id: true },
    });
    const existing = await prisma.policyAcknowledgement.findMany({
      where: { policyId: id },
      select: { employeeId: true },
    });
    const have = new Set(existing.map((a) => a.employeeId));
    const dueDate = policy.isMandatory ? dueIn(14) : null;
    const rows = employees
      .filter((e) => !have.has(e.id))
      .map((e) => ({
        organisationId,
        policyId: id,
        employeeId: e.id,
        status: "PENDING" as const,
        dueDate,
      }));

    if (rows.length) {
      await prisma.policyAcknowledgement.createMany({ data: rows, skipDuplicates: true });
    }

    await writeOrgAudit({
      organisationId,
      action: "POLICY_PUBLISHED",
      category: "policies",
      description: `Published policy '${policy.title}' — ${rows.length} acknowledgement(s) issued`,
      entityType: "Policy",
      entityId: id,
      metadata: { issued: rows.length, total: employees.length },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ ok: true, created: rows.length });
  }

  // ── Acknowledge / waive an individual acknowledgement ──
  if (data.action === "acknowledge" || data.action === "waive") {
    if (!data.acknowledgementId) {
      return NextResponse.json(
        { error: "acknowledgementId is required", fields: { acknowledgementId: "Required" } },
        { status: 422 }
      );
    }

    const ack = await prisma.policyAcknowledgement.findUnique({
      where: { id: data.acknowledgementId },
    });
    if (!ack || ack.organisationId !== organisationId || ack.policyId !== id) {
      return NextResponse.json({ error: "Acknowledgement not found" }, { status: 404 });
    }
    if (ack.status === "ACKNOWLEDGED") {
      return NextResponse.json({ error: "Already acknowledged" }, { status: 409 });
    }

    const acknowledging = data.action === "acknowledge";
    await prisma.policyAcknowledgement.update({
      where: { id: ack.id },
      data: {
        status: acknowledging ? "ACKNOWLEDGED" : "WAIVED",
        acknowledgedAt: acknowledging ? new Date() : null,
        ipAddress: acknowledging ? clientIp(req) ?? null : ack.ipAddress,
        notes: acknowledging ? ack.notes : ack.notes ?? "Waived by administrator",
      },
    });

    await writeOrgAudit({
      organisationId,
      action: acknowledging ? "POLICY_ACKNOWLEDGED" : "POLICY_ACKNOWLEDGEMENT_WAIVED",
      category: "policies",
      description: acknowledging
        ? `Policy '${policy.title}' acknowledged`
        : `Acknowledgement of '${policy.title}' waived`,
      entityType: "PolicyAcknowledgement",
      entityId: ack.id,
      metadata: { policyId: id, employeeId: ack.employeeId },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ ok: true });
  }

  // ── Update policy fields ──
  const updated = await prisma.policy.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.version !== undefined ? { version: data.version.trim() } : {}),
      ...(data.effectiveDate !== undefined ? { effectiveDate: localDate(data.effectiveDate) } : {}),
      ...(data.reviewDate !== undefined
        ? { reviewDate: data.reviewDate ? localDate(data.reviewDate) : null }
        : {}),
      ...(data.isMandatory !== undefined ? { isMandatory: data.isMandatory } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "POLICY_UPDATED",
    category: "policies",
    description: `Updated policy '${updated.title}' (v${updated.version})`,
    entityType: "Policy",
    entityId: id,
    metadata: { version: updated.version, isMandatory: updated.isMandatory },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, policy: { id: updated.id, title: updated.title } });
}

/** DELETE /api/org/policies/[id] — delete a policy and its acknowledgements. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const policy = await loadPolicy(id, organisationId);
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  await prisma.policy.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "POLICY_DELETED",
    category: "policies",
    severity: "WARNING",
    description: `Deleted policy '${policy.title}' with ${policy._count.acknowledgements} acknowledgement(s)`,
    entityType: "Policy",
    entityId: id,
    ipAddress: clientIp(_req),
  });

  return NextResponse.json({ ok: true });
}
