import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const createSchema = z.object({
  employeeId: z.string().min(1),
  authorId: z.string().nullish(),
  type: z.enum(["POSITIVE", "CONSTRUCTIVE", "GENERAL", "RECOGNITION"]).default("GENERAL"),
  visibility: z.enum(["PRIVATE", "MANAGER_ONLY", "PUBLIC"]).default("PRIVATE"),
  comment: z.string().min(3).max(2000),
});

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** POST /api/org/feedback — record feedback for an employee. */
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

  // Author defaults to the signed-in admin's linked employee profile.
  let authorId = data.authorId ?? null;
  if (authorId) {
    const author = await prisma.employee.findUnique({
      where: { id: authorId },
      select: { organisationId: true },
    });
    if (!author || author.organisationId !== organisationId) {
      return NextResponse.json(
        { error: "Author not found", fields: { authorId: "Unknown author" } },
        { status: 404 }
      );
    }
  } else {
    const me = await prisma.employee.findFirst({
      where: { organisationId, userId: auth.ctx.session.id },
      select: { id: true },
    });
    authorId = me?.id ?? null;
  }

  if (!authorId) {
    return NextResponse.json(
      {
        error: "No employee profile is linked to this account",
        fields: { authorId: "Select an author" },
      },
      { status: 422 }
    );
  }

  if (authorId === data.employeeId) {
    return NextResponse.json(
      { error: "Feedback author and recipient must differ", fields: { authorId: "Pick another author" } },
      { status: 422 }
    );
  }

  const feedback = await prisma.feedback.create({
    data: {
      organisationId,
      employeeId: data.employeeId,
      authorId,
      type: data.type,
      visibility: data.visibility,
      comment: data.comment.trim(),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "FEEDBACK_CREATED",
    category: "performance",
    description: `Recorded ${data.type.toLowerCase()} feedback for ${employee.firstName} ${employee.lastName}`,
    entityType: "Feedback",
    entityId: feedback.id,
    metadata: { employeeId: data.employeeId, type: data.type, visibility: data.visibility },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: feedback.id }, { status: 201 });
}
