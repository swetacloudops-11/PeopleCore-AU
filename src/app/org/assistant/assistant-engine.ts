import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, formatDateTime } from "@/lib/format";

/**
 * Deterministic "assistant" for an organisation admin.
 * No external AI API: each question is matched to an intent, answered with
 * real aggregates scoped to this tenant, and returned as plain language.
 * Server-only — never import from a client component.
 */

export type AssistantTable = { headers: string[]; rows: string[][] };

export type AssistantReply = {
  intent: string;
  answer: string;
  table?: AssistantTable | null;
};

export const SUGGESTIONS = [
  "How many employees do we have?",
  "Who is on leave today?",
  "What approvals are pending?",
  "What was our payroll total this month?",
  "Are there any roster conflicts?",
  "Who are our new starters?",
  "What are our top expense categories?",
  "How much leave liability do we carry?",
  "What shifts are coming up this week?",
  "How healthy are our integrations?",
];

type Handler = () => Promise<Omit<AssistantReply, "intent">>;

const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const daysAhead = (n: number) => {
  const x = dayStart(new Date());
  x.setDate(x.getDate() + n);
  return x;
};
const num = (v: unknown) => Number(v ?? 0);
const pct = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

type Intent = { intent: string; test: RegExp; run: (organisationId: string) => Handler };

