import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  resolved: z.boolean(),
});

/** PATCH /api/org/conflicts/[id] — mark a roster conflict resolved or reopen it. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { resolved } = parsed.data;

  const row = await prisma.rosterConflict.findUnique({ where: { id } });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  }

  const updated = await prisma.rosterConflict.update({
    where: { id },
    data: { resolved, resolvedAt: resolved ? new Date() : null },
  });

  await writeOrgAudit({
    organisationId,
    action: resolved ? "CONFLICT_RESOLVED" : "CONFLICT_REOPENED",
    category: "Rostering",
    severity: row.severity === "ERROR" && !resolved ? "WARNING" : "INFO",
    description: `${resolved ? "Resolved" : "Reopened"} ${row.type} conflict: ${row.message.slice(0, 120)}`,
    entityType: "RosterConflict",
    entityId: id,
    metadata: { type: row.type, severity: row.severity, rosterId: row.rosterId },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, resolved: updated.resolved });
}
