import { NextRequest, NextResponse } from "next/server";
import { TaskStage, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";
import { parseEnum } from "@/lib/enums";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(500).nullish(),
  employeeId: z.string().nullish(),
  checklistId: z.string().nullish(),
  assigneeId: z.string().nullish(),
  stage: z.enum(["ONBOARDING", "OFFBOARDING"]).default("ONBOARDING"),
  category: z.string().min(1).max(60).default("Admin"),
  dueDate: dateStr.nullish(),
});

/** Build a local-midnight Date from a yyyy-mm-dd string (matches @db.Date seeds). */
function localDate(value: string | null | undefined): Date | null {
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

/**
 * GET /api/hr/tasks — list tasks scoped to the caller's organisation.
 *
 * Query: stage, status, employeeId, checklistId, open (1) and q.
 */
export async function GET(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const sp = req.nextUrl.searchParams;
  const stage = parseEnum(TaskStage, sp.get("stage"));
  const status = parseEnum(TaskStatus, sp.get("status"));
  const employeeId = sp.get("employeeId");
  const checklistId = sp.get("checklistId");
  const open = sp.get("open") === "1";
  const q = sp.get("q")?.trim();

  const openStatuses: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];
  const statusFilter: TaskStatus[] | undefined = open
    ? openStatuses
    : status
    ? [status]
    : undefined;

  const tasks = await prisma.onboardingTask.findMany({
    where: {
      organisationId,
      ...(stage ? { stage } : {}),
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(checklistId ? { checklistId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { employee: { firstName: { contains: q, mode: "insensitive" as const } } },
              { employee: { lastName: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      checklist: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    items: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      stage: t.stage,
      category: t.category,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      notes: t.notes,
      employeeId: t.employeeId,
      employeeName: t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : null,
      checklistId: t.checklistId,
      checklistName: t.checklist?.name ?? null,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

/** POST /api/hr/tasks — create an onboarding/offboarding task. */
export async function POST(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  // 1. verify every referenced id belongs to this organisation
  if (data.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { organisationId: true },
    });
    if (!employee || employee.organisationId !== organisationId) {
      return NextResponse.json(
        { error: "Employee not found", fields: { employeeId: "Unknown employee" } },
        { status: 404 }
      );
    }
  }

  if (data.checklistId) {
    const checklist = await prisma.onboardingChecklist.findUnique({
      where: { id: data.checklistId },
      select: { organisationId: true },
    });
    if (!checklist || checklist.organisationId !== organisationId) {
      return NextResponse.json(
        { error: "Checklist not found", fields: { checklistId: "Unknown checklist" } },
        { status: 404 }
      );
    }
  }

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

  // 2. mutate
  const task = await prisma.onboardingTask.create({
    data: {
      organisationId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      employeeId: data.employeeId || null,
      checklistId: data.checklistId || null,
      assigneeId: data.assigneeId || null,
      stage: data.stage,
      category: data.category,
      dueDate: localDate(data.dueDate),
    },
  });

  // 3. audit
  await writeOrgAudit({
    organisationId,
    action: "hr.task.created",
    category: "onboarding",
    description: `Created ${data.stage.toLowerCase()} task '${task.title}'`,
    entityType: "OnboardingTask",
    entityId: task.id,
    metadata: { stage: data.stage, employeeId: data.employeeId ?? null },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: { id: task.id, status: task.status } }, { status: 201 });
}
