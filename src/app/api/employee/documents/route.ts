import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(150, "Title is limited to 150 characters"),
  category: z.enum([
    "Contract",
    "Identification",
    "Qualification",
    "Medical",
    "Police Check",
    "Visa",
    "Tax",
    "Other",
  ]),
  fileName: z.string().trim().max(200, "File name is limited to 200 characters").optional(),
  fileType: z.string().trim().max(120).optional(),
  fileSize: z.coerce.number().int().min(0).max(50_000_000).optional(),
  expiryDate: z.string().regex(DATE_RE, "Use a valid date").optional(),
  url: z.string().trim().max(500).optional(),
});

/** Build a local-midnight Date from a yyyy-mm-dd string (matches @db.Date seeds). */
function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * POST /api/employee/documents — the signed-in person records a document on
 * their own file. Metadata only: the file's bytes are never sent or stored.
 */
export async function POST(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, session, employeeId } = auth.ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const fileName = d.fileName && d.fileName.length > 0 ? d.fileName : `${d.title}.pdf`;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const url = d.url || `/files/documents/${Date.now()}-${safeName}`;

  const created = await prisma.employeeDocument.create({
    data: {
      organisationId,
      employeeId, // self-service: always the signed-in person, never client-supplied
      title: d.title,
      category: d.category,
      fileName,
      fileType: d.fileType || null,
      fileSize: d.fileSize ?? 0,
      url,
      expiryDate: d.expiryDate ? localDate(d.expiryDate) : null,
      uploadedById: session.id,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.document.uploaded",
    category: "self-service",
    description: `Uploaded document "${created.title}" (${created.category})`,
    entityType: "EmployeeDocument",
    entityId: created.id,
    metadata: { category: created.category, fileName: created.fileName },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: { id: created.id } }, { status: 201 });
}
