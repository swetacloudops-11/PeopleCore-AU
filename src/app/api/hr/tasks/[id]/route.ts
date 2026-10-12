import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "WAIVED"]).optional(),
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

/** Fetch first, then compare organisationId — never update by id alone. */
async function loadTask(id: string, organisationId: string) {
  return prisma.onboardingTask.findFirst({ where: { id, organisationId } });
}

/** PATCH /api/hr/tasks/[id] — change status, reassign, reschedule or annotate. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const task = await loadTask(id, organisationId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  if (data.assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: data.assigneeId },
      select: { organisationId: true },
    });
    if (!assignee || assignee.organisationId !== organisationId) {
      return NextResponse.json(
        { error: "Assignee not found", fields: { assigneeId: "Unknown assignee" } },
        { status: 404 }
      );
    }
  }

  const nextDueDate = localDate(data.dueDate);
  const closing = data.status === "COMPLETED" || data.status === "WAIVED";
  const wasClosed = task.status === "COMPLETED" || task.status === "WAIVED";

  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId || null } : {}),
      ...(nextDueDate !== undefined ? { dueDate: nextDueDate } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.status !== undefined
        ? {
            completedAt:
              closing && !wasClosed
                ? new Date()
                : closing && wasClosed
                ? task.completedAt
                : null,
          }
        : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: data.status ? "hr.task.status_changed" : "hr.task.updated",
    category: "onboarding",
    description: data.status
      ? `Task '${task.title}' moved from ${task.status} to ${data.status}`
      : `Updated task '${task.title}'`,
    entityType: "OnboardingTask",
    entityId: task.id,
    metadata: { from: task.status, to: data.status ?? task.status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, task: { id: updated.id, status: updated.status } });
}

/** DELETE /api/hr/tasks/[id] — remove a task. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const task = await loadTask(id, organisationId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await prisma.onboardingTask.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "hr.task.deleted",
    category: "onboarding",
    severity: "WARNING",
    description: `Deleted task '${task.title}'`,
    entityType: "OnboardingTask",
    entityId: task.id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