const INTENTS: Intent[] = [
  {
    intent: "leave_liability",
    test: /leave liability|accrued leave|leave balance|entitlement|how much leave|unused leave/,
    run: (organisationId) => async () => {
      const year = new Date().getFullYear();
      const [agg, balances] = await Promise.all([
        prisma.leaveBalance.aggregate({
          where: { organisationId, year },
          _sum: { entitlement: true, taken: true, pending: true, carriedOver: true },
          _count: true,
        }),
        prisma.leaveBalance.groupBy({
          by: ["leaveTypeId"],
          where: { organisationId, year },
          _sum: { entitlement: true, taken: true, pending: true },
        }),
      ]);

      const types = await prisma.leaveType.findMany({
        where: { organisationId },
        select: { id: true, name: true },
      });
      const nameOf = (id: string) => types.find((t) => t.id === id)?.name ?? "Unknown type";

      const entitled = num(agg._sum.entitlement) + num(agg._sum.carriedOver);
      const taken = num(agg._sum.taken);
      const pending = num(agg._sum.pending);
      const remaining = Math.max(0, entitled - taken - pending);

      const table: AssistantTable = {
        headers: ["Leave type", "Entitled", "Taken", "Pending", "Remaining"],
        rows: balances
          .slice(0, 6)
          .map((b) => [
            nameOf(b.leaveTypeId),
            num(b._sum.entitlement).toFixed(1),
            num(b._sum.taken).toFixed(1),
            num(b._sum.pending).toFixed(1),
            Math.max(0, num(b._sum.entitlement) - num(b._sum.taken) - num(b._sum.pending)).toFixed(1),
          ]),
      };

      return {
        answer:
          agg._count === 0
            ? "No leave balances have been recorded for this leave year yet."
            : `For ${year}, ${entitled.toFixed(1)} days have been accrued across ${agg._count} balance record(s). ` +
              `${taken.toFixed(1)} days are taken, ${pending.toFixed(1)} pending — leaving about ${remaining.toFixed(1)} days of liability outstanding.`,
        table: agg._count === 0 ? null : table,
      };
    },
  },
  {
    intent: "on_leave",
    test: /on leave|who('?s)? (off|away)|away (today|this week)|leave (today|now|this week)|currently (on )?leave|who is (off|away)/,
    run: (organisationId) => async () => {
      const today = dayStart(new Date());
      const end = daysAhead(14);

      const [todayCount, upcoming] = await Promise.all([
        prisma.leaveRequest.count({
          where: {
            organisationId,
            status: "APPROVED",
            startDate: { lte: daysAhead(0) },
            endDate: { gte: today },
          },
        }),
        prisma.leaveRequest.findMany({
          where: {
            organisationId,
            status: "APPROVED",
            startDate: { lte: end },
            endDate: { gte: today },
          },
          orderBy: { startDate: "asc" },
          take: 8,
          include: {
            employee: { select: { firstName: true, lastName: true } },
            leaveType: { select: { name: true } },
          },
        }),
      ]);

      return {
        answer:
          todayCount === 0
            ? `Nobody is on approved leave today. ${upcoming.length} approved request(s) start within the next 14 days.`
            : `${todayCount} employee(s) are on approved leave today. ${upcoming.length} approved request(s) fall inside the next 14 days.`,
        table: upcoming.length
          ? {
              headers: ["Employee", "Leave type", "Dates"],
              rows: upcoming.map((l) => [
                `${l.employee.firstName} ${l.employee.lastName}`,
                l.leaveType.name,
                `${formatDate(l.startDate)} → ${formatDate(l.endDate)}`,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "pending_approvals",
    test: /pending|awaiting|approv|to review|needs? (my )?(action|review)|queue|waiting on/,
    run: (organisationId) => async () => {
      const [leave, timesheets, expenses, conflicts] = await Promise.all([
        prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
        prisma.timesheet.count({ where: { organisationId, status: "SUBMITTED" } }),
        prisma.expense.count({ where: { organisationId, status: "PENDING" } }),
        prisma.rosterConflict.count({
          where: { organisationId, resolved: false, severity: { in: ["ERROR", "WARNING"] } },
        }),
      ]);
      const total = leave + timesheets + expenses + conflicts;

      const pendingLeave = await prisma.leaveRequest.findMany({
        where: { organisationId, status: "PENDING" },
        orderBy: { appliedAt: "asc" },
        take: 6,
        include: {
          employee: { select: { firstName: true, lastName: true } },
          leaveType: { select: { name: true } },
        },
      });

      return {
        answer:
          total === 0
            ? "Nothing is waiting on you — there are no pending approvals right now."
            : `${total} item(s) need approval: ${leave} leave request(s), ${timesheets} timesheet(s), ${expenses} expense(s) and ${conflicts} roster conflict(s).`,
        table: {
          headers: ["Area", "Waiting"],
          rows: [
            ["Leave requests", String(leave)],
            ["Timesheets", String(timesheets)],
            ["Expenses", String(expenses)],
            ["Roster conflicts", String(conflicts)],
            ...pendingLeave.map((l) => [
              `↳ ${l.employee.firstName} ${l.employee.lastName}`,
              `${l.leaveType.name} · applied ${formatDate(l.appliedAt)}`,
            ]),
          ],
        },
      };
    },
  },
  {
    intent: "department_breakdown",
    test: /department|by team|which team|team breakdown|org(ani)?sation chart/,
    run: (organisationId) => async () => {
      const [groups, departments, total] = await Promise.all([
        prisma.employee.groupBy({
          by: ["departmentId"],
          where: { organisationId, employmentStatus: { not: "TERMINATED" } },
          _count: true,
        }),
        prisma.department.findMany({
          where: { organisationId },
          select: { id: true, name: true },
        }),
        prisma.employee.count({ where: { organisationId, employmentStatus: { not: "TERMINATED" } } }),
      ]);

      const nameOf = (id: string | null) =>
        id === null ? "Unassigned" : departments.find((d) => d.id === id)?.name ?? "Unassigned";

      const rows = groups
        .map((g) => [nameOf(g.departmentId), String(g._count), `${pct(g._count, total)}%`])
        .sort((a, b) => Number(b[1]) - Number(a[1]));

      return {
        answer: `${total} active employee(s) across ${rows.length} department group(s).`,
        table: { headers: ["Department", "Headcount", "Share"], rows },
      };
    },
  },
  {
    intent: "payroll",
    test: /payroll|gross pay|net pay|wages|salary bill|total pay|pay runs?/,
    run: (organisationId) => async () => {
      const since = daysAgo(30);
      const [agg, runs] = await Promise.all([
        prisma.payRun.aggregate({
          where: { organisationId, createdAt: { gte: since } },
          _sum: { grossPay: true, netPay: true, superAmount: true, taxAmount: true },
          _count: true,
        }),
        prisma.payRun.findMany({
          where: { organisationId },
          orderBy: { payDate: "desc" },
          take: 5,
          select: {
            label: true,
            payDate: true,
            status: true,
            grossPay: true,
            netPay: true,
            employeeCount: true,
          },
        }),
      ]);

      const gross = num(agg._sum.grossPay);
      const net = num(agg._sum.netPay);
      const superAmount = num(agg._sum.superAmount);
      const tax = num(agg._sum.taxAmount);

      return {
        answer:
          agg._count === 0
            ? "No pay runs have been created in the last 30 days."
            : `${agg._count} pay run(s) in the last 30 days total ${formatMoney(gross)} gross, ` +
              `${formatMoney(net)} net, ${formatMoney(superAmount)} super and ${formatMoney(tax)} PAYG withheld.`,
        table: runs.length
          ? {
              headers: ["Run", "Pay date", "Status", "Employees", "Gross"],
              rows: runs.map((r) => [
                r.label,
                formatDate(r.payDate),
                r.status,
                String(r.employeeCount),
                formatMoney(num(r.grossPay)),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "roster_conflicts",
    test: /conflict|clash|overlap|double.?book/,
    run: (organisationId) => async () => {
      const [total, bySeverity, recent] = await Promise.all([
        prisma.rosterConflict.count({ where: { organisationId, resolved: false } }),
        prisma.rosterConflict.groupBy({
          by: ["severity"],
          where: { organisationId, resolved: false },
          _count: true,
        }),
        prisma.rosterConflict.findMany({
          where: { organisationId, resolved: false },
          orderBy: { detectedAt: "desc" },
          take: 5,
          select: { type: true, severity: true, message: true },
        }),
      ]);
      const sev = (s: string) => bySeverity.find((b) => b.severity === s)?._count ?? 0;

      return {
        answer:
          total === 0
            ? "No open roster conflicts — the current roster is clean."
            : `${total} unresolved roster conflict(s): ${sev("ERROR")} error(s), ${sev("WARNING")} warning(s) and ${sev("INFO")} info note(s).`,
        table: recent.length
          ? {
              headers: ["Severity", "Type", "Detail"],
              rows: recent.map((c) => [c.severity, c.type.replace("_", " ").toLowerCase(), c.message]),
            }
          : null,
      };
    },
  },
  {
    intent: "expenses",
    test: /expense|spend|top categor|cost categor|where are we spending/,
    run: (organisationId) => async () => {
      const [agg, cats] = await Promise.all([
        prisma.expense.aggregate({
          where: { organisationId, status: { in: ["PENDING", "APPROVED", "REIMBURSED"] } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.expense.groupBy({
          by: ["category"],
          where: { organisationId, status: { in: ["PENDING", "APPROVED", "REIMBURSED"] } },
          _sum: { amount: true },
          _count: true,
          orderBy: { _sum: { amount: "desc" } },
          take: 6,
        }),
      ]);

      const total = num(agg._sum.amount);

      return {
        answer:
          agg._count === 0
            ? "No expenses have been recorded yet."
            : `${agg._count} expense claim(s) totalling ${formatMoney(total)}. Top categories below.`,
        table: cats.length
          ? {
              headers: ["Category", "Amount", "Share", "Claims"],
              rows: cats.map((c) => [
                c.category,
                formatMoney(num(c._sum.amount)),
                `${pct(num(c._sum.amount), total)}%`,
                String(c._count),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "upcoming_shifts",
    test: /shift|roster|schedule|who.?s working|on (the )?floor/,
    run: (organisationId) => async () => {
      const from = dayStart(new Date());
      const to = daysAhead(7);
      const [count, hours, shifts] = await Promise.all([
        prisma.shift.count({
          where: { organisationId, date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        }),
        prisma.shift.aggregate({
          where: { organisationId, date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
          _sum: { hours: true },
        }),
        prisma.shift.findMany({
          where: { organisationId, date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 8,
          include: { employee: { select: { firstName: true, lastName: true } } },
        }),
      ]);

      return {
        answer:
          count === 0
            ? "No shifts are scheduled in the next 7 days."
            : `${count} shift(s) are scheduled between ${formatDate(from)} and ${formatDate(to)}, totalling ${num(hours._sum.hours).toFixed(1)} hours.`,
        table: shifts.length
          ? {
              headers: ["Date", "Employee", "Time", "Hours", "Status"],
              rows: shifts.map((s) => [
                formatDate(s.date),
                `${s.employee.firstName} ${s.employee.lastName}`,
                `${s.startTime}–${s.endTime}`,
                num(s.hours).toFixed(1),
                s.status.replace("_", " ").toLowerCase(),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "new_starters_attrition",
    test: /new starter|who started|recently joined|joined (us|the)|attrition|leaver|termination|who left|exits?|turnover/,
    run: (organisationId) => async () => {
      const since = daysAgo(30);
      const [starters, departures, recent, total] = await Promise.all([
        prisma.employee.count({ where: { organisationId, hireDate: { gte: since } } }),
        prisma.employee.count({ where: { organisationId, terminationDate: { gte: since } } }),
        prisma.employee.findMany({
          where: { organisationId, hireDate: { gte: since } },
          orderBy: { hireDate: "desc" },
          take: 6,
          select: { firstName: true, lastName: true, hireDate: true, employmentStatus: true },
        }),
        prisma.employee.count({ where: { organisationId } }),
      ]);

      const net = starters - departures;
      return {
        answer:
          `In the last 30 days: ${starters} new starter(s), ${departures} departure(s) — net ${net >= 0 ? "+" : ""}${net}. ` +
          `Headcount is ${total}. Attrition over the period is ${pct(departures, total)}%.`,
        table: recent.length
          ? {
              headers: ["New starter", "Started", "Status"],
              rows: recent.map((e) => [
                `${e.firstName} ${e.lastName}`,
                formatDate(e.hireDate),
                e.employmentStatus,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "integration_health",
    test: /sync|integration|connector|xero|myob|data flow/,
    run: (organisationId) => async () => {
      const [total, success, failed, partial, agg, last] = await Promise.all([
        prisma.syncLog.count({ where: { organisationId } }),
        prisma.syncLog.count({ where: { organisationId, status: "SUCCESS" } }),
        prisma.syncLog.count({ where: { organisationId, status: "FAILED" } }),
        prisma.syncLog.count({ where: { organisationId, status: "PARTIAL" } }),
        prisma.syncLog.aggregate({
          where: { organisationId },
          _sum: { recordsSuccess: true, recordsFailed: true },
          _avg: { durationMs: true },
        }),
        prisma.syncLog.findFirst({
          where: { organisationId },
          orderBy: { startedAt: "desc" },
          include: { integration: { select: { name: true } } },
        }),
      ]);

      const rate = pct(success, total);
      return {
        answer:
          total === 0
            ? "No synchronisation runs have been recorded for this organisation yet."
            : `${total} sync run(s) logged — ${rate}% succeeded, ${failed} failed, ${partial} partial. ` +
              `${num(agg._sum.recordsSuccess)} record(s) synced (${num(agg._sum.recordsFailed)} failed) at an average of ${Math.round(num(agg._avg.durationMs))}ms.` +
              (last ? ` Latest: ${last.integration.name} · ${last.status} · ${formatDateTime(last.startedAt)}.` : ""),
        table: last
          ? {
              headers: ["Last run", "Integration", "Status", "Records", "Duration"],
              rows: [
                [
                  formatDateTime(last.startedAt),
                  last.integration.name,
                  last.status,
                  `${last.recordsSuccess}/${last.recordsTotal}`,
                  `${last.durationMs ?? 0}ms`,
                ],
              ],
            }
          : null,
      };
    },
  },
  {
    intent: "users_roles",
    test: /\busers?\b|\broles?\b|who has access|admin access|sign.?ins?\b/,
    run: (organisationId) => async () => {
      const [total, active, suspended, roles, noRole] = await Promise.all([
        prisma.user.count({ where: { organisationId } }),
        prisma.user.count({ where: { organisationId, status: "ACTIVE" } }),
        prisma.user.count({ where: { organisationId, status: "SUSPENDED" } }),
        prisma.role.count({ where: { organisationId } }),
        prisma.user.count({ where: { organisationId, roleAssignments: { none: {} } } }),
      ]);
      const roleRows = await prisma.role.findMany({
        where: { organisationId },
        select: { name: true, _count: { select: { assignments: true } } },
        orderBy: { name: "asc" },
      });

      return {
        answer:
          `${total} console account(s) belong to this organisation: ${active} active, ${suspended} suspended, ` +
          `${noRole} with no role assigned. ${roles} organisation role(s) are defined.`,
        table: roleRows.length
          ? {
              headers: ["Role", "Members"],
              rows: roleRows.map((r) => [r.name, String(r._count.assignments)]),
            }
          : null,
      };
    },
  },
  {
    intent: "headcount",
    test: /headcount|how many (employees|staff|people)|number of (employees|staff)|employee (count|numbers)|total (employees|staff)/,
    run: (organisationId) => async () => {
      const [total, groups] = await Promise.all([
        prisma.employee.count({ where: { organisationId } }),
        prisma.employee.groupBy({
          by: ["employmentStatus"],
          where: { organisationId },
          _count: true,
        }),
      ]);
      const countOf = (s: string) => groups.find((g) => g.employmentStatus === s)?._count ?? 0;
      const active =
        countOf("ACTIVE") + countOf("PROBATION") + countOf("CASUAL") +
        countOf("CONTRACT") + countOf("LEAVE");

      return {
        answer:
          total === 0
            ? "There are no employee records in this organisation yet."
            : `${total} employee(s) on record — ${active} active (${pct(active, total)}%), ` +
              `${countOf("TERMINATED")} terminated.`,
        table: groups.length
          ? {
              headers: ["Employment status", "Count"],
              rows: groups
                .map((g) => [g.employmentStatus, String(g._count)])
                .sort((a, b) => Number(b[1]) - Number(a[1])),
            }
          : null,
      };
    },
  },
];

export const CAPABILITIES = [
  "headcount and employment status",
  "who is on leave right now",
  "pending approvals (leave, timesheets, expenses, conflicts)",
  "payroll totals and recent pay runs",
  "roster conflicts",
  "new starters and attrition",
  "top expense categories",
  "leave liability and balances",
  "upcoming shifts",
  "integration / sync health",
  "org users and roles",
  "department breakdown",
];

export function describeCapabilities(): string {
  return CAPABILITIES.map((c) => `• ${c}`).join("\n");
}

/** Answer a natural-language question with real, tenant-scoped aggregates. */
export async function answerQuestion(
  organisationId: string,
  question: string
): Promise<AssistantReply> {
  const q = question.toLowerCase().trim();

  // Score every intent by how many of its patterns hit — the best match wins,
  // so mixed questions route sensibly.
  const scored = INTENTS.map((i) => ({
    intent: i,
    score: (q.match(new RegExp(i.test.source, "gi")) ?? []).length,
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const match = scored[0]?.intent;

  if (!match) {
    return {
      intent: "unknown",
      answer:
        `I can't answer that one yet — I only know how to answer questions about this organisation's own data.\n` +
        `Here is what I can help with:\n${describeCapabilities()}`,
      table: null,
    };
  }

  try {
    const reply = await match.run(organisationId)();
    return {
      intent: match.intent,
      answer: reply.answer,
      table: reply.table ?? null,
    };
  } catch (err) {
    console.error("[assistant] intent failed", match.intent, err);
    return {
      intent: match.intent,
      answer: "I hit a problem while pulling that data — please try again in a moment.",
      table: null,
    };
  }
}
