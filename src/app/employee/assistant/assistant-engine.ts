import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Deterministic employee assistant.
 *
 * No external AI API: each question is matched to an intent and answered with
 * the signed-in person's OWN data (never org-wide figures) — plus "how do I /
 * where do I" guidance for the portal itself. Server-only — never import from
 * a client component.
 */

export type AssistantTable = { headers: string[]; rows: string[][] };

export type AssistantReply = {
  intent: string;
  answer: string;
  table?: AssistantTable | null;
};

export const SUGGESTIONS = [
  "When is my next shift?",
  "How much leave do I have left?",
  "Where do I apply for leave?",
  "Am I clocked in today?",
  "What's my latest payslip?",
  "How do I submit my timesheet?",
  "My pending tasks",
  "How do I request a shift swap?",
  "My expense claim status",
  "How do I change my password?",
];

export const CAPABILITIES = [
  "your upcoming shifts and schedule",
  "your clock in / out status and hours",
  "your timesheets and their status",
  "your leave balance and requests",
  "your payslips and year-to-date pay",
  "your expense claims",
  "your documents and policies",
  "your pending and overdue tasks",
  "your notifications",
  "your own profile details",
  "where any portal feature lives",
];

type Ctx = {
  employeeId: string;
  userId: string;
  organisationId: string;
  firstName: string;
  question: string;
};
type Result = Omit<AssistantReply, "intent">;
type Intent = { intent: string; test: RegExp; run: (ctx: Ctx) => Promise<Result> };

const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const daysAhead = (n: number) => {
  const x = dayStart(new Date());
  x.setDate(x.getDate() + n);
  return x;
};
const num = (v: unknown) => Number(v ?? 0);

// ─────────────────────────── portal help ───────────────────────────

