import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(1000).nullish(),
  category: z.string().min(1).max(60).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED", "CANCELLED"])
    .optional(),
  dueDate: dateStr.nullish(),
});

function localDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** PATCH /api/org/goals/[id] — update progress, status, due date. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal || goal.organisationId !== organisationId) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;
  const nextStatus = data.status ?? goal.status;
  const nextProgress =
    data.progress ?? (nextStatus === "COMPLETED" ? 100 : goal.progress);

  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.dueDate !== undefined ? { dueDate: localDate(data.dueDate) } : {}),
      status: nextStatus,
      progress: nextProgress,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "GOAL_UPDATED",
    category: "performance",
    description:
      goal.status === nextStatus
        ? `Goal '${goal.title}' progress ${goal.progress}% → ${nextProgress}%`
        : `Goal '${goal.title}' status ${goal.status} → ${nextStatus}`,
    entityType: "Goal",
    entityId: id,
    metadata: {
      fromStatus: goal.status,
      toStatus: nextStatus,
      fromProgress: goal.progress,
      toProgress: nextProgress,
    },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    goal: { id: updated.id, status: updated.status, progress: updated.progress },
  });
}

/** DELETE /api/org/goals/[id] — remove a goal. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal || goal.organisationId !== organisationId) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  await prisma.goal.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "GOAL_DELETED",
    category: "performance",
    severity: "WARNING",
    description: `Deleted goal '${goal.title}'`,
    entityType: "Goal",
    entityId: id,
    ipAddress: clientIp(_req),
  });

  return NextResponse.json({ ok: true });
}
