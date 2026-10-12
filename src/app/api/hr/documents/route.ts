import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z.union([z.string().regex(DATE_RE), z.literal("")]).optional();
const optText = z.union([z.string().trim().max(300), z.literal("")]).optional();

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1).default("Other"),
  fileName: z.string().trim().min(1, "File name is required"),
  fileType: optText,
  fileSize: z.coerce.number().int().min(0).default(0),
  url: optText,
  expiryDate: optDate,
  isConfidential: z.boolean().default(false),
});

/** GET /api/hr/documents — paginated org-wide document register. Metadata only. */
export async function GET(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  const employeeId = (sp.get("employeeId") ?? "").trim();
  const confidential = sp.get("confidential") === "1";
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(sp.get("pageSize") ?? "25", 10) || 25)
  );

  const where = {
    organisationId,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { fileName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(confidential ? { isConfidential: true } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.employeeDocument.count({ where }),
    prisma.employeeDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

/**
 * POST /api/hr/documents — record document metadata.
 *
 * There is no real file storage: the caller sends only the file's name, type
 * and size (never its bytes) and we persist an EmployeeDocument row.
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

  // Cross-tenant safety: the target employee must belong to this organisation.
  const employee = await prisma.employee.findFirst({
    where: { id: d.employeeId, organisationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) {
    return NextResponse.json(
      { error: "Invalid references", fields: { employeeId: "Unknown employee" } },
      { status: 422 }
    );
  }

  // No real file storage — keep a stable metadata URL when none was supplied.
  const safeName = d.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const url = d.url || `/files/documents/${Date.now()}-${safeName}`;

  const created = await prisma.employeeDocument.create({
    data: {
      organisationId,
      employeeId: d.employeeId,
      title: d.title,
      category: d.category,
      fileName: d.fileName,
      fileType: d.fileType || null,
      fileSize: d.fileSize,
      url,
      isConfidential: d.isConfidential,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
      uploadedById: auth.ctx.session.id,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "hr.document.uploaded",
    category: "people",
    description: `Recorded document "${created.title}" for ${employee.firstName} ${employee.lastName}`,
    entityType: "EmployeeDocument",
    entityId: created.id,
    metadata: { employeeId: d.employeeId, category: created.category, isConfidential: created.isConfidential },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: created }, { status: 201 });
}
