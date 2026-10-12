import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  action: z.enum(["start", "complete", "cancel"]),
  overallRating: z.number().min(1).max(5).optional(),
  reviewerComments: z.string().max(4000).nullish(),
  employeeComments: z.string().max(4000).nullish(),
  strengths: z.string().max(2000).nullish(),
  improvements: z.string().max(2000).nullish(),
  goals: z.string().max(4000).nullish(),
});

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** PATCH /api/org/reviews/[id] — start, complete or cancel a review. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review || review.organisationId !== organisationId) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  if (data.action === "start" && review.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Only draft reviews can be started (this one is ${review.status})` },
      { status: 409 }
    );
  }
  if (data.action === "cancel" && (review.status === "CANCELLED" || review.status === "COMPLETED")) {
    return NextResponse.json(
      { error: `A ${review.status.toLowerCase()} review cannot be cancelled` },
      { status: 409 }
    );
  }
  if (
    data.action === "complete" &&
    (review.status === "COMPLETED" || review.status === "CANCELLED")
  ) {
    return NextResponse.json(
      { error: `A ${review.status.toLowerCase()} review cannot be completed` },
      { status: 409 }
    );
  }

  const completed = data.action === "complete";
  const auditAction = { start: "REVIEW_STARTED", complete: "REVIEW_COMPLETED", cancel: "REVIEW_CANCELLED" }[
    data.action
  ];
  const actionLabel = { start: "started", complete: "completed", cancel: "cancelled" }[data.action];

  const updated = await prisma.review.update({
    where: { id },
    data: {
      status:
        data.action === "start"
          ? "IN_PROGRESS"
          : completed
          ? "COMPLETED"
          : "CANCELLED",
      ...(completed
        ? {
            completedAt: new Date(),
            ...(data.overallRating !== undefined ? { overallRating: data.overallRating } : {}),
            ...(data.reviewerComments !== undefined
              ? { reviewerComments: data.reviewerComments || null }
              : {}),
            ...(data.employeeComments !== undefined
              ? { employeeComments: data.employeeComments || null }
              : {}),
            ...(data.strengths !== undefined ? { strengths: data.strengths || null } : {}),
            ...(data.improvements !== undefined ? { improvements: data.improvements || null } : {}),
            ...(data.goals !== undefined ? { goals: data.goals || null } : {}),
          }
        : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: auditAction,
    category: "performance",
    description: `Review '${review.title}' ${actionLabel} (now ${updated.status})`,
    entityType: "Review",
    entityId: id,
    metadata: {
      from: review.status,
      to: updated.status,
      overallRating: completed ? (data.overallRating ?? null) : undefined,
    },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    review: { id: updated.id, status: updated.status },
  });
}
