import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  action: z.enum(["PUBLISH", "LOCK", "UNLOCK", "ARCHIVE"]).optional(),
  name: z.string().min(2).max(80).optional(),
  notes: z.string().max(500).nullish(),
});

/**
 * PATCH /api/org/rosters/[id]
 * Edits roster details, or drives its lifecycle with `action`.
 * `action: "PUBLISH"` stamps the roster + its shifts and notifies the org.
 */
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
  const data = parsed.data;

  const row = await prisma.roster.findUnique({ where: { id } });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Roster not found" }, { status: 404 });
  }
  if (!data.action && !data.name && data.notes === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const ip = clientIp(req);

  if (data.action === "PUBLISH") {
    if (row.status === "PUBLISHED") {
      return NextResponse.json({ error: "This roster is already published" }, { status: 409 });
    }
    if (row.status === "ARCHIVED") {
      return NextResponse.json({ error: "An archived roster cannot be published" }, { status: 409 });
    }

    const now = new Date();
    const shiftCount = await prisma.shift.count({ where: { organisationId, rosterId: id } });

    const roster = await prisma.roster.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: now, publishedById: auth.ctx.session.id },
    });

    // Stamp every shift in the roster so employees see it as live.
    await prisma.shift.updateMany({
      where: { organisationId, rosterId: id },
      data: { publishedAt: now },
    });

    const weekLabel = `${roster.weekStart.toDateString()} → ${roster.weekEnd.toDateString()}`;
    await prisma.orgNotification.create({
      data: {
        organisationId,
        event: "roster.published",
        title: `Roster published: ${roster.name}`,
        body: `${shiftCount} shift${shiftCount === 1 ? "" : "s"} for ${weekLabel} are now live.`,
        channel: "IN_APP",
        linkUrl: `/org/roster?roster=${roster.id}`,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "ROSTER_PUBLISHED",
      category: "Rostering",
      description: `Published roster '${roster.name}' with ${shiftCount} shifts`,
      entityType: "Roster",
      entityId: id,
      metadata: { shiftCount, weekStart: roster.weekStart },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true, status: roster.status, shiftCount });
  }

  const statusMap = { LOCK: "LOCKED", UNLOCK: "PUBLISHED", ARCHIVE: "ARCHIVED" } as const;
  const updated = await prisma.roster.update({
    where: { id },
    data: {
      ...(data.action ? { status: statusMap[data.action] } : {}),
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: data.action ? `ROSTER_${data.action}` : "ROSTER_UPDATED",
    category: "Rostering",
    severity: data.action === "ARCHIVE" ? "WARNING" : "INFO",
    description: data.action
      ? `Roster '${row.name}' is now ${updated.status}`
      : `Updated roster '${row.name}'`,
    entityType: "Roster",
    entityId: id,
    metadata: data,
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
