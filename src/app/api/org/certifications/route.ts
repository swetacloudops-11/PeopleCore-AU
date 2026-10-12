import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z.union([z.string().regex(DATE_RE), z.literal("")]).optional();
const optText = z.union([z.string().trim().max(500), z.literal("")]).optional();

const createSchema = z.discriminatedUnion("kind", [
  // Create a certification in the catalogue.
  z.object({
    kind: z.literal("CATALOGUE"),
    name: z.string().trim().min(1, "Name is required"),
    issuingBody: optText,
    description: optText,
    validityMonths: z.coerce.number().int().min(1).max(120).optional(),
    isMandatory: z.boolean().default(false),
  }),
  // Assign a catalogue certification to an employee.
  z.object({
    kind: z.literal("ASSIGNMENT"),
    employeeId: z.string().min(1, "Employee is required"),
    certificationId: z.string().min(1, "Certification is required"),
    status: z.enum(["CURRENT", "EXPIRING", "EXPIRED", "PENDING"]).optional(),
    issuedDate: optDate,
    expiryDate: optDate,
    certificateNumber: optText,
    notes: optText,
  }),
]);

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

/** POST /api/org/certifications — create catalogue entry or assign one to an employee. */
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

  if (d.kind === "CATALOGUE") {
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
        action: "certification.created",
        category: "people",
        description: `Created certification "${cert.name}"`,
        entityType: "Certification",
        entityId: cert.id,
        ipAddress: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      });

      return NextResponse.json({ certification: cert }, { status: 201 });
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

  // ASSIGNMENT
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
      action: "certification.assigned",
      category: "people",
      description: `Assigned "${cert!.name}" to ${employee!.firstName} ${employee!.lastName}`,
      entityType: "EmployeeCertification",
      entityId: assignment.id,
      metadata: { employeeId: d.employeeId, certificationId: d.certificationId, status },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "This employee already holds that certification", fields: { certificationId: "Already assigned" } },
        { status: 422 }
      );
    }
    throw err;
  }
}
