import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  employeeId: z.string().min(1),
  title: z.string().min(2).max(160),
  description: z.string().max(1000).nullish(),
  category: z.string().min(1).max(60).default("Performance"),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED", "CANCELLED"])
    .default("NOT_STARTED"),
  progress: z.number().int().min(0).max(100).default(0),
  dueDate: dateStr.nullish(),
});

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

/** POST /api/org/goals — create a goal for an employee. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  const employee = await prisma.employee.findUnique({
    where: { id: data.employeeId },
    select: { organisationId: true, firstName: true, lastName: true },
  });
  if (!employee || employee.organisationId !== organisationId) {
    return NextResponse.json(
      { error: "Employee not found", fields: { employeeId: "Unknown employee" } },
      { status: 404 }
    );
  }

  const goal = await prisma.goal.create({
    data: {
      organisationId,
      employeeId: data.employeeId,
      createdById: auth.ctx.session.id,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      category: data.category,
      status: data.status,
      progress: data.status === "COMPLETED" ? 100 : data.progress,
      dueDate: localDate(data.dueDate),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "GOAL_CREATED",
    category: "performance",
    description: `Created goal '${goal.title}' for ${employee.firstName} ${employee.lastName}`,
    entityType: "Goal",
    entityId: goal.id,
    metadata: { employeeId: data.employeeId, status: data.status },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: goal.id }, { status: 201 });
}
