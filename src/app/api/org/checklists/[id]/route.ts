import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(400).nullish(),
  roleCategory: z.string().max(80).nullish(),
  isDefault: z.boolean().optional(),
});

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

async function loadChecklist(id: string, organisationId: string) {
  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { id },
    include: { _count: { select: { tasks: true } } },
  });
  if (!checklist || checklist.organisationId !== organisationId) return null;
  return checklist;
}

/** PATCH /api/org/checklists/[id] — edit a checklist. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const checklist = await loadChecklist(id, organisationId);
  if (!checklist) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  if (data.name && data.name.trim() !== checklist.name) {
    const clash = await prisma.onboardingChecklist.findFirst({
      where: { organisationId, name: data.name.trim() },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: "A checklist with that name already exists", fields: { name: "Already in use" } },
        { status: 409 }
      );
    }
  }

  if (data.isDefault === true) {
    await prisma.onboardingChecklist.updateMany({
      where: { organisationId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.onboardingChecklist.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.roleCategory !== undefined ? { roleCategory: data.roleCategory || null } : {}),
      ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ONBOARDING_CHECKLIST_UPDATED",
    category: "onboarding",
    description: `Updated checklist '${updated.name}'`,
    entityType: "OnboardingChecklist",
    entityId: id,
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, checklist: { id: updated.id, name: updated.name } });
}

/** DELETE /api/org/checklists/[id] — delete a checklist (tasks stay, unlinked). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const checklist = await loadChecklist(id, organisationId);
  if (!checklist) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });

  // Remove unassigned template rows first — assigned employee tasks survive
  // (their checklistId is nulled) so completed work is never lost.
  const removedTemplates = await prisma.onboardingTask.deleteMany({
    where: { organisationId, checklistId: id, employeeId: null },
  });

  await prisma.onboardingChecklist.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "ONBOARDING_CHECKLIST_DELETED",
    category: "onboarding",
    severity: "WARNING",
    description: `Deleted checklist '${checklist.name}' (${checklist._count.tasks} tasks, ${removedTemplates.count} template rows removed)`,
    entityType: "OnboardingChecklist",
    entityId: id,
    ipAddress: clientIp(_req),
  });

  return NextResponse.json({ ok: true });
}
