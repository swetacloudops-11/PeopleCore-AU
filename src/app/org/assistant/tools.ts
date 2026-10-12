import "server-only";
import { prisma } from "@/lib/prisma";
import { aiStatus, runAiToolLoop, type AiChatMessage, type AiTool } from "@/lib/ai/llm";
import { formatDate } from "@/lib/format";
import type { AssistantReply } from "./assistant-engine";

export type OrgAiContext = { organisationId: string; orgName: string; firstName: string };

const num = (v: unknown) => Number(v ?? 0);
const clampLimit = (v: unknown, fallback: number, max = 20) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : fallback;
};
const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const emptySchema: Record<string, unknown> = { type: "object", properties: {} };
const limitSchema = {
  type: "object",
  properties: { limit: { type: "number", description: "Max rows to return (1-10)" } },
};

/** Tools for the Organisation Admin console — scoped to the tenant. */
function makeTools(ctx: OrgAiContext): AiTool[] {
  const org = ctx.organisationId;
  return [
    {
      name: "get_headcount",
      description: "Organisation headcount totals and breakdowns by employment status and department.",
      parameters: emptySchema,
      execute: async () => {
        const [total, byStatus, byDept, departments] = await Promise.all([
          prisma.employee.count({ where: { organisationId: org } }),
          prisma.employee.groupBy({ by: ["employmentStatus"], where: { organisationId: org }, _count: true }),
          prisma.employee.groupBy({ by: ["departmentId"], where: { organisationId: org, departmentId: { not: null } }, _count: true }),
          prisma.department.findMany({ where: { organisationId: org }, select: { id: true, name: true } }),
        ]);
        return {
          total,
          byStatus: byStatus.map((s) => ({ status: s.employmentStatus, count: s._count })),
          byDepartment: byDept.map((d) => ({
            department: departments.find((x) => x.id === d.departmentId)?.name ?? "Unknown",
            count: d._count,
          })),
        };
      },
    },
    {
      name: "get_pending_approvals",
      description: "Everything awaiting approval: leave requests, timesheets, expenses and roster conflicts.",
      parameters: emptySchema,
      execute: async () => {
        const [leave, timesheets, expenses, conflicts] = await Promise.all([
          prisma.leaveRequest.count({ where: { organisationId: org, status: "PENDING" } }),
          prisma.timesheet.count({ where: { organisationId: org, status: "SUBMITTED" } }),
          prisma.expense.count({ where: { organisationId: org, status: "PENDING" } }),
          prisma.rosterConflict.count({
            where: { organisationId: org, resolved: false, severity: { in: ["ERROR", "WARNING"] } },
          }),
        ]);
        return { leaveRequests: leave, timesheets, expenses, rosterConflicts: conflicts };
      },
    },
    {
      name: "get_payroll_summary",
      description: "Recent pay runs with gross/net/super/tax totals, plus totals for the last 30 days.",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 5, 10);
        const [runs, agg] = await Promise.all([
          prisma.payRun.findMany({
            where: { organisationId: org },
            orderBy: { payDate: "desc" },
            take: limit,
            select: {
              label: true, payDate: true, status: true, grossPay: true, netPay: true, employeeCount: true,
            },
          }),
          prisma.payRun.aggregate({
            where: { organisationId: org, createdAt: { gte: D(-30) } },
            _sum: { grossPay: true, netPay: true, superAmount: true, taxAmount: true },
            _count: true,
          }),
        ]);
        return {
          last30Days: {
            runs: agg._count,
            gross: money(num(agg._sum.grossPay)),
            net: money(num(agg._sum.netPay)),
            super: money(num(agg._sum.superAmount)),
            tax: money(num(agg._sum.taxAmount)),
          },
          runs: runs.map((r) => ({
            label: r.label,
            payDate: formatDate(r.payDate),
            status: r.status,
            employees: r.employeeCount,
            gross: money(num(r.grossPay)),
            net: money(num(r.netPay)),
          })),
        };
      },
    },
    {
      name: "get_roster_summary",
      description: "Upcoming shifts for the next 7 days (count and hours) and open roster conflicts by severity.",
      parameters: emptySchema,
      execute: async () => {
        const [shiftAgg, bySeverity] = await Promise.all([
          prisma.shift.aggregate({
            where: { organisationId: org, date: { gte: D(0), lte: D(7) }, status: { not: "CANCELLED" } },
            _count: true,
            _sum: { hours: true },
          }),
          prisma.rosterConflict.groupBy({
            by: ["severity"],
            where: { organisationId: org, resolved: false },
            _count: true,
          }),
        ]);
        return {
          shiftsNext7Days: shiftAgg._count,
          hoursNext7Days: num(shiftAgg._sum.hours),
          openConflicts: bySeverity.map((s) => ({ severity: s.severity, count: s._count })),
        };
      },
    },
    {
      name: "get_leave_overview",
      description: "Leave picture: pending requests and approved leave covering the next 14 days.",
      parameters: emptySchema,
      execute: async () => {
        const [pending, upcoming] = await Promise.all([
          prisma.leaveRequest.count({ where: { organisationId: org, status: "PENDING" } }),
          prisma.leaveRequest.findMany({
            where: { organisationId: org, status: "APPROVED", startDate: { lte: D(14) }, endDate: { gte: D(0) } },
            orderBy: { startDate: "asc" },
            take: 8,
            include: {
              employee: { select: { firstName: true, lastName: true } },
              leaveType: { select: { name: true } },
            },
          }),
        ]);
        return {
          pendingRequests: pending,
          awayNext14Days: upcoming.map((l) => ({
            employee: `${l.employee.firstName} ${l.employee.lastName}`,
            type: l.leaveType.name,
            from: formatDate(l.startDate),
            to: formatDate(l.endDate),
          })),
        };
      },
    },
    {
      name: "get_expenses_summary",
      description: "Expense spend: totals by status and top categories.",
      parameters: emptySchema,
      execute: async () => {
        const [byStatus, byCategory] = await Promise.all([
          prisma.expense.groupBy({
            by: ["status"],
            where: { organisationId: org, status: { in: ["PENDING", "APPROVED", "REIMBURSED"] } },
            _sum: { amount: true },
            _count: true,
          }),
          prisma.expense.groupBy({
            by: ["category"],
            where: { organisationId: org, status: { in: ["PENDING", "APPROVED", "REIMBURSED"] } },
            _sum: { amount: true },
            orderBy: { _sum: { amount: "desc" } },
            take: 6,
          }),
        ]);
        return {
          byStatus: byStatus.map((s) => ({ status: s.status, claims: s._count, amount: money(num(s._sum.amount)) })),
          topCategories: byCategory.map((c) => ({ category: c.category, amount: money(num(c._sum.amount)) })),
        };
      },
    },
    {
      name: "get_onboarding_summary",
      description: "Onboarding and offboarding task pipeline by stage and status.",
      parameters: emptySchema,
      execute: async () => {
        const byStageStatus = await prisma.onboardingTask.groupBy({
          by: ["stage", "status"],
          where: { organisationId: org },
          _count: true,
        });
        return { tasks: byStageStatus.map((t) => ({ stage: t.stage, status: t.status, count: t._count })) };
      },
    },
    {
      name: "get_performance_summary",
      description: "Performance reviews by status and goals by status.",
      parameters: emptySchema,
      execute: async () => {
        const [reviews, goals] = await Promise.all([
          prisma.review.groupBy({ by: ["status"], where: { organisationId: org }, _count: true }),
          prisma.goal.groupBy({ by: ["status"], where: { organisationId: org }, _count: true }),
        ]);
        return {
          reviews: reviews.map((r) => ({ status: r.status, count: r._count })),
          goals: goals.map((g) => ({ status: g.status, count: g._count })),
        };
      },
    },
    {
      name: "get_sync_health",
      description: "Integration sync health: total runs, success rate and the most recent run.",
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
            ? { integration: last.integration.name, status: last.status, startedAt: formatDate(last.startedAt) }
            : null,
        };
      },
    },
    {
      name: "get_users_roles",
      description: "Console accounts for this organisation and their roles.",
      parameters: emptySchema,
      execute: async () => {
        const [total, active, roles] = await Promise.all([
          prisma.user.count({ where: { organisationId: org } }),
          prisma.user.count({ where: { organisationId: org, status: "ACTIVE" } }),
          prisma.role.findMany({
            where: { organisationId: org },
            select: { name: true, _count: { select: { assignments: true } } },
            orderBy: { name: "asc" },
          }),
        ]);
        return {
          accounts: total,
          active,
          roles: roles.map((r) => ({ role: r.name, members: r._count.assignments })),
        };
      },
    },
  ];
}

