import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  action: z.enum(["ISSUE", "VIEW"]),
});

/** PATCH /api/org/payslips/[id] — mark a payslip issued or viewed. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  if (!payslip || payslip.organisationId !== organisationId) {
    return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const employee = `${payslip.employee.firstName} ${payslip.employee.lastName}`;
  const now = new Date();

  if (parsed.data.action === "ISSUE") {
    if (payslip.status !== "PENDING") {
      return NextResponse.json(
        { error: `This payslip is already ${payslip.status}` },
        { status: 422 }
      );
    }
    await prisma.payslip.update({
      where: { id },
      data: { status: "ISSUED", issuedAt: now },
    });
    await writeOrgAudit({
      organisationId,
      action: "payslip.issued",
      category: "payroll",
      description: `Issued payslip for ${employee}`,
      entityType: "Payslip",
      entityId: id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, status: "ISSUED" });
  }

  // VIEW
  if (payslip.status === "PENDING") {
    return NextResponse.json(
      { error: "Issue the payslip before marking it viewed" },
      { status: 422 }
    );
  }
  if (payslip.status === "VIEWED") {
    return NextResponse.json({ ok: true, status: "VIEWED" });
  }

  await prisma.payslip.update({
    where: { id },
    data: { status: "VIEWED", viewedAt: now },
  });

  await writeOrgAudit({
    organisationId,
    action: "payslip.viewed",
    category: "payroll",
    description: `Payslip for ${employee} recorded as viewed`,
    entityType: "Payslip",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: "VIEWED" });
}
