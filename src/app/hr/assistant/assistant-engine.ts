import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { answerNamedEmployee } from "@/lib/ai/lookup";

/**
 * Deterministic HR assistant.
 *
 * No external AI API: each question is matched to an intent and answered with
 * real aggregates scoped to this tenant. It also answers "how do I … / where
 * do I …" questions about the HR console itself, so HR staff can learn the
 * portal from it. Server-only — never import from a client component.
 */

export type AssistantTable = { headers: string[]; rows: string[][] };

export type AssistantReply = {
  intent: string;
  answer: string;
  table?: AssistantTable | null;
};

export const SUGGESTIONS = [
  "How many employees do we have?",
  "Where do I approve leave?",
  "Who is on leave today?",
  "Is Samuel Hassan in today?",
  "How do I add a new employee?",
  "What onboarding tasks are pending?",
  "Which certifications are expiring?",
  "Who are our new starters?",
  "What policies still need acknowledging?",
  "How do I upload a document?",
  "How much leave liability do we carry?",
];

export const CAPABILITIES = [
  "headcount and employment status",
  "who is on leave right now",
  "pending leave approvals",
  "leave liability and balances",
  "pending and overdue onboarding tasks",
  "new starters and offboarding",
  "certifications expiring or expired",
  "documents nearing expiry",
  "policy acknowledgement progress",
  "headcount by department",
  "unread HR notifications",
  "attendance, leave and details for a named employee",
  "where any HR feature lives in the portal",
];

type Ctx = { organisationId: string; question: string };
type Result = Omit<AssistantReply, "intent">;
type Intent = { intent: string; test: RegExp; run: (ctx: Ctx) => Promise<Result> };

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

// ─────────────────────────── portal help ───────────────────────────
// "how do I … / where do I …" questions are answered with the exact screen.