const HELP_TOPICS: Array<{ test: RegExp; answer: string }> = [
  {
    test: /apply.*leave|request.*leave|book.*leave|take.*leave|leave.*apply|chhutti/,
    answer:
      "Apply for leave from **Leave Management → Apply for Leave** (`/employee/leave/new`).\n" +
      "Pick the leave type, your dates and add a short reason — it goes straight to your manager as Pending. Track the decision under **My Leave Requests** (`/employee/leave`).",
  },
  {
    test: /clock|attendance|punch|sign in.*shift|start.*shift|end.*shift/,
    answer:
      "Clock in and out from **Time & Attendance → Clock In / Clock Out** (`/employee/attendance`).\n" +
      "Press **Clock in** when you start and **Clock out** when you finish — your hours are recorded automatically. Your history is under **My Attendance History** (`/employee/attendance/history`).",
  },
  {
    test: /timesheet|submit.*hours|log.*hours|fill.*hours/,
    answer:
      "Submit your hours from **Time & Attendance → Submit Timesheet** (`/employee/timesheets/new`).\n" +
      "Pick the week, enter your start/finish times per day, then **Save & submit**. Draft timesheets can be submitted later from **My Timesheets** (`/employee/timesheets`).",
  },
  {
    test: /payslip|pay slip|salary|see.*pay|download.*pay|how.*(paid|much.*earn)/,
    answer:
      "Your payslips are under **My Payroll → My Payslips** (`/employee/payslips`) — gross, tax, super and net for every pay period.\n" +
      "Pay history is on `/employee/payroll/history` and your payment/super details on `/employee/payroll/details`. To change bank or super details, contact HR.",
  },
  {
    test: /expense|claim.*money|reimburse|get.*reimbursed|receipt/,
    answer:
      "Submit an expense from **My Expenses → Submit Expense Claim** (`/employee/expenses/new`).\n" +
      "Add the category, amount, date and (optionally) a receipt. Track decisions under **My Expense Claims** (`/employee/expenses`) and withdraw any PENDING claim there.",
  },
  {
    test: /swap|exchange.*shift|cover.*shift|someone.*cover|trade.*shift/,
    answer:
      "Request a shift swap from **My Roster → Request Shift Swap** (`/employee/roster/swaps`).\n" +
      "Choose one of your upcoming shifts, optionally suggest a teammate, and add a reason. You can cancel your own PENDING requests from the same page.",
  },
  {
    test: /availability|when.*available|unavailable|can.?not work|change.*hours.*available/,
    answer:
      "Set your weekly availability under **My Roster → My Availability** (`/employee/availability`).\n" +
      "Toggle each day on/off and set your preferred start and finish times — your rostering team uses this when building the roster.",
  },
  {
    test: /upload.*document|add.*document|attach.*file|send.*document|id.*upload/,
    answer:
      "Upload documents from **My Documents → Upload Documents** (`/employee/documents/upload`).\n" +
      "Everything you've uploaded lives under **Employment Documents** (`/employee/documents`). What you still owe after onboarding is on **Required Documents** (`/employee/onboarding/documents`).",
  },
  {
    test: /polic|acknowledg|handbook|code of conduct|sign.*policy/,
    answer:
      "Read company policies under **My Documents → Company Policies** (`/employee/policies`).\n" +
      "Sign them on **Policy Acknowledgements** (`/employee/policies/acknowledgements`) — press **I acknowledge** on each PENDING or OVERDUE policy.",
  },
  {
    test: /password|change.*password|reset.*password|login.*details|pass ?word/,
    answer:
      "Change your password from **My Settings → Change Password** (`/employee/settings/password`).\n" +
      "Enter your current password once and the new one twice. Your account and notification preferences are also under **My Settings** (`/employee/settings`).",
  },
  {
    test: /profile|my details|update.*phone|update.*address|emergency contact|personal.*email/,
    answer:
      "View your record on **My Profile** (`/employee/profile`) — personal, contact, employment and emergency-contact sections.\n" +
      "You can update your preferred name, phone, personal email and emergency contacts via **Update Profile** (`/employee/profile/edit`). Employment and payroll details are managed by HR.",
  },
  {
    test: /notif|reminder|alert|announcement|email.*digest/,
    answer:
      "See everything under **Notifications** (`/employee/notifications`), including Shift Updates, Leave Updates and Company Announcements.\n" +
      "Choose what you're told about under **My Settings → Notification Preferences** (`/employee/settings/notifications`).",
  },
  {
    test: /task|onboarding|checklist|to.?do|induction/,
    answer:
      "Your work queue is **My Tasks** (`/employee/tasks`) — open items first, overdue highlighted.\n" +
      "Onboarding-specific steps are under **Onboarding** (`/employee/onboarding`) with **Required Documents** (`/employee/onboarding/documents`) and **Checklist Status** (`/employee/onboarding/checklist`).",
  },
  {
    test: /roster|schedule|shift|when.*(work|shift)|my week/,
    answer:
      "Your schedule is under **My Roster → My Schedule** (`/employee/roster`) with a week-by-week view, and **Upcoming Shifts** (`/employee/roster/upcoming`).\n" +
      "Need a change? Request a swap from `/employee/roster/swaps` or set your availability from `/employee/availability`.",
  },
  {
    test: /who are you|what can you do|help|what do you know|kya kar|guide|portal/,
    answer:
      "I'm your employee assistant. I can answer questions about **your own** data — shifts, attendance, timesheets, leave, payslips, expenses, documents, tasks — and tell you where any portal feature lives.\n" +
      "Try:\n" +
      "• *When is my next shift?*\n" +
      "• *How much leave do I have left?*\n" +
      "• *Where do I upload a document?*\n" +
      "• *What's my latest payslip?*",
  },
];

// ─────────────────────────── intents ───────────────────────────