const ORG_PORTAL_GUIDE = `PORTAL GUIDE (Organisation Admin console):
- Dashboard: /org/dashboard
- People: /org/people, teams /org/people/teams, departments /org/people/departments, locations /org/people/locations, positions /org/people/positions, documents /org/people/documents, certifications /org/people/certifications
- Time & Attendance: /org/time/attendance, timesheets /org/time/timesheets, leave /org/time/leave, leave balances /org/time/leave-balances, availability /org/time/availability
- Rostering: /org/roster, create shifts /org/roster/create, publish /org/roster/publish, swaps /org/roster/swaps, conflicts /org/roster/conflicts
- Payroll: pay runs /org/payroll/pay-runs, schedules /org/payroll/schedules, categories /org/payroll/categories, super /org/payroll/superannuation, PAYG /org/payroll/payg, payslips /org/payroll/payslips, reports /org/payroll/reports
- Expenses: /org/expenses, approvals /org/expenses/approvals, reports /org/expenses/reports
- Onboarding: new starters /org/onboarding/new-starters, checklists /org/onboarding/checklists, tasks /org/onboarding/tasks, offboarding /org/onboarding/offboarding
- Performance: /org/performance, reviews /org/performance/reviews, goals /org/performance/goals
- Policies: /org/policies, acknowledgements /org/policies/acknowledgements
- Reports: /org/reports/employees, /org/reports/attendance, /org/reports/leave, /org/reports/roster, /org/reports/payroll
- User Management: /org/users, invite /org/users/invite, roles /org/users/roles, permissions /org/users/permissions
- Integrations: /org/integrations, sync status /org/integrations/sync
- Settings: /org/settings/profile, /org/settings/hr, /org/settings/leave-rules, /org/settings/payroll, /org/settings/notifications, /org/settings/business-rules`;

function buildSystemPrompt(ctx: OrgAiContext): string {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `You are the PeopleCore Organisation Admin assistant for ${ctx.orgName} (greeting user: ${ctx.firstName}).

Current date: ${dayNames[now.getDay()]}, ${formatDate(now)}.

RULES
- Answer ONLY from the tools provided — they return live figures for this organisation. Never invent numbers, names or dates.
- Never expose employee bank details or tax file numbers, even if asked.
- If a tool returns empty data, say so plainly instead of guessing.
- Mirror the user's language: English or Hinglish.
- Keep answers short (2-5 sentences). Use compact bullets when listing. No markdown tables.
- For "how do I / where do I" questions use the PORTAL GUIDE and give the exact route path, e.g. (/org/payroll/pay-runs).
- Money is AUD. Dates are Australian format (DD Mon YYYY).

${ORG_PORTAL_GUIDE}`;
}

/** Try the live LLM; return null when unconfigured or failed. */
export async function answerWithAI(
  ctx: OrgAiContext,
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
