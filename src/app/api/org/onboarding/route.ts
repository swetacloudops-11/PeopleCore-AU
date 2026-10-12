import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

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

/** POST /api/org/onboarding — create an onboarding/offboarding task. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

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

  await writeOrgAudit({
    organisationId,
    action: "ONBOARDING_TASK_CREATED",
    category: "onboarding",
    description: `Created ${data.stage.toLowerCase()} task '${task.title}'`,
    entityType: "OnboardingTask",
    entityId: task.id,
    metadata: { stage: data.stage, employeeId: data.employeeId ?? null },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: task.id }, { status: 201 });
}
