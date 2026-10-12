import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  employeeId: z.string().min(1),
  reviewerId: z.string().nullish(),
  type: z.enum(["ANNUAL", "PROBATION", "QUARTERLY", "MID_YEAR", "CUSTOM"]).default("ANNUAL"),
  title: z.string().min(2).max(160),
  periodStart: dateStr,
  periodEnd: dateStr,
  dueDate: dateStr.nullish(),
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

/** POST /api/org/reviews — create a review (starts as DRAFT). */
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

  if (data.reviewerId) {
    const reviewer = await prisma.employee.findUnique({
      where: { id: data.reviewerId },
      select: { organisationId: true },
    });
    if (!reviewer || reviewer.organisationId !== organisationId) {
      return NextResponse.json(
        { error: "Reviewer not found", fields: { reviewerId: "Unknown reviewer" } },
        { status: 404 }
      );
    }
  }

  const review = await prisma.review.create({
    data: {
      organisationId,
      employeeId: data.employeeId,
      reviewerId: data.reviewerId || null,
      type: data.type,
      title: data.title.trim(),
      periodStart: localDate(data.periodStart),
      periodEnd: localDate(data.periodEnd),
      dueDate: data.dueDate ? localDate(data.dueDate) : null,
      status: "DRAFT",
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "REVIEW_CREATED",
    category: "performance",
    description: `Created ${data.type} review '${review.title}' for ${employee.firstName} ${employee.lastName}`,
    entityType: "Review",
    entityId: review.id,
    metadata: { employeeId: data.employeeId, type: data.type },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: review.id }, { status: 201 });
}
