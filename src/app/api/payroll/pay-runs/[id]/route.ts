import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

const SUPER_RATE = 0.115;
const TAX_RATE = 0.25;
const DEFAULT_HOURS = 38;

const actionSchema = z.object({
  action: z.enum(["calculate", "approve", "finalise", "fail"]),
  reason: z.string().trim().max(500).optional(),
});

/** Round a money value to whole cents. */
const cents = (n: number) => Math.round(n * 100) / 100;

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

/** GET /api/payroll/pay-runs/[id] — single run scoped to the caller's org. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const { id } = await params;
  const run = await prisma.payRun.findFirst({
    where: { id, organisationId },
    include: {
      paySchedule: { select: { name: true, frequency: true } },
      _count: { select: { lines: true, payslips: true } },
    },
  });
  if (!run) return NextResponse.json({ error: "Pay run not found" }, { status: 404 });

  return NextResponse.json({
    run: {
      id: run.id,
      label: run.label,
      status: run.status,
      employeeCount: run.employeeCount,
      periodStart: run.periodStart.toISOString(),
      periodEnd: run.periodEnd.toISOString(),
      payDate: run.payDate.toISOString(),
      approvedAt: run.approvedAt ? run.approvedAt.toISOString() : null,
      paidAt: run.paidAt ? run.paidAt.toISOString() : null,
      grossPay: Number(run.grossPay),
      superAmount: Number(run.superAmount),
      taxAmount: Number(run.taxAmount),
      netPay: Number(run.netPay),
      notes: run.notes,
      scheduleName: run.paySchedule?.name ?? null,
      lineCount: run._count.lines,
      payslipCount: run._count.payslips,
    },
  });
}

/**
 * PATCH /api/payroll/pay-runs/[id] — advance a run through the workflow.
 *
 *   DRAFT            → (calculate) → PENDING_APPROVAL
 *   PENDING_APPROVAL → (approve)   → APPROVED
 *   APPROVED         → (finalise)  → PAID (payslips generated)
 *   DRAFT/PENDING    → (fail)      → FAILED
 *
 * Every illegal transition returns 409 so a stale tab can never skip a stage.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId, session } = auth.ctx;

  const { id } = await params;
  const run = await prisma.payRun.findFirst({ where: { id, organisationId } });
  if (!run) return NextResponse.json({ error: "Pay run not found" }, { status: 404 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }
  const { action } = parsed.data;
  const now = new Date();

  let toStatus: string;
  let description: string;

  if (action === "calculate") {
    if (run.status !== "DRAFT") {
      return conflict(`Cannot calculate a pay run in ${run.status} status — only DRAFT runs can be calculated`);
    }

    const employees = await prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      select: {
        id: true,
        salaryType: true,
        baseSalary: true,
        hourlyRate: true,
        standardHoursPerWeek: true,
      },
      orderBy: { employeeNumber: "asc" },
    });

    const lines = employees.map((e) => {
      const std = Number(e.standardHoursPerWeek);
      const hoursWorked = std > 0 ? std : DEFAULT_HOURS;
      const grossPay =
        e.salaryType === "ANNUAL"
          ? cents(Number(e.baseSalary) / 26)
          : cents(Number(e.hourlyRate) * hoursWorked);
      const superAmount = cents(grossPay * SUPER_RATE);
      const taxAmount = cents(grossPay * TAX_RATE);
      const netPay = cents(grossPay - taxAmount);
      return {
        payRunId: id,
        employeeId: e.id,
        hoursWorked,
        grossPay,
        superAmount,
        taxAmount,
        netPay,
        breakdown: [
          { label: "Ordinary hours", amount: grossPay },
          { label: "Superannuation (11.5%)", amount: superAmount },
          { label: "PAYG withholding", amount: -taxAmount },
        ],
      };
    });

    // Recalculation is allowed: the unique (payRunId, employeeId) constraint
    // plus skipDuplicates keeps already-costed staff untouched.
    if (lines.length > 0) {
      await prisma.payRunLine.createMany({ data: lines, skipDuplicates: true });
    }

    const agg = await prisma.payRunLine.aggregate({
      where: { payRunId: id },
      _sum: { grossPay: true, superAmount: true, taxAmount: true, netPay: true },
      _count: true,
    });

    await prisma.payRun.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        employeeCount: agg._count,
        grossPay: Number(agg._sum.grossPay ?? 0),
        superAmount: Number(agg._sum.superAmount ?? 0),
        taxAmount: Number(agg._sum.taxAmount ?? 0),
        netPay: Number(agg._sum.netPay ?? 0),
      },
    });

    toStatus = "PENDING_APPROVAL";
    description = `Calculated pay run "${run.label}" — ${agg._count} line${agg._count === 1 ? "" : "s"}`;
  } else if (action === "approve") {
    if (run.status !== "PENDING_APPROVAL") {
      return conflict(`Cannot approve a pay run in ${run.status} status — only PENDING_APPROVAL runs can be approved`);
    }
    await prisma.payRun.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: now, approvedById: session.id },
    });
    toStatus = "APPROVED";
    description = `Approved pay run "${run.label}"`;
  } else if (action === "finalise") {
    if (run.status !== "APPROVED") {
      return conflict(`Cannot finalise a pay run in ${run.status} status — only APPROVED runs can be finalised`);
    }

    const payRunLines = await prisma.payRunLine.findMany({
      where: { payRunId: id },
      select: {
        employeeId: true,
        grossPay: true,
        superAmount: true,
        taxAmount: true,
        netPay: true,
      },
    });

    if (payRunLines.length > 0) {
      await prisma.payslip.createMany({
        data: payRunLines.map((l) => ({
          organisationId,
          payRunId: id,
          employeeId: l.employeeId,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          grossPay: l.grossPay,
          superAmount: l.superAmount,
          taxAmount: l.taxAmount,
          netPay: l.netPay,
          status: "ISSUED",
          issuedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.payRun.update({
      where: { id },
      data: { status: "PAID", paidAt: now },
    });

    toStatus = "PAID";
    description = `Finalised pay run "${run.label}" — ${payRunLines.length} payslip${payRunLines.length === 1 ? "" : "s"} issued`;
  } else {
    if (run.status !== "DRAFT" && run.status !== "PENDING_APPROVAL") {
      return conflict(`Cannot fail a pay run in ${run.status} status — only DRAFT or PENDING_APPROVAL runs can be failed`);
    }
    const reason = parsed.data.reason?.trim();
    await prisma.payRun.update({
      where: { id },
      data: { status: "FAILED", notes: reason || run.notes || null },
    });
    toStatus = "FAILED";
    description = `Marked pay run "${run.label}" as failed${reason ? ` — ${reason}` : ""}`;
  }

  await writeOrgAudit({
    organisationId,
    action: `payroll.pay_run.${action}`,
    category: "payroll",
    severity: action === "fail" ? "WARNING" : "INFO",
    description,
    entityType: "PayRun",
    entityId: id,
    metadata: { fromStatus: run.status, toStatus },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: toStatus });
}
