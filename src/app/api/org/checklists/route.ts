import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(400).nullish(),
  roleCategory: z.string().max(80).nullish(),
  isDefault: z.boolean().default(false),
  stage: z.enum(["ONBOARDING", "OFFBOARDING"]).default("ONBOARDING"),
  category: z.string().min(1).max(60).default("Admin"),
  tasks: z.array(z.string().min(1).max(160)).max(50).default([]),
});

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** POST /api/org/checklists — create a checklist (plus optional task templates). */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;
  const name = data.name.trim();

  const clash = await prisma.onboardingChecklist.findFirst({
    where: { organisationId, name },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "A checklist with that name already exists", fields: { name: "Already in use" } },
      { status: 409 }
    );
  }

  if (data.isDefault) {
    await prisma.onboardingChecklist.updateMany({
      where: { organisationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const checklist = await prisma.onboardingChecklist.create({
    data: {
      organisationId,
      name,
      description: data.description?.trim() || null,
      roleCategory: data.roleCategory?.trim() || null,
      isDefault: data.isDefault,
      tasks: {
        create: data.tasks.map((title) => ({
          organisationId,
          title: title.trim(),
          stage: data.stage,
          category: data.category,
          status: "NOT_STARTED" as const,
        })),
      },
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ONBOARDING_CHECKLIST_CREATED",
    category: "onboarding",
    description: `Created checklist '${name}' with ${data.tasks.length} task template(s)`,
    entityType: "OnboardingChecklist",
    entityId: checklist.id,
    metadata: { taskCount: data.tasks.length, stage: data.stage },
    ipAddress: clientIp(req),
  });

  return NextResponse.json(
    { ok: true, id: checklist.id, taskCount: data.tasks.length },
    { status: 201 }
  );
}