const HELP_TOPICS: Array<{ test: RegExp; answer: string }> = [
  {
    test: /add (an? )?(new )?employee|create (an? )?employee|new hire|onboard (a )?(new )?(person|staff|employee)|add (a )?staff/,
    answer:
      "Add a new employee from **Employee Management → Add Employee** (`/hr/employees/new`).\n" +
      "Fill in the personal, employment and pay details, then save. The employee appears immediately under **All Employees** (`/hr/employees`) and can be picked up by Onboarding.",
  },
  {
    test: /approve.*leave|leave.*approv|reject.*leave|leave.*reject|accept.*leave|decline.*leave/,
    answer:
      "Approve or reject leave from **Leave Management → Approve / Reject Leave** (`/hr/leave/approvals`).\n" +
      "Pending requests are listed there — approve or reject each one, and the decision is recorded with your name and the review note. All requests live under **Leave Requests** (`/hr/leave/requests`).",
  },
  {
    test: /leave balance|entitlement|leave type|accrual|how much leave/,
    answer:
      "Leave configuration and balances are under **Leave Management**:\n" +
      "• **Leave Balances** (`/hr/leave/balances`) — entitlement, taken, pending and available per employee.\n" +
      "• **Leave Types** (`/hr/leave/types`) — create or edit annual, personal, parental, LSL and unpaid types.\n" +
      "• **Leave Rules** (`/hr/settings/leave-rules`) — accrual and carry-over rules.",
  },
  {
    test: /upload.*(document|doc|file)|add.*document|attach.*(document|file)|upload.*cert|documents? upload/,
    answer:
      "Upload documents from **Documents → Upload Documents** (`/hr/documents/upload`).\n" +
      "Choose the employee, a title, category and optional expiry date. Everything you add is listed under **All Documents** (`/hr/documents`), grouped under **Employee Documents** (`/hr/documents/employees`), and expiry is tracked on **Document Expiry Tracking** (`/hr/documents/expiry`).",
  },
  {
    test: /certif|licence|license|compliance|expir/,
    answer:
      "Certifications live under **Certifications**:\n" +
      "• **All Certifications** (`/hr/certifications`) — the catalogue and how many people hold each.\n" +
      "• **Expiring Certifications** (`/hr/certifications/expiring`) — anything expiring or already expired.\n" +
      "• **Certification Records** (`/hr/certifications/records`) — assign, update or remove a person's certification.",
  },
  {
    test: /(create|add|new|update|edit).*(policy|policies)|policy.*(create|add|new|update)/,
    answer:
      "Manage policies under **Policies**:\n" +
      "• **Company Policies** (`/hr/policies`) — all policies with acknowledgement progress.\n" +
      "• **Create / Update Policies** (`/hr/policies/new`) — publish a new policy or edit an existing one.\n" +
      "• **Policy Acknowledgements** (`/hr/policies/acknowledgements`) — see who has acknowledged and send reminders.",
  },
  {
    test: /acknowledg|who.*signed|policy.*status|signed.*policy/,
    answer:
      "Check policy sign-offs on **Policies → Policy Acknowledgements** (`/hr/policies/acknowledgements`).\n" +
      "It shows every employee × policy with Pending / Acknowledged / Overdue status, and lets you send a reminder. Overdue acknowledgements also surface on **Notifications → Policy Reminders** (`/hr/notifications/policy-reminders`).",
  },
  {
    test: /onboard|new starter|checklist|required document/,
    answer:
      "Onboarding is under **Onboarding**:\n" +
      "• **New Starters** (`/hr/onboarding/new-starters`) — recent hires.\n" +
      "• **Onboarding Checklists** (`/hr/onboarding/checklists`) — the templates and their completion.\n" +
      "• **Onboarding Tasks** (`/hr/onboarding/tasks`) — every task, with status controls.\n" +
      "• **Required Documents** (`/hr/onboarding/documents`) — what new starters still owe.",
  },
  {
    test: /offboard|leav(er|ing)|resign|exit|terminat|hand over|handover/,
    answer:
      "Offboarding is under **Offboarding**:\n" +
      "• **Employees Leaving** (`/hr/offboarding/leaving`) — upcoming and recent exits.\n" +
      "• **Exit Checklist** (`/hr/offboarding/checklist`) — the exit tasks to complete.\n" +
      "• **Exit Documents** (`/hr/offboarding/documents`) — documents to collect on exit.",
  },
  {
    test: /report|headcount report|analytics|export|statistic/,
    answer:
      "HR Reports are under **HR Reports**: Employee (`/hr/reports/employees`), Headcount (`/hr/reports/headcount`), Leave (`/hr/reports/leave`), Onboarding (`/hr/reports/onboarding`) and Offboarding (`/hr/reports/offboarding`).",
  },
  {
    test: /pending task|hr task|to.?do|my task|outstanding task|overdue task/,
    answer:
      "Your work queue is **Tasks & Approvals**:\n" +
      "• **Pending HR Tasks** (`/hr/tasks`) — every open task, overdue first.\n" +
      "• **Employee Requests** (`/hr/tasks/requests`) — pending leave and timesheets.\n" +
      "• **Document Approvals** (`/hr/tasks/document-approvals`) — documents awaiting review.",
  },
  {
    test: /setting|preference|configure|config|notification setting|hr preference/,
    answer:
      "HR Settings are under **HR Settings**: Preferences (`/hr/settings`), Leave Rules (`/hr/settings/leave-rules`), Onboarding (`/hr/settings/onboarding`), Documents (`/hr/settings/documents`) and Notifications (`/hr/settings/notifications`).",
  },
  {
    test: /notification|reminder|alert/,
    answer:
      "Notifications are under **Notifications**: Employee Notifications (`/hr/notifications`), Policy Reminders (`/hr/notifications/policy-reminders`) and Expiry Reminders (`/hr/notifications/expiry-reminders`).",
  },
  {
    test: /employee (detail|profile|record|history)|view (an? )?employee|staff profile/,
    answer:
      "Open a person's full record from **Employee Management → All Employees** (`/hr/employees`) and click their name, or use **Employee Details** (`/hr/employees/details`) to search and view inline. Employment history is on **Employee History** (`/hr/employees/history`).",
  },
  {
    test: /dashboard|home|overview|summary/,
    answer:
      "**Dashboard** (`/hr/dashboard`) is your home page — headcount, new starters, upcoming exits, pending leave, expiring certifications and pending HR tasks, with charts and a work queue.",
  },
  {
    test: /who are you|what can you do|help|what do you know|kya kar|guide|portal/,
    answer:
      "I'm the HR assistant. I can pull live figures from this organisation (headcount, leave, onboarding, certifications, documents, policies) **and** tell you where any HR feature lives in the portal.\n" +
      "Try asking something like:\n" +
      "• *Where do I approve leave?*\n" +
      "• *Who is on leave today?*\n" +
      "• *Which certifications are expiring?*\n" +
      "• *What onboarding tasks are pending?*",
  },
];

