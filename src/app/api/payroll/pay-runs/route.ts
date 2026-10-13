import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

const STATUS_VALUES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "FAILED"] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z
  .object({
    label: z.string().trim().min(3, "Label must be at least 3 characters").max(120),
    payScheduleId: z.string().min(1).optional(),
    periodStart: dateStr,
    periodEnd: dateStr,
    payDate: dateStr,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.periodEnd >= d.periodStart, {
    message: "Period end must be on or after the period start",
    path: ["periodEnd"],
  });

/** Date-only inputs are calendar days — build them in UTC so the value
 *  round-trips through Prisma's @db.Date column regardless of server TZ. */
function dayOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** GET /api/payroll/pay-runs — paginated, status-filterable list. */
export async function GET(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const url = new URL(req.url);
  const rawStatus = (url.searchParams.get("status") ?? "").trim().toUpperCase();
  const status = (STATUS_VALUES as readonly string[]).includes(rawStatus)
    ? (rawStatus as (typeof STATUS_VALUES)[number])
    : undefined;
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "15", 10) || 15)
  );

  const where = { organisationId, ...(status ? { status } : {}) };

  const [total, runs] = await Promise.all([
    prisma.payRun.count({ where }),
    prisma.payRun.findMany({
      where,
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        paySchedule: { select: { name: true } },
        _count: { select: { lines: true, payslips: true } },
      },
    }),
  ]);

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      employeeCount: r.employeeCount,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      payDate: r.payDate.toISOString(),
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      grossPay: Number(r.grossPay),
      superAmount: Number(r.superAmount),
      taxAmount: Number(r.taxAmount),
      netPay: Number(r.netPay),
      notes: r.notes,
      scheduleName: r.paySchedule?.name ?? null,
      lineCount: r._count.lines,
      payslipCount: r._count.payslips,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/** POST /api/payroll/pay-runs — create a draft pay run. */
export async function POST(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  // Cross-tenant check on the linked schedule before it is written.
  if (d.payScheduleId) {
    const schedule = await prisma.paySchedule.findFirst({
      where: { id: d.payScheduleId, organisationId },
      select: { id: true },
    });
    if (!schedule) {
      return NextResponse.json(
        { error: "Pay schedule not found", fields: { payScheduleId: "Unknown pay schedule" } },
        { status: 404 }
      );
    }
  }

  const payRun = await prisma.payRun.create({
    data: {
      organisationId,
      label: d.label,
      periodStart: dayOnly(d.periodStart),
      periodEnd: dayOnly(d.periodEnd),
      payDate: dayOnly(d.payDate),
      payScheduleId: d.payScheduleId ?? null,
      notes: d.notes || null,
      status: "DRAFT",
      employeeCount: 0,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "payroll.pay_run.created",
    category: "payroll",
    description: `Created draft pay run "${payRun.label}"`,
    entityType: "PayRun",
    entityId: payRun.id,
    metadata: {
      periodStart: payRun.periodStart.toISOString(),
      periodEnd: payRun.periodEnd.toISOString(),
      payDate: payRun.payDate.toISOString(),
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    { ok: true, item: { id: payRun.id, label: payRun.label, status: payRun.status } },
    { status: 201 }
  );
}
