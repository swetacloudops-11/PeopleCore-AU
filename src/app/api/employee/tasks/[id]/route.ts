import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  status: z.literal("COMPLETED"),
  notes: z.string().trim().max(500, "Notes are limited to 500 characters").nullish(),
});

const OPEN_STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];

/**
 * PATCH /api/employee/tasks/[id] — the signed-in person completes one of their
 * own open tasks. Employees may only set status COMPLETED, only on tasks that
 * belong to them, and only while the task is still open.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { notes } = parsed.data;

  // Ownership: the task must exist in this org AND belong to this person.
  const task = await prisma.onboardingTask.findFirst({
    where: { id, organisationId },
  });
  if (!task || task.employeeId !== employeeId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!OPEN_STATUSES.includes(task.status)) {
    return NextResponse.json(
      { error: "Only open tasks can be completed" },
      { status: 409 }
    );
  }

  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      ...(notes !== undefined ? { notes: notes ?? null } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.task.completed",
    category: "self-service",
    description: `Completed ${task.stage.toLowerCase()} task "${task.title}"`,
    entityType: "OnboardingTask",
    entityId: id,
    metadata: { taskId: id, stage: task.stage },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