const INTENTS: Intent[] = [
  {
    intent: "portal_help",
    test: /\bhow (do|can|should|would) i\b|\bwhere (do|can|is|are|should)\b|\bhow to\b|what can you do|who are you|help me|which (page|section|screen)|navigate|\bkahan\b|\bkaise\b|\bkya kar/,
    run: async ({ question }) => {
      const topic = HELP_TOPICS.find((t) => t.test.test(question));
      if (topic) return { answer: topic.answer, table: null };

      return {
        answer:
          "Here's how your portal is organised:\n" +
          "• **My Profile** — your details and Update Profile\n" +
          "• **My Roster** — schedule, upcoming shifts, shift swaps, availability\n" +
          "• **Time & Attendance** — clock in/out, attendance history, timesheets\n" +
          "• **Leave Management** — apply for leave, requests, status, balance, history\n" +
          "• **My Payroll** — payslips, pay history, payment details\n" +
          "• **My Expenses** — submit claims and track them\n" +
          "• **My Documents** — your files, policies and acknowledgements\n" +
          "• **Onboarding / My Tasks** — your checklists and to-dos\n" +
          "• **Notifications** — shift, leave and company updates\n" +
          "• **My Settings** — account, password, notification preferences\n\n" +
          "Ask me e.g. *\"Where do I apply for leave?\"* or *\"How do I clock in?\"*",
        table: null,
      };
    },
  },
  {
    intent: "my_shifts",
    test: /shift|roster|schedule|when do i work|next.*work|working (today|tomorrow|this week)|duty|my week/,
    run: async ({ employeeId }) => {
      const today = dayStart(new Date());
      const weekEnd = daysAhead(7);
      const [upcoming, weekAgg] = await Promise.all([
        prisma.shift.findMany({
          where: { employeeId, date: { gte: today }, status: { not: "CANCELLED" } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 8,
          include: { location: { select: { name: true } } },
        }),
        prisma.shift.aggregate({
          where: { employeeId, date: { gte: today, lte: weekEnd }, status: { not: "CANCELLED" } },
          _count: true,
          _sum: { hours: true },
        }),
      ]);

      const next = upcoming[0];
      const nextLine = next
        ? `Your next shift is **${formatDate(next.date)}, ${next.startTime}–${next.endTime}**${next.location ? ` at ${next.location.name}` : ""}.`
        : "You have no upcoming shifts scheduled.";
      const weekLine = weekAgg._count
        ? ` This week ahead: ${weekAgg._count} shift(s), ${num(weekAgg._sum.hours).toFixed(1)} hours.`
        : "";

      return {
        answer: `${nextLine}${weekLine} Full detail under My Roster (/employee/roster).`,
        table: upcoming.length
          ? {
              headers: ["Date", "Time", "Location", "Status"],
              rows: upcoming.slice(0, 6).map((s) => [
                formatDate(s.date),
                `${s.startTime}–${s.endTime}`,
                s.location?.name ?? "—",
                s.status.replace(/_/g, " ").toLowerCase(),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_attendance",
    test: /attendance|clock|clocked|punch|my hours|hours worked|present|am i (in|working)/,
    run: async ({ employeeId }) => {
      const today = dayStart(new Date());
      const since = daysAhead(-13);
      const [todayRecord, recent] = await Promise.all([
        prisma.attendanceRecord.findFirst({ where: { employeeId, date: today } }),
        prisma.attendanceRecord.findMany({
          where: { employeeId, date: { gte: since } },
          orderBy: { date: "asc" },
          select: { date: true, workedMinutes: true, status: true, clockIn: true, clockOut: true },
        }),
      ]);

      const hours14 = recent.reduce((a, r) => a + r.workedMinutes, 0) / 60;
      const daysPresent = recent.filter((r) => r.workedMinutes > 0).length;

      const todayLine = !todayRecord
        ? "You haven't clocked in today — head to Time & Attendance (/employee/attendance)."
        : todayRecord.clockOut
        ? `Today you're done: clocked in ${todayRecord.clockIn ? new Date(todayRecord.clockIn).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "—"} and out ${(todayRecord.clockOut as Date).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })} (${(todayRecord.workedMinutes / 60).toFixed(1)}h).`
        : `You're on the clock — clocked in at ${todayRecord.clockIn ? new Date(todayRecord.clockIn).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "—"}. Remember to clock out!`;

      return {
        answer: `${todayLine} Over the last 14 days: ${daysPresent} day(s) worked, ${hours14.toFixed(1)} hours total.`,
        table: recent.length
          ? {
              headers: ["Date", "Status", "Hours"],
              rows: recent
                .slice(-7)
                .reverse()
                .map((r) => [
                  formatDate(r.date),
                  r.status,
                  (r.workedMinutes / 60).toFixed(1),
                ]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_timesheets",
    test: /timesheet|time ?sheet|my.*hours.*submit|hours.*logged/,
    run: async ({ employeeId }) => {
      const [byStatus, recent] = await Promise.all([
        prisma.timesheet.groupBy({ by: ["status"], where: { employeeId }, _count: true }),
        prisma.timesheet.findMany({
          where: { employeeId },
          orderBy: { periodStart: "desc" },
          take: 6,
          select: { periodStart: true, periodEnd: true, totalHours: true, status: true },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const drafts = countOf("DRAFT");

      return {
        answer:
          `${countOf("SUBMITTED")} submitted, ${countOf("APPROVED")} approved, ${countOf("REJECTED")} rejected, ${drafts} draft. ` +
          (drafts > 0
            ? `You have ${drafts} draft timesheet(s) waiting — submit them from My Timesheets (/employee/timesheets).`
            : "Submit a new week from /employee/timesheets/new."),
        table: recent.length
          ? {
              headers: ["Week", "Hours", "Status"],
              rows: recent.map((t) => [
                `${formatDate(t.periodStart)} → ${formatDate(t.periodEnd)}`,
                num(t.totalHours).toFixed(1),
                t.status,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_leave_balance",
    test: /leave balance|how much leave|leave left|leave remaining|entitlement|annual leave|sick leave|chhutti.*kitni|kitni.*chhutti/,
    run: async ({ employeeId }) => {
      const year = new Date().getFullYear();
      const balances = await prisma.leaveBalance.findMany({
        where: { employeeId, year },
        include: { leaveType: { select: { name: true, colour: true } } },
      });

      if (balances.length === 0) {
        return {
          answer: `No leave balances recorded for ${year} yet — they appear once HR sets up your entitlements.`,
          table: null,
        };
      }

      const totalRemaining = balances.reduce(
        (a, b) => a + Math.max(0, num(b.entitlement) + num(b.carriedOver) - num(b.taken) - num(b.pending)),
        0
      );

      return {
        answer: `You have about ${totalRemaining.toFixed(1)} days of leave remaining across ${balances.length} type(s) for ${year}. Apply from /employee/leave/new.`,
        table: {
          headers: ["Leave type", "Taken", "Pending", "Remaining"],
          rows: balances.map((b) => {
            const entitled = num(b.entitlement) + num(b.carriedOver);
            return [
              b.leaveType.name,
              num(b.taken).toFixed(1),
              num(b.pending).toFixed(1),
              Math.max(0, entitled - num(b.taken) - num(b.pending)).toFixed(1),
            ];
          }),
        },
      };
    },
  },
  {
    intent: "my_leave_requests",
    test: /my leave|leave request|applied leave|leave status|leave pending|leave approved|leave rejected/,
    run: async ({ employeeId }) => {
      const [byStatus, recent] = await Promise.all([
        prisma.leaveRequest.groupBy({ by: ["status"], where: { employeeId }, _count: true }),
        prisma.leaveRequest.findMany({
          where: { employeeId },
          orderBy: { appliedAt: "desc" },
          take: 6,
          include: { leaveType: { select: { name: true } } },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

      return {
        answer: `${countOf("PENDING")} pending, ${countOf("APPROVED")} approved, ${countOf("REJECTED")} rejected, ${countOf("CANCELLED")} cancelled. Track everything under My Leave Requests (/employee/leave).`,
        table: recent.length
          ? {
              headers: ["Type", "Dates", "Days", "Status"],
              rows: recent.map((l) => [
                l.leaveType.name,
                `${formatDate(l.startDate)} → ${formatDate(l.endDate)}`,
                num(l.days).toFixed(1),
                l.status,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_payslips",
    test: /payslip|pay slip|salary|net pay|pay history|my pay|wage|how much.*(paid|earn)/,
    run: async ({ employeeId }) => {
      const year = new Date().getFullYear();
      const [latest, ytd] = await Promise.all([
        prisma.payslip.findFirst({
          where: { employeeId },
          orderBy: { periodEnd: "desc" },
          include: { payRun: { select: { label: true, payDate: true } } },
        }),
        prisma.payslip.aggregate({
          where: { employeeId, periodEnd: { gte: new Date(`${year}-01-01`) } },
          _sum: { grossPay: true, netPay: true, taxAmount: true, superAmount: true },
          _count: true,
        }),
      ]);

      if (!latest) {
        return { answer: "No payslips have been issued to you yet — they'll appear under My Payroll (/employee/payslips).", table: null };
      }

      return {
        answer:
          `Your latest payslip (${latest.payRun.label}) paid ${formatMoney(num(latest.netPay))} net for ${formatDate(latest.periodStart)} – ${formatDate(latest.periodEnd)}. ` +
          `Year to date: ${ytd._count} payslip(s), ${formatMoney(num(ytd._sum.grossPay))} gross, ${formatMoney(num(ytd._sum.netPay))} net.`,
        table: {
          headers: ["Latest payslip", "Value"],
          rows: [
            ["Pay run", latest.payRun.label],
            ["Period", `${formatDate(latest.periodStart)} → ${formatDate(latest.periodEnd)}`],
            ["Gross", formatMoney(num(latest.grossPay))],
            ["Tax", formatMoney(num(latest.taxAmount))],
            ["Super", formatMoney(num(latest.superAmount))],
            ["Net pay", formatMoney(num(latest.netPay))],
          ],
        },
      };
    },
  },
  {
    intent: "my_expenses",
    test: /expense|claim|reimburse/,
    run: async ({ employeeId }) => {
      const [byStatus, recent] = await Promise.all([
        prisma.expense.groupBy({ by: ["status"], where: { employeeId }, _count: true }),
        prisma.expense.findMany({
          where: { employeeId },
          orderBy: { expenseDate: "desc" },
          take: 6,
          select: { category: true, description: true, amount: true, status: true, expenseDate: true },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

      return {
        answer: `${countOf("PENDING")} pending, ${countOf("APPROVED")} approved, ${countOf("REIMBURSED")} reimbursed. Submit a new one from /employee/expenses/new.`,
        table: recent.length
          ? {
              headers: ["Date", "Category", "Amount", "Status"],
              rows: recent.map((e) => [
                formatDate(e.expenseDate),
                e.category,
                formatMoney(num(e.amount)),
                e.status,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_documents",
    test: /my document|document|file|paperwork/,
    run: async ({ employeeId }) => {
      const horizon = daysAhead(60);
      const [total, byCategory, expiring] = await Promise.all([
        prisma.employeeDocument.count({ where: { employeeId } }),
        prisma.employeeDocument.groupBy({ by: ["category"], where: { employeeId }, _count: true }),
        prisma.employeeDocument.findMany({
          where: { employeeId, expiryDate: { not: null, lte: horizon } },
          orderBy: { expiryDate: "asc" },
          take: 5,
          select: { title: true, expiryDate: true },
        }),
      ]);

      return {
        answer: total === 0
          ? "You have no documents on file yet — upload them from /employee/documents/upload."
          : `${total} document(s) on file.${expiring.length ? ` ${expiring.length} expire within 60 days.` : ""} See them under My Documents (/employee/documents).`,
        table: expiring.length
          ? {
              headers: ["Document", "Expires"],
              rows: expiring.map((d) => [d.title, d.expiryDate ? formatDate(d.expiryDate) : "—"]),
            }
          : byCategory.length
          ? {
              headers: ["Category", "Count"],
              rows: byCategory.map((c) => [c.category, String(c._count)]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_policies",
    test: /polic|acknowledg|handbook/,
    run: async ({ employeeId }) => {
      const [byStatus, rows] = await Promise.all([
        prisma.policyAcknowledgement.groupBy({ by: ["status"], where: { employeeId }, _count: true }),
        prisma.policyAcknowledgement.findMany({
          where: { employeeId, status: { in: ["PENDING", "OVERDUE"] } },
          take: 6,
          include: { policy: { select: { title: true } } },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const total = byStatus.reduce((a, b) => a + b._count, 0);

      return {
        answer: total === 0
          ? "No policy acknowledgements have been assigned to you yet."
          : `${countOf("ACKNOWLEDGED")} of ${total} acknowledged. ${countOf("OVERDUE")} overdue — sign them at /employee/policies/acknowledgements.`,
        table: rows.length
          ? {
              headers: ["Policy", "Status"],
              rows: rows.map((r) => [r.policy.title, r.status]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_tasks",
    test: /my task|pending task|to.?do|onboarding|checklist|overdue task|task.*due/,
    run: async ({ employeeId }) => {
      const [byStatus, dueSoon] = await Promise.all([
        prisma.onboardingTask.groupBy({
          by: ["status"],
          where: { employeeId, stage: "ONBOARDING" },
          _count: true,
        }),
        prisma.onboardingTask.findMany({
          where: { employeeId, status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] } },
          orderBy: [{ dueDate: "asc" }],
          take: 6,
          select: { title: true, dueDate: true, status: true },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const open = countOf("NOT_STARTED") + countOf("IN_PROGRESS") + countOf("BLOCKED");
      const completed = countOf("COMPLETED");

      return {
        answer:
          open === 0
            ? `🎉 All caught up — ${completed} task(s) completed. See them under My Tasks (/employee/tasks/completed).`
            : `${open} open task(s), ${completed} completed. Find them under My Tasks (/employee/tasks).`,
        table: dueSoon.length
          ? {
              headers: ["Task", "Due", "Status"],
              rows: dueSoon.map((t) => [
                t.title,
                t.dueDate ? formatDate(t.dueDate) : "—",
                t.status.replace(/_/g, " ").toLowerCase(),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_notifications",
    test: /notif|unread|reminder|alert|announcement/,
    run: async ({ userId, organisationId }) => {
      const [unread, recent] = await Promise.all([
        prisma.orgNotification.count({
          where: { organisationId, isRead: false, OR: [{ userId }, { userId: null }] },
        }),
        prisma.orgNotification.findMany({
          where: { organisationId, OR: [{ userId }, { userId: null }] },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { title: true, isRead: true, createdAt: true },
        }),
      ]);

      return {
        answer: unread === 0
          ? "You have no unread notifications."
          : `${unread} unread notification(s). Open them under Notifications (/employee/notifications).`,
        table: recent.length
          ? {
              headers: ["Notification", "Read", "When"],
              rows: recent.map((n) => [n.title, n.isRead ? "Yes" : "No", formatDate(n.createdAt)]),
            }
          : null,
      };
    },
  },
  {
    intent: "my_profile",
    test: /my profile|my details|personal detail|my info|emergency contact|who am i|my (manager|position|role|department|team)/,
    run: async ({ employeeId }) => {
      const emp = await prisma.employee.findFirst({
        where: { id: employeeId },
        select: {
          firstName: true,
          lastName: true,
          employeeNumber: true,
          employmentStatus: true,
          employmentType: true,
          hireDate: true,
          position: { select: { title: true } },
          department: { select: { name: true } },
          team: { select: { name: true } },
          location: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true } },
        },
      });
      if (!emp) return { answer: "I couldn't load your profile — please try again.", table: null };

      return {
        answer: `You're ${emp.firstName} ${emp.lastName} (${emp.employeeNumber}) — ${emp.position?.title ?? "no position set"} in ${emp.department?.name ?? "no department"}. Your manager is ${emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : "not assigned"}. Full record at /employee/profile.`,
        table: {
          headers: ["Field", "Value"],
          rows: [
            ["Employee number", emp.employeeNumber],
            ["Position", emp.position?.title ?? "—"],
            ["Department", emp.department?.name ?? "—"],
            ["Team", emp.team?.name ?? "—"],
            ["Location", emp.location?.name ?? "—"],
            ["Employment", emp.employmentType.replace(/_/g, " ")],
            ["Status", emp.employmentStatus],
            ["Started", formatDate(emp.hireDate)],
          ],
        },
      };
    },
  },
];

export function describeCapabilities(): string {
  return CAPABILITIES.map((c) => `• ${c}`).join("\n");
}

/** Answer a natural-language question using only this employee's own data. */
export async function answerQuestion(
  ctx: { employeeId: string; userId: string; organisationId: string; firstName: string },
  question: string
): Promise<AssistantReply> {
  const q = question.toLowerCase().trim();

  // Score every intent by how many of its patterns hit — the best match wins,
  // so mixed questions ("leave balance and next shift") route sensibly.
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
        "I can't answer that one yet — I only see **your own** HR data and can explain where portal features live.\n" +
        `Here's what I can help with:\n${describeCapabilities()}`,
      table: null,
    };
  }

  try {
    const reply = await match.run({ ...ctx, question: q });
    return { intent: match.intent, answer: reply.answer, table: reply.table ?? null };
  } catch (err) {
    console.error("[employee-assistant] intent failed", match.intent, err);
    return {
      intent: match.intent,
      answer: "I hit a problem while pulling that data — please try again in a moment.",
      table: null,
    };
  }
}
