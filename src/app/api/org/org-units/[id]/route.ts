import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const optText = z.union([z.string().trim().max(500), z.literal("")]).optional();

const patchSchema = z.object({
  kind: z.enum(["DEPARTMENT", "TEAM", "LOCATION", "POSITION"]),
  name: z.string().trim().min(1).optional(),
  code: optText,
  description: optText,
  costCentre: optText,
  departmentId: optText,
  addressLine1: optText,
  addressLine2: optText,
  city: optText,
  state: optText,
  postcode: optText,
  country: optText,
  timezone: optText,
  level: z.coerce.number().int().min(1).max(10).optional(),
  title: z.string().trim().min(1).optional(),
  isRemote: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Clear a field on `data` when the client sent an empty string. */
function pick(d: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (d[k] === undefined) continue;
    out[k] = d[k] === "" ? null : d[k];
  }
  return out;
}

/** PATCH /api/org/org-units/[id] — update a department/team/location/position. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;
  const raw = d as unknown as Record<string, unknown>;

  // Cross-tenant safety: the row must exist in this org.
  let exists = false;
  if (d.kind === "DEPARTMENT") {
    exists = !!(await prisma.department.findFirst({ where: { id, organisationId }, select: { id: true } }));
  } else if (d.kind === "TEAM") {
    exists = !!(await prisma.team.findFirst({ where: { id, organisationId }, select: { id: true } }));
  } else if (d.kind === "LOCATION") {
    exists = !!(await prisma.location.findFirst({ where: { id, organisationId }, select: { id: true } }));
  } else {
    exists = !!(await prisma.position.findFirst({ where: { id, organisationId }, select: { id: true } }));
  }
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((d.kind === "TEAM" || d.kind === "POSITION") && d.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: d.departmentId, organisationId },
      select: { id: true },
    });
    if (!dept) {
      return NextResponse.json(
        { error: "Invalid references", fields: { departmentId: "Unknown department" } },
        { status: 422 }
      );
    }
  }

  try {
    let updated;
    if (d.kind === "DEPARTMENT") {
      updated = await prisma.department.update({
        where: { id },
        data: pick(raw, ["name", "code", "description", "costCentre"]),
      });
    } else if (d.kind === "TEAM") {
      updated = await prisma.team.update({
        where: { id },
        data: pick(raw, ["name", "code", "description", "departmentId"]),
      });
    } else if (d.kind === "LOCATION") {
      if (d.isDefault === true) {
        await prisma.location.updateMany({
          where: { organisationId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      updated = await prisma.location.update({
        where: { id },
        data: pick(raw, [
          "name", "addressLine1", "addressLine2", "city", "state", "postcode",
          "country", "timezone", "isRemote", "isDefault",
        ]),
      });
    } else {
      if (d.isDefault === true) {
        await prisma.position.updateMany({
          where: { organisationId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      updated = await prisma.position.update({
        where: { id },
        data: pick(raw, ["title", "code", "level", "description", "departmentId", "isDefault"]),
      });
    }

    await writeOrgAudit({
      organisationId,
      action: `orgunit.${d.kind.toLowerCase()}.updated`,
      category: "people",
      description: `Updated ${d.kind.toLowerCase()} #${id}`,
      entityType: d.kind,
      entityId: id,
      metadata: { changed: Object.keys(raw).filter((k) => raw[k] !== undefined) },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ unit: updated });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const field = d.kind === "POSITION" ? "title" : "name";
      return NextResponse.json(
        {
          error: field === "title" ? "A position with this title already exists" : "A unit with this name already exists",
          fields: { [field]: "Already in use" },
        },
        { status: 422 }
      );
    }
    throw err;
  }
}

/** DELETE /api/org/org-units/[id] — 409 when the unit is still in use. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const kindParam = new URL(req.url).searchParams.get("kind") ?? "";
  if (
    kindParam !== "DEPARTMENT" && kindParam !== "TEAM" &&
    kindParam !== "LOCATION" && kindParam !== "POSITION"
  ) {
    return NextResponse.json({ error: "kind query param is required" }, { status: 422 });
  }
  const kind = kindParam;

  if (kind === "DEPARTMENT") {
    const row = await prisma.department.findFirst({
      where: { id, organisationId },
      include: { _count: { select: { employees: true, teams: true, positions: true } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { employees, teams, positions } = row._count;
    if (employees > 0 || teams > 0 || positions > 0) {
      return NextResponse.json(
        {
          error: `Department is still in use (${employees} employee${employees === 1 ? "" : "s"}, ${teams} team${teams === 1 ? "" : "s"}, ${positions} position${positions === 1 ? "" : "s"}) — reassign them first`,
        },
        { status: 409 }
      );
    }
    await prisma.department.delete({ where: { id } });

    await writeOrgAudit({
      organisationId,
      action: "orgunit.department.deleted",
      category: "people",
      severity: "WARNING",
      description: `Deleted department "${row.name}"`,
      entityType: "DEPARTMENT",
      entityId: id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  if (kind === "TEAM") {
    const row = await prisma.team.findFirst({
      where: { id, organisationId },
      include: { _count: { select: { employees: true } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (row._count.employees > 0) {
      return NextResponse.json(
        {
          error: `Team is still in use (${row._count.employees} employee${row._count.employees === 1 ? "" : "s"}) — reassign them first`,
        },
        { status: 409 }
      );
    }
    await prisma.team.delete({ where: { id } });

    await writeOrgAudit({
      organisationId,
      action: "orgunit.team.deleted",
      category: "people",
      severity: "WARNING",
      description: `Deleted team "${row.name}"`,
      entityType: "TEAM",
      entityId: id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  if (kind === "LOCATION") {
    const row = await prisma.location.findFirst({
      where: { id, organisationId },
      include: { _count: { select: { employees: true, shifts: true } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { employees, shifts } = row._count;
    if (employees > 0 || shifts > 0) {
      return NextResponse.json(
        {
          error: `Location is still in use (${employees} employee${employees === 1 ? "" : "s"}, ${shifts} shift${shifts === 1 ? "" : "s"}) — reassign them first`,
        },
        { status: 409 }
      );
    }
    await prisma.location.delete({ where: { id } });

    await writeOrgAudit({
      organisationId,
      action: "orgunit.location.deleted",
      category: "people",
      severity: "WARNING",
      description: `Deleted location "${row.name}"`,
      entityType: "LOCATION",
      entityId: id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  // POSITION
  const row = await prisma.position.findFirst({
    where: { id, organisationId },
    include: { _count: { select: { employees: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row._count.employees > 0) {
    return NextResponse.json(
      {
        error: `Position is still in use (${row._count.employees} employee${row._count.employees === 1 ? "" : "s"}) — reassign them first`,
      },
      { status: 409 }
    );
  }
  await prisma.position.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "orgunit.position.deleted",
    category: "people",
    severity: "WARNING",
    description: `Deleted position "${row.title}"`,
    entityType: "POSITION",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
