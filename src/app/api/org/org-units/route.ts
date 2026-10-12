import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const optText = z.union([z.string().trim().max(500), z.literal("")]).optional();

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DEPARTMENT"),
    name: z.string().trim().min(1, "Name is required"),
    code: optText,
    description: optText,
    costCentre: optText,
  }),
  z.object({
    kind: z.literal("TEAM"),
    name: z.string().trim().min(1, "Name is required"),
    code: optText,
    description: optText,
    departmentId: optText,
  }),
  z.object({
    kind: z.literal("LOCATION"),
    name: z.string().trim().min(1, "Name is required"),
    addressLine1: optText,
    addressLine2: optText,
    city: optText,
    state: optText,
    postcode: optText,
    country: optText,
    timezone: optText,
    isRemote: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("POSITION"),
    title: z.string().trim().min(1, "Title is required"),
    code: optText,
    level: z.coerce.number().int().min(1).max(10).optional(),
    description: optText,
    departmentId: optText,
    isDefault: z.boolean().optional(),
  }),
]);

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

const uniqueFieldByKind: Record<string, { model: string; field: string }> = {
  DEPARTMENT: { model: "name", field: "name" },
  TEAM: { model: "name", field: "name" },
  LOCATION: { model: "name", field: "name" },
  POSITION: { model: "title", field: "title" },
};

/** POST /api/org/org-units — create a department / team / location / position. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;
  const organisationId = auth.ctx.organisationId;

  // Cross-tenant safety: a linked department must belong to this org.
  if (d.kind === "TEAM" || d.kind === "POSITION") {
    if (d.departmentId) {
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
  }

  try {
    let created;
    switch (d.kind) {
      case "DEPARTMENT":
        created = await prisma.department.create({
          data: {
            organisationId,
            name: d.name,
            code: d.code || null,
            description: d.description || null,
            costCentre: d.costCentre || null,
          },
        });
        break;
      case "TEAM":
        created = await prisma.team.create({
          data: {
            organisationId,
            name: d.name,
            code: d.code || null,
            description: d.description || null,
            departmentId: d.departmentId || null,
          },
        });
        break;
      case "LOCATION": {
        if (d.isDefault) {
          await prisma.location.updateMany({
            where: { organisationId, isDefault: true },
            data: { isDefault: false },
          });
        }
        created = await prisma.location.create({
          data: {
            organisationId,
            name: d.name,
            addressLine1: d.addressLine1 || null,
            addressLine2: d.addressLine2 || null,
            city: d.city || null,
            state: d.state || null,
            postcode: d.postcode || null,
            country: d.country || "Australia",
            timezone: d.timezone || "Australia/Sydney",
            isRemote: d.isRemote ?? false,
            isDefault: d.isDefault ?? false,
          },
        });
        break;
      }
      case "POSITION": {
        if (d.isDefault) {
          await prisma.position.updateMany({
            where: { organisationId, isDefault: true },
            data: { isDefault: false },
          });
        }
        created = await prisma.position.create({
          data: {
            organisationId,
            title: d.title,
            code: d.code || null,
            level: d.level ?? 1,
            description: d.description || null,
            departmentId: d.departmentId || null,
            isDefault: d.isDefault ?? false,
          },
        });
        break;
      }
    }

    await writeOrgAudit({
      organisationId,
      action: `orgunit.${d.kind.toLowerCase()}.created`,
      category: "people",
      description: `Created ${d.kind.toLowerCase()} "${d.kind === "POSITION" ? d.title : d.name}"`,
      entityType: d.kind,
      entityId: created.id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ unit: created }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const f = uniqueFieldByKind[d.kind];
      return NextResponse.json(
        {
          error: f.field === "title" ? "A position with this title already exists" : "A unit with this name already exists",
          fields: { [f.field]: "Already in use" },
        },
        { status: 422 }
      );
    }
    throw err;
  }
}