// ─────────────────────────── intents ───────────────────────────

const INTENTS: Intent[] = [
  // Portal navigation first — so "how do I approve leave" never falls into a
  // data intent just because it contains the word "leave".
  {
    intent: "portal_help",
    test: /\bhow (do|can|should|would) i\b|\bwhere (do|can|is|are|should)\b|\bhow to\b|what can you do|who are you|help me|which (page|section|screen)|navigate|\bkahan\b|\bkaise\b|\bkya kar/,
    run: async ({ question }) => {
      const topic = HELP_TOPICS.find((t) => t.test.test(question));
      if (topic) return { answer: topic.answer, table: null };

      return {
        answer:
          "Here's how the HR console is organised:\n" +
          "• **Employee Management** — all employees, add employee, details, documents, certifications, history\n" +
          "• **Onboarding** — new starters, checklists, tasks, required documents\n" +
          "• **Offboarding** — employees leaving, exit checklist, exit documents\n" +
          "• **Leave Management** — requests, approvals, balances, types, history\n" +
          "• **Documents** — all documents, upload, employee documents, expiry tracking\n" +
          "• **Policies** — company policies, create/update, acknowledgements\n" +
          "• **Certifications** — all, expiring, records\n" +
          "• **HR Reports** — employees, headcount, leave, onboarding, offboarding\n" +
          "• **Tasks & Approvals** — pending tasks, employee requests, document approvals\n" +
          "• **Notifications** — employee, policy reminders, expiry reminders\n" +
          "• **HR Settings** — preferences, leave rules, onboarding, documents, notifications\n\n" +
          "Ask me e.g. *\"Where do I upload a document?\"* or *\"How do I approve leave?\"*",
        table: null,
      };
    },
  },
  {
    intent: "headcount",
    test: /headcount|how many (employees|staff|people)|number of (employees|staff)|employee (count|numbers)|total (employees|staff)|kitne (log|employee)/,
    run: async ({ organisationId }) => {
      const [total, groups] = await Promise.all([
        prisma.employee.count({ where: { organisationId } }),
        prisma.employee.groupBy({
          by: ["employmentStatus"],
          where: { organisationId },
          _count: true,
        }),
      ]);
      const countOf = (s: string) =>
        groups.find((g) => g.employmentStatus === s)?._count ?? 0;
      const active =
        countOf("ACTIVE") + countOf("PROBATION") + countOf("CASUAL") +
        countOf("CONTRACT") + countOf("LEAVE");

      return {
        answer:
          total === 0
            ? "There are no employee records for this organisation yet."
            : `${total} employee(s) on record — ${active} active (${pct(active, total)}%), ${countOf(
                "TERMINATED"
              )} terminated.`,
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
  {
    intent: "on_leave",
    test: /on leave|who('?s)? (off|away)|away (today|this week)|leave (today|now|this week)|currently (on )?leave|who is (off|away)|chutti/,
    run: async ({ organisationId }) => {
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
    test: /pending|awaiting|approvals?|to review|needs? (my )?(action|review)|queue|waiting on/,
    run: async ({ organisationId }) => {
      const [leave, tasks, timesheets, policyAcks] = await Promise.all([
        prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
        prisma.onboardingTask.count({
          where: {
            organisationId,
            status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
          },
        }),
        prisma.timesheet.count({ where: { organisationId, status: "SUBMITTED" } }),
        prisma.policyAcknowledgement.count({
          where: { organisationId, status: { in: ["PENDING", "OVERDUE"] } },
        }),
      ]);
      const total = leave + tasks + timesheets;

      return {
        answer:
          total === 0
            ? "Nothing is waiting on you — no pending approvals right now."
            : `${total} item(s) need attention: ${leave} leave request(s), ${tasks} onboarding/offboarding task(s) and ${timesheets} timesheet(s). ` +
              `Plus ${policyAcks} outstanding policy acknowledgement(s). Approve leave from /hr/leave/approvals and see all tasks at /hr/tasks.`,
        table: {
          headers: ["Area", "Waiting"],
          rows: [
            ["Leave requests", String(leave)],
            ["Onboarding / offboarding tasks", String(tasks)],
            ["Timesheets", String(timesheets)],
            ["Policy acknowledgements outstanding", String(policyAcks)],
          ],
        },
      };
    },
  },
  {
    intent: "pending_leave",
    test: /pending leave|leave request|leave approval|approve leave|waiting.*leave|leave.*waiting/,
    run: async ({ organisationId }) => {
      const [total, byType, oldest] = await Promise.all([
        prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
        prisma.leaveRequest.groupBy({
          by: ["leaveTypeId"],
          where: { organisationId, status: "PENDING" },
          _count: true,
        }),
        prisma.leaveRequest.findMany({
          where: { organisationId, status: "PENDING" },
          orderBy: { appliedAt: "asc" },
          take: 8,
          include: {
            employee: { select: { firstName: true, lastName: true } },
            leaveType: { select: { name: true } },
          },
        }),
      ]);

      const types = await prisma.leaveType.findMany({
        where: { organisationId },
        select: { id: true, name: true },
      });
      const nameOf = (id: string) => types.find((t) => t.id === id)?.name ?? "Unknown";

      return {
        answer:
          total === 0
            ? "No leave requests are pending approval right now."
            : `${total} leave request(s) are awaiting approval. Approve them from Leave Management → Approve / Reject Leave (/hr/leave/approvals).`,
        table: oldest.length
          ? {
              headers: ["Employee", "Type", "From", "Days", "Applied"],
              rows: oldest.map((l) => [
                `${l.employee.firstName} ${l.employee.lastName}`,
                l.leaveType.name,
                formatDate(l.startDate),
                num(l.days).toFixed(1),
                formatDate(l.appliedAt),
              ]),
            }
          : byType.length
          ? {
              headers: ["Leave type", "Pending"],
              rows: byType.map((b) => [nameOf(b.leaveTypeId), String(b._count)]),
            }
          : null,
      };
    },
  },
  {
    intent: "leave_liability",
    test: /leave liability|accrued leave|leave balance|entitlement|unused leave|liability/,
    run: async ({ organisationId }) => {
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

      return {
        answer:
          agg._count === 0
            ? "No leave balances have been recorded for this leave year yet."
            : `For ${year}, ${entitled.toFixed(1)} days accrued across ${agg._count} balance record(s). ` +
              `${taken.toFixed(1)} days taken, ${pending.toFixed(1)} pending — about ${remaining.toFixed(
                1
              )} days of liability outstanding.`,
        table: agg._count === 0
          ? null
          : {
              headers: ["Leave type", "Entitled", "Taken", "Pending", "Remaining"],
              rows: balances.slice(0, 8).map((b) => [
                nameOf(b.leaveTypeId),
                num(b._sum.entitlement).toFixed(1),
                num(b._sum.taken).toFixed(1),
                num(b._sum.pending).toFixed(1),
                Math.max(
                  0,
                  num(b._sum.entitlement) - num(b._sum.taken) - num(b._sum.pending)
                ).toFixed(1),
              ]),
            },
      };
    },
  },
  {
    intent: "pending_tasks",
    test: /pending task|hr task|open task|outstanding task|overdue task|to.?do|onboarding task|task.*pending|blocked/,
    run: async ({ organisationId }) => {
      const today = dayStart(new Date());
      const [byStatus, overdue, dueSoon] = await Promise.all([
        prisma.onboardingTask.groupBy({
          by: ["status"],
          where: { organisationId, stage: "ONBOARDING" },
          _count: true,
        }),
        prisma.onboardingTask.count({
          where: {
            organisationId,
            status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
            dueDate: { lt: today },
          },
        }),
        prisma.onboardingTask.findMany({
          where: {
            organisationId,
            status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
            dueDate: { lte: daysAhead(14) },
          },
          orderBy: { dueDate: "asc" },
          take: 8,
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);

      const open =
        (byStatus.find((s) => s.status === "NOT_STARTED")?._count ?? 0) +
        (byStatus.find((s) => s.status === "IN_PROGRESS")?._count ?? 0) +
        (byStatus.find((s) => s.status === "BLOCKED")?._count ?? 0);
      const completed = byStatus.find((s) => s.status === "COMPLETED")?._count ?? 0;
      const totalTasks = byStatus.reduce((a, s) => a + s._count, 0);

      return {
        answer:
          totalTasks === 0
            ? "No onboarding tasks have been created yet."
            : `${open} onboarding task(s) are open, ${overdue} are overdue, ${completed} of ${totalTasks} complete (${pct(
                completed,
                totalTasks
              )}%). See them all on Tasks & Approvals → Pending HR Tasks (/hr/tasks).`,
        table: dueSoon.length
          ? {
              headers: ["Task", "Employee", "Due", "Status"],
              rows: dueSoon.map((t) => [
                t.title,
                t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : "Unassigned",
                t.dueDate ? formatDate(t.dueDate) : "—",
                t.status.replace(/_/g, " ").toLowerCase(),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "new_starters",
    test: /new starter|who started|recently joined|joined (us|the)|new hire|naye|recent hire/,
    run: async ({ organisationId }) => {
      const since = daysAgo(45);
      const [count, starters] = await Promise.all([
        prisma.employee.count({ where: { organisationId, hireDate: { gte: since } } }),
        prisma.employee.findMany({
          where: { organisationId, hireDate: { gte: since } },
          orderBy: { hireDate: "desc" },
          take: 8,
          select: {
            firstName: true,
            lastName: true,
            hireDate: true,
            employmentStatus: true,
            position: { select: { title: true } },
          },
        }),
      ]);

      return {
        answer:
          count === 0
            ? "No new starters in the last 45 days."
            : `${count} new starter(s) in the last 45 days. Find them on Onboarding → New Starters (/hr/onboarding/new-starters).`,
        table: starters.length
          ? {
              headers: ["New starter", "Role", "Started", "Status"],
              rows: starters.map((e) => [
                `${e.firstName} ${e.lastName}`,
                e.position?.title ?? "—",
                formatDate(e.hireDate),
                e.employmentStatus,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "offboarding",
    test: /offboard|leav(er|ing)|resign|exit|terminat|attrition|turnover|who left|staff leaving/,
    run: async ({ organisationId }) => {
      const today = dayStart(new Date());
      const [upcoming, exited, exitOpen] = await Promise.all([
        prisma.employee.findMany({
          where: { organisationId, terminationDate: { gte: today } },
          orderBy: { terminationDate: "asc" },
          take: 8,
          select: {
            firstName: true,
            lastName: true,
            terminationDate: true,
            terminationReason: true,
          },
        }),
        prisma.employee.count({
          where: { organisationId, terminationDate: { gte: daysAgo(90) } },
        }),
        prisma.onboardingTask.count({
          where: {
            organisationId,
            stage: "OFFBOARDING",
            status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
          },
        }),
      ]);

      return {
        answer:
          `${upcoming.length} employee(s) have a future exit date and ${exited} left in the last 90 days. ` +
          `${exitOpen} exit task(s) are still open. See Offboarding → Employees Leaving (/hr/offboarding/leaving).`,
        table: upcoming.length
          ? {
              headers: ["Employee", "Last day", "Reason"],
              rows: upcoming.map((e) => [
                `${e.firstName} ${e.lastName}`,
                e.terminationDate ? formatDate(e.terminationDate) : "—",
                e.terminationReason ?? "—",
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "certifications",
    test: /certif|licence|license|compliance|ticket.*expir|expir.*cert/,
    run: async ({ organisationId }) => {
      const [byStatus, expiring] = await Promise.all([
        prisma.employeeCertification.groupBy({
          by: ["status"],
          where: { employee: { organisationId } },
          _count: true,
        }),
        prisma.employeeCertification.findMany({
          where: {
            employee: { organisationId },
            status: { in: ["EXPIRING", "EXPIRED"] },
          },
          orderBy: { expiryDate: "asc" },
          take: 8,
          include: {
            employee: { select: { firstName: true, lastName: true } },
            certification: { select: { name: true, issuingBody: true } },
          },
        }),
      ]);

      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const total = byStatus.reduce((a, b) => a + b._count, 0);

      return {
        answer:
          total === 0
            ? "No certification records have been created yet."
            : `${total} certification record(s) on file — ${countOf("CURRENT")} current, ${countOf(
                "EXPIRING"
              )} expiring, ${countOf("EXPIRED")} expired, ${countOf("PENDING")} pending. Review them on Certifications → Expiring Certifications (/hr/certifications/expiring).`,
        table: expiring.length
          ? {
              headers: ["Employee", "Certification", "Expires", "Status"],
              rows: expiring.map((c) => [
                `${c.employee.firstName} ${c.employee.lastName}`,
                c.certification.name,
                c.expiryDate ? formatDate(c.expiryDate) : "—",
                c.status,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "documents",
    test: /document|file|paperwork|expiry tracking|doc.*expir/,
    run: async ({ organisationId }) => {
      const horizon = daysAhead(60);
      const [total, confidential, expiring, byCategory] = await Promise.all([
        prisma.employeeDocument.count({ where: { organisationId } }),
        prisma.employeeDocument.count({ where: { organisationId, isConfidential: true } }),
        prisma.employeeDocument.findMany({
          where: { organisationId, expiryDate: { not: null, lte: horizon } },
          orderBy: { expiryDate: "asc" },
          take: 8,
          include: { employee: { select: { firstName: true, lastName: true } } },
        }),
        prisma.employeeDocument.groupBy({
          by: ["category"],
          where: { organisationId },
          _count: true,
        }),
      ]);

      return {
        answer:
          total === 0
            ? "No employee documents have been uploaded yet. Add them from Documents → Upload Documents (/hr/documents/upload)."
            : `${total} document(s) on file, ${confidential} marked confidential. ${expiring.length} expire within 60 days — see Documents → Document Expiry Tracking (/hr/documents/expiry).`,
        table: expiring.length
          ? {
              headers: ["Employee", "Document", "Expires"],
              rows: expiring.map((d) => [
                `${d.employee.firstName} ${d.employee.lastName}`,
                d.title,
                d.expiryDate ? formatDate(d.expiryDate) : "—",
              ]),
            }
          : byCategory.length
          ? {
              headers: ["Category", "Documents"],
              rows: byCategory
                .map((c) => [c.category, String(c._count)])
                .sort((a, b) => Number(b[1]) - Number(a[1])),
            }
          : null,
      };
    },
  },
  {
    intent: "policies",
    test: /polic|acknowledg|handbook|code of conduct/,
    run: async ({ organisationId }) => {
      const [total, mandatory, byStatus, outstanding] = await Promise.all([
        prisma.policy.count({ where: { organisationId } }),
        prisma.policy.count({ where: { organisationId, isMandatory: true } }),
        prisma.policyAcknowledgement.groupBy({
          by: ["status"],
          where: { organisationId },
          _count: true,
        }),
        prisma.policyAcknowledgement.findMany({
          where: { organisationId, status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { dueDate: "asc" },
          take: 6,
          include: {
            employee: { select: { firstName: true, lastName: true } },
            policy: { select: { title: true } },
          },
        }),
      ]);

      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const ackTotal = byStatus.reduce((a, b) => a + b._count, 0);
      const acknowledged = countOf("ACKNOWLEDGED");

      return {
        answer:
          total === 0
            ? "No company policies have been published yet."
            : `${total} policy(ies) published (${mandatory} mandatory). ${acknowledged} of ${ackTotal} acknowledgement(s) complete (${pct(
                acknowledged,
                ackTotal
              )}%), ${countOf("OVERDUE")} overdue. Manage them on Policies → Policy Acknowledgements (/hr/policies/acknowledgements).`,
        table: outstanding.length
          ? {
              headers: ["Employee", "Policy", "Due", "Status"],
              rows: outstanding.map((a) => [
                `${a.employee.firstName} ${a.employee.lastName}`,
                a.policy.title,
                a.dueDate ? formatDate(a.dueDate) : "—",
                a.status,
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "department_breakdown",
    test: /department|by team|which team|team breakdown|by location|org(ani)?sation chart/,
    run: async ({ organisationId }) => {
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
        prisma.employee.count({
          where: { organisationId, employmentStatus: { not: "TERMINATED" } },
        }),
      ]);

      const nameOf = (id: string | null) =>
        id === null ? "Unassigned" : departments.find((d) => d.id === id)?.name ?? "Unassigned";

      const rows = groups
        .map((g) => [nameOf(g.departmentId), String(g._count), `${pct(g._count, total)}%`])
        .sort((a, b) => Number(b[1]) - Number(a[1]));

      return {
        answer: `${total} active employee(s) across ${rows.length} department group(s). Full detail on HR Reports → Headcount Reports (/hr/reports/headcount).`,
        table: rows.length ? { headers: ["Department", "Headcount", "Share"], rows } : null,
      };
    },
  },
  {
    intent: "notifications",
    test: /notif|unread|reminder|alert/,
    run: async ({ organisationId }) => {
      const [unread, recent] = await Promise.all([
        prisma.orgNotification.count({ where: { organisationId, isRead: false } }),
        prisma.orgNotification.findMany({
          where: { organisationId },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { title: true, body: true, isRead: true, createdAt: true },
        }),
      ]);

      return {
        answer:
          unread === 0
            ? "You have no unread HR notifications."
            : `${unread} unread notification(s). See Notifications (/hr/notifications).`,
        table: recent.length
          ? {
              headers: ["Notification", "Read", "When"],
              rows: recent.map((n) => [
                n.title,
                n.isRead ? "Yes" : "No",
                formatDate(n.createdAt),
              ]),
            }
          : null,
      };
    },
  },
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

  // A named employee ("is Samuel Hassan in today?") is answered directly,
  // before the aggregate intents, so existing behaviour is untouched.
  const named = await answerNamedEmployee(organisationId, question, "hr");
  if (named) return { intent: named.intent, answer: named.answer, table: named.table ?? null };

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
        "I can't answer that one yet — I answer from this organisation's own HR data and explain where portal features live.\n" +
        `Here's what I can help with:\n${describeCapabilities()}`,
      table: null,
    };
  }

  try {
    const reply = await match.run({ organisationId, question: q });
    return { intent: match.intent, answer: reply.answer, table: reply.table ?? null };
  } catch (err) {
    console.error("[hr-assistant] intent failed", match.intent, err);
    return {
      intent: match.intent,
      answer: "I hit a problem while pulling that data — please try again in a moment.",
      table: null,
    };
  }
}
