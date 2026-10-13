import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { stpState } from "@/app/payroll/stp/derive";
import { answerNamedEmployee } from "@/lib/ai/lookup";

/**
 * Deterministic "assistant" for the Payroll Admin console.
 * No external AI API required: each question is matched to an intent and
 * answered with real, tenant-scoped aggregates. Server-only.
 */

export type AssistantTable = { headers: string[]; rows: string[][] };

export type AssistantReply = {
  intent: string;
  answer: string;
  table?: AssistantTable | null;
};

export const SUGGESTIONS = [
  "What is our payroll total this month?",
  "Are there any pay runs awaiting approval?",
  "How many payslips are pending?",
  "When is the next pay run due?",
  "How much super have we accrued?",
  "What PAYG have we withheld?",
  "How many timesheets are waiting approval?",
  "What penalty rates do we have set up?",
  "What is our STP lodgement status?",
  "Who are our highest paid employees?",
  "What is Alice Rossi's pay?",
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const num = (v: unknown) => Number(v ?? 0);
const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));
const title = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

type Handler = () => Promise<Omit<AssistantReply, "intent">>;

type Intent = { intent: string; test: RegExp; run: (organisationId: string) => Handler };

const INTENTS: Intent[] = [
  {
    intent: "payroll_totals",
    test: /payroll total|total payroll|how much (did|have) we pay|wages|salary bill|payroll cost|gross pay|net pay|total pay|spend on payroll/,
    run: (organisationId) => async () => {
      const [agg, runs] = await Promise.all([
        prisma.payRun.aggregate({
          where: { organisationId, createdAt: { gte: daysAgo(30) } },
          _sum: { grossPay: true, netPay: true, superAmount: true, taxAmount: true },
          _count: true,
        }),
        prisma.payRun.findMany({
          where: { organisationId },
          orderBy: { payDate: "desc" },
          take: 6,
          select: { label: true, payDate: true, status: true, employeeCount: true, grossPay: true, netPay: true },
        }),
      ]);

      const gross = num(agg._sum.grossPay);
      const net = num(agg._sum.netPay);
      const superAmt = num(agg._sum.superAmount);
      const tax = num(agg._sum.taxAmount);

      return {
        answer:
          agg._count === 0
            ? "No pay runs have been processed in the last 30 days."
            : `Over the last 30 days, ${agg._count} pay run(s) totalled ${formatMoney(gross)} gross and ` +
              `${formatMoney(net)} net, with ${formatMoney(superAmt)} super and ${formatMoney(tax)} PAYG withheld.`,
        table: runs.length
          ? {
              headers: ["Run", "Pay date", "Status", "Employees", "Gross", "Net"],
              rows: runs.map((r) => [
                r.label,
                formatDate(r.payDate),
                title(r.status),
                String(r.employeeCount),
                formatMoney(num(r.grossPay)),
                formatMoney(num(r.netPay)),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "pending_approvals",
    test: /awaiting approval|pending approval|to approve|approve|needs? (my )?action|waiting|review (the )?pay/,
    run: (organisationId) => async () => {
      const [pending, approved, submitted] = await Promise.all([
        prisma.payRun.findMany({
          where: { organisationId, status: "PENDING_APPROVAL" },
          orderBy: { payDate: "asc" },
          select: { id: true, label: true, payDate: true, employeeCount: true, grossPay: true },
        }),
        prisma.payRun.count({ where: { organisationId, status: "APPROVED" } }),
        prisma.timesheet.count({ where: { organisationId, status: "SUBMITTED" } }),
      ]);

      return {
        answer:
          pending.length === 0 && approved === 0
            ? `Nothing is waiting on you — no pay runs need approval (${submitted} timesheet(s) are still submitted).`
            : `${pending.length} pay run(s) are pending approval and ${approved} approved run(s) are ready to finalise. ` +
              `${submitted} timesheet(s) are waiting to be approved.`,
        table: pending.length
          ? {
              headers: ["Run", "Pay date", "Employees", "Gross"],
              rows: pending.map((r) => [
                r.label,
                formatDate(r.payDate),
                String(r.employeeCount),
                formatMoney(num(r.grossPay)),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "payslips",
    test: /payslip|pay slip/,
    run: (organisationId) => async () => {
      const [byStatus, seen, agg] = await Promise.all([
        prisma.payslip.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
        prisma.payslip.groupBy({ by: ["status"], where: { organisationId }, _sum: { netPay: true } }),
        prisma.payslip.aggregate({ where: { organisationId }, _sum: { netPay: true, grossPay: true }, _count: true }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const netOf = (s: string) => num(seen.find((b) => b.status === s)?._sum.netPay);

      return {
        answer:
          agg._count === 0
            ? "No payslips have been generated yet."
            : `${agg._count} payslip(s) on record: ${countOf("ISSUED")} issued, ${countOf("VIEWED")} viewed by employees, ` +
              `${countOf("PENDING")} pending. Total net value is ${formatMoney(num(agg._sum.netPay))}.`,
        table: byStatus.length
          ? {
              headers: ["Status", "Payslips", "Net value"],
              rows: byStatus.map((b) => [title(b.status), String(b._count), formatMoney(netOf(b.status))]),
            }
          : null,
      };
    },
  },
  {
    intent: "timesheets",
    test: /timesheet|hours (submitted|approved)|time sheets?/,
    run: (organisationId) => async () => {
      const [byStatus, agg] = await Promise.all([
        prisma.timesheet.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
        prisma.timesheet.count({ where: { organisationId } }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

      return {
        answer:
          agg === 0
            ? "No timesheets have been recorded yet."
            : `${agg} timesheet(s) on file — ${countOf("SUBMITTED")} submitted (awaiting approval), ` +
              `${countOf("APPROVED")} approved, ${countOf("DRAFT")} draft and ${countOf("PAID")} already paid.`,
        table: byStatus.length
          ? {
              headers: ["Status", "Timesheets"],
              rows: byStatus
                .map((b) => [title(b.status), String(b._count)])
                .sort((a, b) => Number(b[1]) - Number(a[1])),
            }
          : null,
      };
    },
  },
  {
    intent: "next_pay_run",
    test: /next pay|when is pay|next run|pay date|pay schedule|pay cycle|when do we pay|upcoming pay/,
    run: (organisationId) => async () => {
      const [schedules, nextDraft] = await Promise.all([
        prisma.paySchedule.findMany({
          where: { organisationId, isActive: true },
          orderBy: { nextRunDate: "asc" },
          select: { name: true, frequency: true, payDay: true, nextRunDate: true },
        }),
        prisma.payRun.findFirst({
          where: { organisationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
          orderBy: { payDate: "asc" },
          select: { label: true, payDate: true, status: true },
        }),
      ]);

      const soonest = schedules.find((s) => s.nextRunDate);
      return {
        answer:
          schedules.length === 0
            ? "No active pay schedules are configured."
            : `${schedules.length} active pay schedule(s). ` +
              (soonest?.nextRunDate
                ? `The next run is ${soonest.name} on ${formatDate(soonest.nextRunDate)} (${title(soonest.frequency)}).`
                : "None have a next run date set.") +
              (nextDraft ? ` The earliest open pay run is "${nextDraft.label}" on ${formatDate(nextDraft.payDate)}.` : ""),
        table: schedules.length
          ? {
              headers: ["Schedule", "Frequency", "Next run"],
              rows: schedules.map((s) => [s.name, title(s.frequency), s.nextRunDate ? formatDate(s.nextRunDate) : "—"]),
            }
          : null,
      };
    },
  },
  {
    intent: "superannuation",
    test: /super(annuation)?|sg rate|super guarantee|retirement/,
    run: (organisationId) => async () => {
      const [setting, records, runAgg] = await Promise.all([
        prisma.orgSetting.findFirst({ where: { organisationId, key: "super_rate" }, select: { value: true } }),
        prisma.superannuationRecord.aggregate({
          where: { organisationId },
          _sum: { superAmount: true, salaryBase: true },
          _count: true,
        }),
        prisma.payRun.aggregate({ where: { organisationId, status: "PAID" }, _sum: { superAmount: true } }),
      ]);

      const accrued = num(records._sum.superAmount);
      const base = num(records._sum.salaryBase);
      const paidRunsSuper = num(runAgg._sum.superAmount);

      return {
        answer:
          `The super guarantee rate is set to ${setting?.value ? `${setting.value}%` : "not set"}. ` +
          (records._count === 0
            ? "No superannuation records have been accrued yet."
            : `${records._count} super record(s) have accrued ${formatMoney(accrued)} on a salary base of ` +
              `${formatMoney(base)}. Paid pay runs account for ${formatMoney(paidRunsSuper)} of super.`),
        table: records._count
          ? {
              headers: ["Metric", "Value"],
              rows: [
                ["SG rate", setting?.value ? `${setting.value}%` : "—"],
                ["Salary base", formatMoney(base)],
                ["Super accrued", formatMoney(accrued)],
                ["Super in paid runs", formatMoney(paidRunsSuper)],
              ],
            }
          : null,
      };
    },
  },
  {
    intent: "payg",
    test: /payg|withheld|withholding|tax withheld|\btax\b/,
    run: (organisationId) => async () => {
      const [records, runAgg, setting] = await Promise.all([
        prisma.paygRecord.aggregate({ where: { organisationId }, _sum: { grossPay: true }, _count: true }),
        prisma.payRun.aggregate({ where: { organisationId }, _sum: { taxAmount: true } }),
        prisma.orgSetting.findFirst({ where: { organisationId, key: "tax_scale" }, select: { value: true } }),
      ]);
      const withheld = num(runAgg._sum.taxAmount);

      return {
        answer:
          `PAYG withholding across all pay runs totals ${formatMoney(withheld)}. ` +
          (records._count === 0
            ? "No PAYG records have been created yet."
            : `${records._count} PAYG record(s) cover ${formatMoney(num(records._sum.grossPay))} of gross pay.`) +
          (setting?.value ? ` The tax scale is set to ${setting.value}.` : ""),
        table: records._count
          ? {
              headers: ["Metric", "Value"],
              rows: [
                ["PAYG records", String(records._count)],
                ["Gross covered", formatMoney(num(records._sum.grossPay))],
                ["Tax withheld (runs)", formatMoney(withheld)],
                ["Tax scale", setting?.value || "—"],
              ],
            }
          : null,
      };
    },
  },
  {
    intent: "pay_categories",
    test: /penalty rate|allowance|overtime|pay categor|categor(y|ies)|loading|shift rate/,
    run: (organisationId) => async () => {
      const [byType, penalty] = await Promise.all([
        prisma.payCategory.groupBy({ by: ["type"], where: { organisationId, isActive: true }, _count: true }),
        prisma.payCategory.findMany({
          where: { organisationId, isActive: true, unit: "MULTIPLIER" },
          orderBy: { rate: "desc" },
          take: 8,
          select: { name: true, type: true, rate: true, code: true },
        }),
      ]);
      const total = byType.reduce((a, b) => a + b._count, 0);

      return {
        answer:
          total === 0
            ? "No pay categories are configured yet."
            : `${total} active pay categor(y/ies) are configured${penalty.length ? `, including ${penalty.length} with a multiplier (penalty) rate` : ""}.`,
        table: penalty.length
          ? {
              headers: ["Category", "Type", "Rate"],
              rows: penalty.map((c) => [c.name, title(c.type), `${num(c.rate).toFixed(2)}×`]),
            }
          : byType.length
          ? {
              headers: ["Type", "Categories"],
              rows: byType.map((b) => [title(b.type), String(b._count)]),
            }
          : null,
      };
    },
  },
  {
    intent: "stp",
    test: /stp|single touch|lodge|lodgement|ato (report|submission)|submission status/,
    run: (organisationId) => async () => {
      const runs = await prisma.payRun.findMany({
        where: { organisationId },
        orderBy: { payDate: "desc" },
        take: 8,
        select: { id: true, label: true, status: true, payDate: true, paidAt: true },
      });
      const accepted = runs.filter((r) => stpState(r).state === "ACCEPTED").length;
      const ready = runs.filter((r) => stpState(r).state === "READY").length;

      return {
        answer:
          runs.length === 0
            ? "No pay runs exist yet, so there is nothing to lodge with the ATO."
            : `Single Touch Payroll is derived from pay-run status: ${accepted} run(s) accepted, ${ready} ready to lodge ` +
              `out of the ${runs.length} most recent run(s).`,
        table: runs.length
          ? {
              headers: ["Run", "Pay date", "Status", "STP"],
              rows: runs.map((r) => {
                const s = stpState(r);
                return [r.label, formatDate(r.payDate), title(r.status), s.reference ? `${s.label} (${s.reference})` : s.label];
              }),
            }
          : null,
      };
    },
  },
  {
    intent: "top_earners",
    test: /highest paid|top earners?|who earns|biggest (salar|pay)|most paid|top paid/,
    run: (organisationId) => async () => {
      const grouped = await prisma.payRunLine.groupBy({
        by: ["employeeId"],
        where: { payRun: { organisationId } },
        _sum: { grossPay: true },
        orderBy: { _sum: { grossPay: "desc" } },
        take: 6,
      });
      const ids = grouped.map((g) => g.employeeId);
      const employees = ids.length
        ? await prisma.employee.findMany({
            where: { id: { in: ids } },
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          })
        : [];
      const totalPaid = await prisma.payRunLine.aggregate({
        where: { payRun: { organisationId } },
        _sum: { grossPay: true },
      });
      const grand = num(totalPaid._sum.grossPay);

      return {
        answer:
          grouped.length === 0
            ? "No pay-run lines have been calculated yet."
            : `The highest paid employees by total gross across all pay runs are listed below (out of ${formatMoney(grand)} paid in total).`,
        table: grouped.length
          ? {
              headers: ["Employee", "Number", "Total gross", "Share"],
              rows: grouped.map((g) => {
                const e = employees.find((x) => x.id === g.employeeId);
                const amount = num(g._sum.grossPay);
                return [
                  e ? `${e.firstName} ${e.lastName}` : "—",
                  e?.employeeNumber ?? "—",
                  formatMoney(amount),
                  `${pct(amount, grand)}%`,
                ];
              }),
            }
          : null,
      };
    },
  },
  {
    intent: "missing_details",
    test: /missing|incomplete|no (super|pay)|without (super|bank)|setup|set up|anomal|issue|error/,
    run: (organisationId) => async () => {
      const [noSuper, noPay, terminated] = await Promise.all([
        prisma.employee.count({
          where: { organisationId, employmentStatus: { not: "TERMINATED" }, superFundName: null },
        }),
        prisma.employee.count({
          where: { organisationId, employmentStatus: { not: "TERMINATED" }, baseSalary: 0, hourlyRate: 0 },
        }),
        prisma.payRun.count({ where: { organisationId, status: "FAILED" } }),
      ]);
      const clear = noSuper === 0 && noPay === 0 && terminated === 0;

      return {
        answer: clear
          ? "No payroll data issues found — every active employee has super and pay details, and no pay runs have failed."
          : `${noSuper} active employee(s) have no super fund, ${noPay} have neither a salary nor an hourly rate, ` +
            `and ${terminated} pay run(s) are in a failed state.`,
        table: noSuper || noPay || terminated
          ? {
              headers: ["Issue", "Count"],
              rows: [
                ["No super fund", String(noSuper)],
                ["No pay details", String(noPay)],
                ["Failed pay runs", String(terminated)],
              ],
            }
          : null,
      };
    },
  },
  {
    intent: "payroll_employees",
    test: /how many (employees|staff|people)|headcount|employees (for|in) payroll|paid employees|staff (count|numbers)/,
    run: (organisationId) => async () => {
      const [total, byStatus, inRuns] = await Promise.all([
        prisma.employee.count({ where: { organisationId } }),
        prisma.employee.groupBy({ by: ["employmentStatus"], where: { organisationId }, _count: true }),
        prisma.payRunLine.findMany({
          where: { payRun: { organisationId } },
          distinct: ["employeeId"],
          select: { employeeId: true },
        }),
      ]);
      const active = byStatus
        .filter((g) => g.employmentStatus !== "TERMINATED")
        .reduce((a, b) => a + b._count, 0);

      return {
        answer:
          `${total} employee(s) on record — ${active} active. ${inRuns.length} of them appear in at least one pay run.`,
        table: byStatus.length
          ? {
              headers: ["Employment status", "Count"],
              rows: byStatus
                .map((g) => [title(g.employmentStatus), String(g._count)])
                .sort((a, b) => Number(b[1]) - Number(a[1])),
            }
          : null,
      };
    },
  },
  {
    intent: "integrations",
    test: /integrat|sync|xero|myob|quickbooks|connector|export/,
    run: (organisationId) => async () => {
      const [total, success, failed, last] = await Promise.all([
        prisma.syncLog.count({ where: { organisationId } }),
        prisma.syncLog.count({ where: { organisationId, status: "SUCCESS" } }),
        prisma.syncLog.count({ where: { organisationId, status: "FAILED" } }),
        prisma.syncLog.findFirst({
          where: { organisationId },
          orderBy: { startedAt: "desc" },
          include: { integration: { select: { name: true } } },
        }),
      ]);

      return {
        answer:
          total === 0
            ? "No payroll integration syncs have been recorded yet."
            : `${total} sync run(s) logged — ${pct(success, total)}% succeeded, ${failed} failed.` +
              (last ? ` Latest: ${last.integration.name} · ${title(last.status)} · ${formatDateTime(last.startedAt)}.` : ""),
        table: last
          ? {
              headers: ["Last sync", "Integration", "Status", "Records", "Duration"],
              rows: [
                [
                  formatDateTime(last.startedAt),
                  last.integration.name,
                  title(last.status),
                  `${last.recordsSuccess}/${last.recordsTotal}`,
                  `${last.durationMs ?? 0}ms`,
                ],
              ],
            }
          : null,
      };
    },
  },
];

export const CAPABILITIES = [
  "payroll totals and recent pay runs",
  "pay runs awaiting approval",
  "payslips by status",
  "pending and approved timesheets",
  "next pay run and schedules",
  "superannuation accruals and SG rate",
  "PAYG withholding",
  "pay categories and penalty rates",
  "Single Touch Payroll status",
  "highest paid employees",
  "missing pay/super details",
  "payroll integration sync health",
  "one employee's pay, super and PAYG",
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

  // A named employee ("what did Priya Menon get paid?") is answered directly,
  // before the aggregate intents, so existing behaviour is untouched.
  const named = await answerNamedEmployee(organisationId, question, "payroll");
  if (named) return { intent: named.intent, answer: named.answer, table: named.table ?? null };

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
        `I can't answer that one yet — I only know about this organisation's payroll data.\n` +
        `Here is what I can help with:\n${describeCapabilities()}`,
      table: null,
    };
  }

  try {
    const reply = await match.run(organisationId)();
    return { intent: match.intent, answer: reply.answer, table: reply.table ?? null };
  } catch (err) {
    console.error("[payroll-assistant] intent failed", match.intent, err);
    return {
      intent: match.intent,
      answer: "I hit a problem while pulling that data — please try again in a moment.",
      table: null,
    };
  }
}
