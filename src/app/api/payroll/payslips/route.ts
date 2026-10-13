import { NextRequest, NextResponse } from "next/server";
import { PayslipStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { intParam, strParam } from "@/lib/payroll";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";
import { parseEnum } from "@/lib/enums";

const PAGE = 25;

const createSchema = z.object({
  payRunId: z.string().trim().min(1, "A pay run is required"),
});

/** GET /api/payroll/payslips — paginated list with status / run / employee filters. */
export async function GET(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const { searchParams } = new URL(req.url);
  const status = parseEnum(PayslipStatus, strParam(searchParams.get("status") ?? undefined));
  const payRunId = strParam(searchParams.get("payRunId") ?? undefined);
  const q = strParam(searchParams.get("q") ?? undefined);
  const page = intParam(searchParams.get("page") ?? undefined, 1);

  const where: Prisma.PayslipWhereInput = {
    organisationId,
    ...(status ? { status } : {}),
    ...(payRunId ? { payRunId } : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.payslip.count({ where }),
    prisma.payslip.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        payRun: { select: { label: true } },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    total,
    items: rows.map((p) => ({
      id: p.id,
      employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
      employeeNumber: p.employee.employeeNumber,
      payRunId: p.payRunId,
      payRunLabel: p.payRun.label,
      periodStart: p.periodStart.toISOString(),
      periodEnd: p.periodEnd.toISOString(),
      grossPay: Number(p.grossPay),
      superAmount: Number(p.superAmount),
      taxAmount: Number(p.taxAmount),
      netPay: Number(p.netPay),
      status: p.status,
      issuedAt: p.issuedAt ? p.issuedAt.toISOString() : null,
      viewedAt: p.viewedAt ? p.viewedAt.toISOString() : null,
    })),
  });
}

/** POST /api/payroll/payslips — pre-create issued payslips from a run's lines. */
export async function POST(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const run = await prisma.payRun.findFirst({
    where: { id: parsed.data.payRunId, organisationId },
    include: {
      lines: {
        select: {
          employeeId: true,
          grossPay: true,
          superAmount: true,
          taxAmount: true,
          netPay: true,
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Pay run not found" }, { status: 404 });
  }

  if (run.status !== "APPROVED" && run.status !== "PAID") {
    return NextResponse.json(
      {
        error: `Payslips can only be generated for approved or paid runs (this run is ${run.status.replace(
          /_/g,
          " "
        )})`,
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const result = await prisma.payslip.createMany({
    data: run.lines.map((line) => ({
      organisationId,
      payRunId: run.id,
      employeeId: line.employeeId,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      grossPay: line.grossPay,
      superAmount: line.superAmount,
      taxAmount: line.taxAmount,
      netPay: line.netPay,
      status: "ISSUED" as const,
      issuedAt: now,
    })),
    skipDuplicates: true,
  });

  await writeOrgAudit({
    organisationId,
    action: "payroll.payslips.generated",
    category: "payroll",
    description: `Generated ${result.count} payslip${result.count === 1 ? "" : "s"} for "${run.label}"`,
    entityType: "PayRun",
    entityId: run.id,
    metadata: { created: result.count, lines: run.lines.length },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, created: result.count });
}
