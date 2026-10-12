import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "WAIVED"]).optional(),
  title: z.string().min(2).max(160).optional(),
  category: z.string().min(1).max(60).optional(),
  assigneeId: z.string().nullish(),
  dueDate: dateStr.nullish(),
  notes: z.string().max(1000).nullish(),
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

async function loadTask(id: string, organisationId: string) {
  const task = await prisma.onboardingTask.findUnique({ where: { id } });
  if (!task || task.organisationId !== organisationId) return null;
  return task;
}

/** PATCH /api/org/onboarding/[id] — change task status or edit task fields. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const task = await loadTask(id, organisationId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;
  const closing = data.status === "COMPLETED" || data.status === "WAIVED";
  const wasClosed = task.status === "COMPLETED" || task.status === "WAIVED";

  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(localDate(data.dueDate) !== undefined ? { dueDate: localDate(data.dueDate) } : {}),
      ...(data.status !== undefined
        ? {
            completedAt:
              closing && !wasClosed
                ? new Date()
                : closing === wasClosed
                ? task.completedAt
                : null,
          }
        : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: data.status ? "ONBOARDING_TASK_STATUS_CHANGED" : "ONBOARDING_TASK_UPDATED",
    category: "onboarding",
    description: data.status
      ? `Task '${task.title}' moved from ${task.status} to ${data.status}`
      : `Updated task '${task.title}'`,
    entityType: "OnboardingTask",
    entityId: task.id,
    metadata: { from: task.status, to: data.status ?? task.status },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, task: { id: updated.id, status: updated.status } });
}

/** DELETE /api/org/onboarding/[id] — remove a task. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const task = await loadTask(id, organisationId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await prisma.onboardingTask.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "ONBOARDING_TASK_DELETED",
    category: "onboarding",
    severity: "WARNING",
    description: `Deleted task '${task.title}'`,
    entityType: "OnboardingTask",
    entityId: task.id,
    ipAddress: clientIp(_req),
  });

  return NextResponse.json({ ok: true });
}
