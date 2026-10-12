import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z.union([z.string().regex(DATE_RE), z.literal("")]).optional();
const optText = z.union([z.string().trim().max(500), z.literal("")]).optional();

const createSchema = z.object({
  // Catalogue fields (used when no employeeId is supplied).
  name: z.string().trim().min(1, "Name is required").optional(),
  issuingBody: optText,
  description: optText,
  validityMonths: z.coerce.number().int().min(1).max(120).optional(),
  isMandatory: z.boolean().default(false),
  // Assignment fields (used when an employeeId is supplied).
  employeeId: z.string().optional(),
  certificationId: z.string().optional(),
  status: z.enum(["CURRENT", "EXPIRING", "EXPIRED", "PENDING"]).optional(),
  issuedDate: optDate,
  expiryDate: optDate,
  certificateNumber: z.union([z.string().trim().max(200), z.literal("")]).optional(),
  notes: optText,
});

const EXPIRING_WINDOW_DAYS = 60;

function deriveStatus(expiryDate: Date | null): "CURRENT" | "EXPIRING" | "EXPIRED" {
  if (!expiryDate) return "CURRENT";
  const now = new Date();
  if (expiryDate.getTime() < now.getTime()) return "EXPIRED";
  const soon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000);
  return expiryDate.getTime() <= soon.getTime() ? "EXPIRING" : "CURRENT";
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** GET /api/hr/certifications — paginated employee certification records. */
export async function GET(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const status = (sp.get("status") ?? "").trim().toUpperCase();
  const employeeId = (sp.get("employeeId") ?? "").trim();
  const certificationId = (sp.get("certificationId") ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(sp.get("pageSize") ?? "25", 10) || 25)
  );

  const where = {
    employee: { organisationId },
    ...(status && status !== "ALL" ? { status: status as never } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(certificationId ? { certificationId } : {}),
    ...(q
      ? {
          OR: [
            { employee: { firstName: { contains: q, mode: "insensitive" as const } } },
            { employee: { lastName: { contains: q, mode: "insensitive" as const } } },
            { certification: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.employeeCertification.count({ where }),
    prisma.employeeCertification.findMany({
      where,
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        certification: { select: { id: true, name: true, issuingBody: true, isMandatory: true } },
      },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

/**
 * POST /api/hr/certifications
 *
 * Creates a catalogue certification, or — when `employeeId` is provided —
 * records an employee certification assignment.
 */
export async function POST(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  // ── Catalogue creation ──
  if (!d.employeeId) {
    if (!d.name) {
      return NextResponse.json(
        { error: "Invalid payload", fields: { name: "Name is required" } },
        { status: 422 }
      );
    }
    try {
      const cert = await prisma.certification.create({
        data: {
          organisationId,
          name: d.name,
          issuingBody: d.issuingBody || null,
          description: d.description || null,
          validityMonths: d.validityMonths ?? null,
          isMandatory: d.isMandatory,
        },
      });

      await writeOrgAudit({
        organisationId,
        action: "hr.certification.created",
        category: "people",
        description: `Created certification "${cert.name}"`,
        entityType: "Certification",
        entityId: cert.id,
        ipAddress: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      });

      return NextResponse.json({ ok: true, item: cert }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: "A certification with this name already exists", fields: { name: "Already in use" } },
          { status: 422 }
        );
      }
      throw err;
    }
  }

  // ── Employee certification assignment ──
  if (!d.certificationId) {
    return NextResponse.json(
      { error: "Invalid payload", fields: { certificationId: "Certification is required" } },
      { status: 422 }
    );
  }

  const [employee, cert] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: d.employeeId, organisationId },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.certification.findFirst({
      where: { id: d.certificationId, organisationId },
      select: { id: true, name: true },
    }),
  ]);
  const fields: Record<string, string> = {};
  if (!employee) fields.employeeId = "Unknown employee";
  if (!cert) fields.certificationId = "Unknown certification";
  if (Object.keys(fields).length > 0) {
    return NextResponse.json({ error: "Invalid references", fields }, { status: 422 });
  }

  const expiryDate = d.expiryDate ? new Date(d.expiryDate) : null;
  const status = d.status ?? deriveStatus(expiryDate);

  try {
    const assignment = await prisma.employeeCertification.create({
      data: {
        employeeId: d.employeeId,
        certificationId: d.certificationId,
        status,
        issuedDate: d.issuedDate ? new Date(d.issuedDate) : null,
        expiryDate,
        certificateNumber: d.certificateNumber || null,
        notes: d.notes || null,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "hr.certification.assigned",
      category: "people",
      description: `Assigned "${cert!.name}" to ${employee!.firstName} ${employee!.lastName}`,
      entityType: "EmployeeCertification",
      entityId: assignment.id,
      metadata: { employeeId: d.employeeId, certificationId: d.certificationId, status },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, item: assignment }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error: "This employee already holds that certification",
          fields: { certificationId: "Already assigned" },
        },
        { status: 422 }
      );
    }
    throw err;
  }
}
