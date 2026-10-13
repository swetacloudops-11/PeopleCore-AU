import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { aiStatus, runAiToolLoop, type AiChatMessage, type AiTool } from "@/lib/ai/llm";
import { stpState } from "@/app/payroll/stp/derive";
import { answerNamedEmployee } from "@/lib/ai/lookup";
import type { AssistantReply } from "./assistant-engine";

export type PayrollAiContext = { organisationId: string; orgName: string; firstName: string };

const num = (v: unknown) => Number(v ?? 0);
const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const emptySchema: Record<string, unknown> = { type: "object", properties: {} };
const limitSchema = {
  type: "object",
  properties: { limit: { type: "number", description: "Max rows to return (1-10)" } },
};

/** Tools for the Payroll Admin console — scoped to the tenant. */
function makeTools(ctx: PayrollAiContext): AiTool[] {
  const org = ctx.organisationId;
  return [
    {
      name: "lookup_employee_pay",
      description:
        "Answer about ONE named employee's pay: pay basis, latest payslip, super accrued, PAYG records and super fund. Pass the name exactly as the user said it.",
      parameters: {
        type: "object",
        properties: { employee_name: { type: "string", description: "The employee's full name, e.g. 'Alice Rossi'" } },
        required: ["employee_name"],
      },
      execute: async (args) => {
        const q = String(args["employee_name"] ?? "").trim();
        if (!q) return { note: "No employee name provided." };
        return (await answerNamedEmployee(org, q, "payroll")) ?? { note: `No employee named "${q}" was found.` };
      },
    },
    {
      name: "get_payroll_totals",
      description: "Payroll totals for the last 30 days (gross, net, super, PAYG) plus recent pay runs.",
      parameters: limitSchema,
      execute: async () => {
        const [agg, runs] = await Promise.all([
          prisma.payRun.aggregate({
            where: { organisationId: org, createdAt: { gte: D(-30) } },
            _sum: { grossPay: true, netPay: true, superAmount: true, taxAmount: true },
            _count: true,
          }),
          prisma.payRun.findMany({
            where: { organisationId: org },
            orderBy: { payDate: "desc" },
            take: 6,
            select: { label: true, payDate: true, status: true, employeeCount: true, grossPay: true, netPay: true },
          }),
        ]);
        return {
          last30Days: {
            runs: agg._count,
            gross: formatMoney(num(agg._sum.grossPay)),
            net: formatMoney(num(agg._sum.netPay)),
            super: formatMoney(num(agg._sum.superAmount)),
            payg: formatMoney(num(agg._sum.taxAmount)),
          },
          recentRuns: runs.map((r) => ({
            label: r.label,
            payDate: formatDate(r.payDate),
            status: r.status,
            employees: r.employeeCount,
            gross: formatMoney(num(r.grossPay)),
            net: formatMoney(num(r.netPay)),
          })),
        };
      },
    },
    {
      name: "get_pay_run_approvals",
      description: "Pay runs awaiting approval and approved runs ready to finalise, plus submitted timesheets.",
      parameters: emptySchema,
      execute: async () => {
        const [pending, approved, submitted] = await Promise.all([
          prisma.payRun.findMany({
            where: { organisationId: org, status: "PENDING_APPROVAL" },
            orderBy: { payDate: "asc" },
            select: { label: true, payDate: true, employeeCount: true, grossPay: true },
          }),
          prisma.payRun.count({ where: { organisationId: org, status: "APPROVED" } }),
          prisma.timesheet.count({ where: { organisationId: org, status: "SUBMITTED" } }),
        ]);
        return {
          pendingApproval: pending.map((r) => ({
            run: r.label,
            payDate: formatDate(r.payDate),
            employees: r.employeeCount,
            gross: formatMoney(num(r.grossPay)),
          })),
          approvedReadyToFinalise: approved,
          submittedTimesheets: submitted,
        };
      },
    },
    {
      name: "get_payslips",
      description: "Payslip counts and net value by status (issued, viewed, pending).",
      parameters: emptySchema,
      execute: async () => {
        const [counts, sums, agg] = await Promise.all([
          prisma.payslip.groupBy({ by: ["status"], where: { organisationId: org }, _count: true }),
          prisma.payslip.groupBy({ by: ["status"], where: { organisationId: org }, _sum: { netPay: true } }),
          prisma.payslip.aggregate({ where: { organisationId: org }, _sum: { netPay: true, grossPay: true }, _count: true }),
        ]);
        return {
          total: agg._count,
          totalNet: formatMoney(num(agg._sum.netPay)),
          totalGross: formatMoney(num(agg._sum.grossPay)),
          byStatus: counts.map((c) => ({
            status: c.status,
            count: c._count,
            net: formatMoney(num(sums.find((s) => s.status === c.status)?._sum.netPay)),
          })),
        };
      },
    },
    {
      name: "get_timesheets",
      description: "Timesheet counts by status (draft, submitted, approved, rejected, paid).",
      parameters: emptySchema,
      execute: async () => {
        const byStatus = await prisma.timesheet.groupBy({
          by: ["status"],
          where: { organisationId: org },
          _count: true,
        });
        return {
          total: byStatus.reduce((a, b) => a + b._count, 0),
          byStatus: byStatus.map((b) => ({ status: b.status, count: b._count })),
        };
      },
    },
    {
      name: "get_pay_schedule",
      description: "Active pay schedules with frequency and next run date, plus the earliest open pay run.",
      parameters: emptySchema,
      execute: async () => {
        const [schedules, next] = await Promise.all([
          prisma.paySchedule.findMany({
            where: { organisationId: org, isActive: true },
            orderBy: { nextRunDate: "asc" },
            select: { name: true, frequency: true, nextRunDate: true },
          }),
          prisma.payRun.findFirst({
            where: { organisationId: org, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
            orderBy: { payDate: "asc" },
            select: { label: true, payDate: true, status: true },
          }),
        ]);
        return {
          schedules: schedules.map((s) => ({
            name: s.name,
            frequency: s.frequency,
            nextRunDate: s.nextRunDate ? formatDate(s.nextRunDate) : null,
          })),
          earliestOpenRun: next
            ? { label: next.label, payDate: formatDate(next.payDate), status: next.status }
            : null,
        };
      },
    },
    {
      name: "get_superannuation",
      description: "Superannuation: SG rate, accrued super, salary base and super within paid runs.",
      parameters: emptySchema,
      execute: async () => {
        const [setting, records, runs] = await Promise.all([
          prisma.orgSetting.findFirst({ where: { organisationId: org, key: "super_rate" }, select: { value: true } }),
          prisma.superannuationRecord.aggregate({
            where: { organisationId: org },
            _sum: { superAmount: true, salaryBase: true },
            _count: true,
          }),
          prisma.payRun.aggregate({ where: { organisationId: org, status: "PAID" }, _sum: { superAmount: true } }),
        ]);
        return {
          sgRate: setting?.value ? `${setting.value}%` : null,
          records: records._count,
          accrued: formatMoney(num(records._sum.superAmount)),
          salaryBase: formatMoney(num(records._sum.salaryBase)),
          superInPaidRuns: formatMoney(num(runs._sum.superAmount)),
        };
      },
    },
    {
      name: "get_payg",
      description: "PAYG withholding totals, PAYG records and the configured tax scale.",
      parameters: emptySchema,
      execute: async () => {
        const [records, runs, setting] = await Promise.all([
          prisma.paygRecord.aggregate({ where: { organisationId: org }, _sum: { grossPay: true }, _count: true }),
          prisma.payRun.aggregate({ where: { organisationId: org }, _sum: { taxAmount: true } }),
          prisma.orgSetting.findFirst({ where: { organisationId: org, key: "tax_scale" }, select: { value: true } }),
        ]);
        return {
          withheld: formatMoney(num(runs._sum.taxAmount)),
          paygRecords: records._count,
          grossCovered: formatMoney(num(records._sum.grossPay)),
          taxScale: setting?.value ?? null,
        };
      },
    },
    {
      name: "get_pay_categories",
      description: "Active pay categories grouped by type, plus multiplier (penalty) rates.",
      parameters: emptySchema,
      execute: async () => {
        const [byType, penalty] = await Promise.all([
          prisma.payCategory.groupBy({ by: ["type"], where: { organisationId: org, isActive: true }, _count: true }),
          prisma.payCategory.findMany({
            where: { organisationId: org, isActive: true, unit: "MULTIPLIER" },
            orderBy: { rate: "desc" },
            take: 10,
            select: { name: true, type: true, rate: true },
          }),
        ]);
        return {
          byType: byType.map((b) => ({ type: b.type, count: b._count })),
          penaltyRates: penalty.map((p) => ({ name: p.name, type: p.type, rate: `${num(p.rate).toFixed(2)}x` })),
        };
      },
    },
    {
      name: "get_stp_status",
      description: "Single Touch Payroll status derived from pay runs (accepted, ready to lodge).",
      parameters: emptySchema,
      execute: async () => {
        const runs = await prisma.payRun.findMany({
          where: { organisationId: org },
          orderBy: { payDate: "desc" },
          take: 8,
          select: { id: true, label: true, status: true, payDate: true, paidAt: true },
        });
        return runs.map((r) => {
          const s = stpState(r);
          return {
            run: r.label,
            payDate: formatDate(r.payDate),
            status: r.status,
            stp: s.label,
            reference: s.reference ?? null,
          };
        });
      },
    },
    {
      name: "get_top_earners",
      description: "Highest paid employees by total gross across all pay runs.",
      parameters: limitSchema,
      execute: async () => {
        const grouped = await prisma.payRunLine.groupBy({
          by: ["employeeId"],
          where: { payRun: { organisationId: org } },
          _sum: { grossPay: true },
          orderBy: { _sum: { grossPay: "desc" } },
          take: 6,
        });
        const employees = grouped.length
          ? await prisma.employee.findMany({
              where: { id: { in: grouped.map((g) => g.employeeId) } },
              select: { id: true, firstName: true, lastName: true, employeeNumber: true },
            })
          : [];
        return grouped.map((g) => {
          const e = employees.find((x) => x.id === g.employeeId);
          return {
            employee: e ? `${e.firstName} ${e.lastName}` : "Unknown",
            number: e?.employeeNumber ?? null,
            totalGross: formatMoney(num(g._sum.grossPay)),
          };
        });
      },
    },
    {
      name: "get_missing_details",
      description: "Payroll data gaps: active employees without super or pay details, and failed pay runs.",
      parameters: emptySchema,
      execute: async () => {
        const [noSuper, noPay, failed] = await Promise.all([
          prisma.employee.count({ where: { organisationId: org, employmentStatus: { not: "TERMINATED" }, superFundName: null } }),
          prisma.employee.count({ where: { organisationId: org, employmentStatus: { not: "TERMINATED" }, baseSalary: 0, hourlyRate: 0 } }),
          prisma.payRun.count({ where: { organisationId: org, status: "FAILED" } }),
        ]);
        return { employeesWithoutSuper: noSuper, employeesWithoutPay: noPay, failedPayRuns: failed };
      },
    },
    {
      name: "get_payroll_headcount",
      description: "Employees on record, active count, and how many appear in pay runs.",
      parameters: emptySchema,
      execute: async () => {
        const [total, byStatus, inRuns] = await Promise.all([
          prisma.employee.count({ where: { organisationId: org } }),
          prisma.employee.groupBy({ by: ["employmentStatus"], where: { organisationId: org }, _count: true }),
          prisma.payRunLine.findMany({
            where: { payRun: { organisationId: org } },
            distinct: ["employeeId"],
            select: { employeeId: true },
          }),
        ]);
        return {
          total,
          byStatus: byStatus.map((g) => ({ status: g.employmentStatus, count: g._count })),
          paidEmployees: inRuns.length,
        };
      },
    },
    {
      name: "get_sync_health",
      description: "Payroll integration sync health: total runs, success rate and the most recent run.",
      parameters: emptySchema,
      execute: async () => {
        const [total, success, failed, last] = await Promise.all([
          prisma.syncLog.count({ where: { organisationId: org } }),
          prisma.syncLog.count({ where: { organisationId: org, status: "SUCCESS" } }),
          prisma.syncLog.count({ where: { organisationId: org, status: "FAILED" } }),
          prisma.syncLog.findFirst({
            where: { organisationId: org },
            orderBy: { startedAt: "desc" },
            include: { integration: { select: { name: true } } },
          }),
        ]);
        return {
          totalRuns: total,
          succeeded: success,
          failed,
          successRate: total > 0 ? `${Math.round((success / total) * 100)}%` : null,
          lastRun: last
            ? { integration: last.integration.name, status: last.status, startedAt: formatDateTime(last.startedAt) }
            : null,
        };
      },
    },
  ];
}

const PAYROLL_PORTAL_GUIDE = `PORTAL GUIDE (Payroll Admin console):
- Dashboard: /payroll/dashboard
- Payroll Management: all pay runs /payroll/pay-runs, create /payroll/pay-runs/new, calculate /payroll/calculate, review /payroll/review, approve /payroll/approve, finalise /payroll/finalise
- Pay Schedules: /payroll/schedules, create /payroll/schedules/new, periods /payroll/schedules/periods
- Payroll Employees: /payroll/employees, salary /payroll/employees/salary, payment details /payroll/employees/payment-details, tax declarations /payroll/employees/tax-declarations
- Timesheets: /payroll/timesheets, pending /payroll/timesheets/pending, approved /payroll/timesheets/approved, variances /payroll/timesheets/variances
- Pay Categories: /payroll/categories, ordinary /payroll/categories/ordinary, overtime /payroll/categories/overtime, penalty rates /payroll/categories/penalty-rates, allowances /payroll/categories/allowances
- Tax & Superannuation: PAYG /payroll/tax/payg, super /payroll/tax/superannuation, declarations /payroll/tax/declarations, payroll tax /payroll/tax/payroll-tax
- Payslips: generate /payroll/payslips/generate, all /payroll/payslips, history /payroll/payslips/history
- Payroll Reports: summary /payroll/reports/summary, earnings /payroll/reports/earnings, tax /payroll/reports/tax, super /payroll/reports/superannuation, pay run reports /payroll/reports/pay-run
- Payroll Integrations: /payroll/integrations, mapping /payroll/integrations/mapping, sync /payroll/integrations/sync, logs /payroll/integrations/logs
- Payroll Exceptions: calculation errors /payroll/exceptions/calculation-errors, missing timesheets /payroll/exceptions/missing-timesheets, payment details /payroll/exceptions/payment-details, anomalies /payroll/exceptions/anomalies
- Single Touch Payroll: /payroll/stp, submission status /payroll/stp/status, history /payroll/stp/history
- Notifications: reminders /payroll/notifications/reminders, approvals /payroll/notifications/approvals, errors /payroll/notifications/errors
- Payroll Settings: /payroll/settings, pay run /payroll/settings/pay-run, categories /payroll/settings/categories, tax /payroll/settings/tax, super /payroll/settings/super, payslip /payroll/settings/payslip`;

function buildSystemPrompt(ctx: PayrollAiContext): string {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `You are the PeopleCore Payroll Admin assistant for ${ctx.orgName} (greeting user: ${ctx.firstName}).

Current date: ${dayNames[now.getDay()]}, ${formatDate(now)}.

RULES
- Answer ONLY from the tools provided — they return live payroll figures for this organisation. Never invent numbers, names or dates.
- Never expose employee bank details or tax file numbers, even if asked.
- If a tool returns empty data, say so plainly instead of guessing.
- Mirror the user's language: English or Hinglish.
- Keep answers short (2-5 sentences). Use compact bullets when listing. No markdown tables.
- For questions about one named person ("what did Alice get paid?", "is Samuel in today?"), call lookup_employee_pay.
- For "how do I / where do I" questions use the PORTAL GUIDE and give the exact route path, e.g. (/payroll/pay-runs).
- Money is AUD. Dates are Australian format (DD Mon YYYY).
- Explain payroll terms in plain language (gross, net, PAYG, super, STP, penalty rates).

${PAYROLL_PORTAL_GUIDE}`;
}

/** Try the live LLM; return null when unconfigured or failed. */
export async function answerWithAI(
  ctx: PayrollAiContext,
  question: string,
  history: AiChatMessage[] = []
): Promise<AssistantReply | null> {
  const status = aiStatus();
  if (!status.enabled) return null;

  const text = await runAiToolLoop({
    system: buildSystemPrompt(ctx),
    messages: [...history.slice(-6), { role: "user", content: question }],
    tools: makeTools(ctx),
  });
  if (!text) return null;

  return { intent: "ai", answer: text, table: null };
}
