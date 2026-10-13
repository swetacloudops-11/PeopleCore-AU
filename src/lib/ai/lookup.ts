import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Named, per-record lookups shared by the console assistants.
 *
 * These let a user ask about one specific person ("did Samuel Hassan come in
 * today?", "what is Alice Rossi's leave balance?") instead of only aggregates.
 * Everything is additive: when no name is found the caller falls back to its
 * existing aggregate intents, so nothing that already worked changes.
 */

export type AnswerTable = { headers: string[]; rows: string[][] };
export type NamedAnswer = { intent: string; answer: string; table?: AnswerTable | null };

export type EmployeeRef = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
};

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
const time = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "—";
const title = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const leaveLabel = (name: string) => (/leave/i.test(name) ? name : `${name} leave`);
const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

/** Which employee (if any) is named in the text. Full names win over partial. */
export async function findEmployeeInText(
  organisationId: string,
  text: string
): Promise<EmployeeRef | null> {
  const employees = await prisma.employee.findMany({
    where: { organisationId },
    select: { id: true, firstName: true, lastName: true, preferredName: true, employeeNumber: true },
  });
  if (employees.length === 0) return null;

  const hay = ` ${normalise(text)} `;

  const firstCounts = new Map<string, number>();
  const lastCounts = new Map<string, number>();
  for (const e of employees) {
    const f = normalise(e.firstName);
    const l = normalise(e.lastName);
    firstCounts.set(f, (firstCounts.get(f) ?? 0) + 1);
    lastCounts.set(l, (lastCounts.get(l) ?? 0) + 1);
  }

  let best: EmployeeRef | null = null;
  let bestScore = 0;
  const consider = (e: EmployeeRef, score: number) => {
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  };

  for (const e of employees) {
    const f = normalise(e.firstName);
    const l = normalise(e.lastName);
    const pref = e.preferredName ? normalise(e.preferredName) : "";
    const no = normalise(e.employeeNumber);

    if (no && hay.includes(` ${no} `)) consider(e, 400);
    if (hay.includes(` ${f} ${l} `)) consider(e, 300 + f.length + l.length);
    if (pref && hay.includes(` ${pref} ${l} `)) consider(e, 300 + pref.length + l.length);
    if (firstCounts.get(f) === 1 && hay.includes(` ${f} `)) consider(e, 100 + f.length);
    if (lastCounts.get(l) === 1 && hay.includes(` ${l} `)) consider(e, 90 + l.length);
  }

  return best;
}

/** Which organisation (if any) is named in the text. */
export async function findOrganisationInText(
  text: string
): Promise<{ id: string; name: string; slug: string } | null> {
  const organisations = await prisma.organisation.findMany({
    select: { id: true, name: true, slug: true },
  });
  const hay = ` ${normalise(text)} `;

  let best: { id: string; name: string; slug: string } | null = null;
  let bestLen = 0;
  for (const o of organisations) {
    const n = normalise(o.name);
    if (n.length >= 3 && hay.includes(` ${n} `) && n.length > bestLen) {
      best = o;
      bestLen = n.length;
    }
  }
  return best;
}

const ATTENDANCE_RE =
  /attend|aaya|aayi|aaye|aay[ae]|came|come in|clock|check.?in|check.?out|present|late|at work|in the office|on the floor|working|office|shift|duty|roster|aaj|today|kaha|kahan/;
const LEAVE_RE = /leave|chhutti|chutti|holiday|away|\boff\b|absent|break/;
const SHIFT_RE = /shift|roster|duty|schedule|working/;
const CERT_RE = /certificat|\bcert\b|licen[cs]e|credential|ticket/;
const DOC_RE = /document|\bdoc\b|paperwork|papers|file/;
const PAY_RE = /\bpay\b|paid|salary|wage|payslip|payroll|super|superannuation|payg|withhold|tax|bank|remuneration|earning|hourly|annual/;
const PROFILE_RE = /profile|details|about|kya|who is|tell me|summary|information|\binfo\b|contact|phone|email|manager|department|position|role|joined|hired|status/;

export type EmployeeScope = "hr" | "payroll";

/**
 * Answer a question about a specific named employee. Returns null when the
 * question doesn't name anyone, so the caller can use its normal intents.
 */
export async function answerNamedEmployee(
  organisationId: string,
  question: string,
  scope: EmployeeScope
): Promise<NamedAnswer | null> {
  const q = question.toLowerCase();
  const ref = await findEmployeeInText(organisationId, q);
  if (!ref) return null;

  const name = `${ref.firstName} ${ref.lastName}`;
  const wantsPay = PAY_RE.test(q);
  const wantsLeave = LEAVE_RE.test(q);
  const wantsCert = CERT_RE.test(q);
  const wantsDoc = DOC_RE.test(q);

  if (wantsPay) return payAnswer(ref, name);
  if (wantsCert) return certificationAnswer(ref.id, name);
  if (wantsDoc) return documentAnswer(ref.id, name);
  if (wantsLeave) return leaveAnswer(ref.id, name);
  if (ATTENDANCE_RE.test(q) || SHIFT_RE.test(q)) return attendanceAnswer(ref.id, name);
  if (PROFILE_RE.test(q)) return profileAnswer(ref.id, name);
  return scope === "payroll" ? payAnswer(ref, name) : profileAnswer(ref.id, name);
}

async function attendanceAnswer(employeeId: string, name: string): Promise<NamedAnswer> {
  const today = dayStart(new Date());
  const [record, shifts, onLeave, recent] = await Promise.all([
    prisma.attendanceRecord.findFirst({ where: { employeeId, date: today } }),
    prisma.shift.findMany({
      where: { employeeId, date: today, status: { not: "CANCELLED" } },
      orderBy: { startTime: "asc" },
      select: { startTime: true, endTime: true, status: true, roleLabel: true },
    }),
    prisma.leaveRequest.findFirst({
      where: { employeeId, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      include: { leaveType: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: daysAhead(-13) } },
      orderBy: { date: "asc" },
      select: { date: true, status: true, workedMinutes: true },
    }),
  ]);

  const shiftLine = shifts.length
    ? ` Scheduled shift today: ${shifts.map((s) => `${s.startTime}–${s.endTime}`).join(", ")}.`
    : "";

  let todayLine: string;
  if (onLeave) {
    todayLine = `${name} is on approved ${leaveLabel(onLeave.leaveType.name)} today.`;
  } else if (!record) {
    todayLine = `${name} has no attendance recorded today (${formatDate(today)}).`;
  } else if (record.status === "ABSENT") {
    todayLine = `${name} is marked absent today.`;
  } else if (record.clockOut) {
    todayLine = `${name} was in today — clocked in ${time(record.clockIn)}, out ${time(record.clockOut)} (${(record.workedMinutes / 60).toFixed(1)}h, ${title(record.status)}).`;
  } else {
    todayLine = `${name} is on the clock — clocked in ${time(record.clockIn)} (${title(record.status)}).`;
  }

  const daysPresent = recent.filter((r) => r.workedMinutes > 0).length;
  const summary = recent.length
    ? ` Over the last 14 days: ${daysPresent} day(s) with hours, ${(recent.reduce((a, r) => a + r.workedMinutes, 0) / 60).toFixed(1)}h worked.`
    : "";

  return {
    intent: "employee_attendance",
    answer: `${todayLine}${shiftLine}${summary}`,
    table: recent.length
      ? {
          headers: ["Date", "Status", "Hours"],
          rows: recent
            .slice(-7)
            .reverse()
            .map((r) => [formatDate(r.date), title(r.status), (r.workedMinutes / 60).toFixed(1)]),
        }
      : null,
  };
}

async function leaveAnswer(employeeId: string, name: string): Promise<NamedAnswer> {
  const today = dayStart(new Date());
  const year = new Date().getFullYear();
  const [current, pending, upcoming, balances] = await Promise.all([
    prisma.leaveRequest.findFirst({
      where: { employeeId, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      include: { leaveType: { select: { name: true } } },
    }),
    prisma.leaveRequest.count({ where: { employeeId, status: "PENDING" } }),
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", startDate: { gt: today, lte: daysAhead(60) } },
      orderBy: { startDate: "asc" },
      take: 5,
      include: { leaveType: { select: { name: true } } },
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: { select: { name: true } } },
    }),
  ]);

  const statusLine = current
    ? `${name} is on approved ${leaveLabel(current.leaveType.name)} right now (until ${formatDate(current.endDate)}).`
    : `${name} is not on leave today.`;

  return {
    intent: "employee_leave",
    answer:
      `${statusLine} ${pending} pending request(s); ${upcoming.length} approved request(s) in the next 60 days.` +
      (balances.length ? " Leave balances for this year are below." : ""),
    table: balances.length
      ? {
          headers: ["Leave type", "Entitlement", "Taken", "Remaining"],
          rows: balances.map((b) => [
            b.leaveType.name,
            num(b.entitlement).toFixed(1),
            num(b.taken).toFixed(1),
            Math.max(0, num(b.entitlement) + num(b.carriedOver) - num(b.taken) - num(b.pending)).toFixed(1),
          ]),
        }
      : upcoming.length
      ? {
          headers: ["Upcoming", "Type", "Dates"],
          rows: upcoming.map((l) => [
            formatDate(l.startDate),
            l.leaveType.name,
            `${formatDate(l.startDate)} → ${formatDate(l.endDate)}`,
          ]),
        }
      : null,
  };
}

async function profileAnswer(employeeId: string, name: string): Promise<NamedAnswer> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: { select: { name: true } },
      team: { select: { name: true } },
      location: { select: { name: true, city: true } },
      position: { select: { title: true } },
      manager: { select: { firstName: true, lastName: true } },
    },
  });
  if (!e) return { intent: "employee_profile", answer: `I couldn't load ${name}'s record.`, table: null };

  const where = e.location ? `${e.location.name}${e.location.city ? ` (${e.location.city})` : ""}` : "—";
  return {
    intent: "employee_profile",
    answer:
      `${name} (#${e.employeeNumber}) is a ${e.position?.title ?? "team member"} in ` +
      `${e.department?.name ?? "no department"}${e.team ? ` / ${e.team.name}` : ""}, based at ${where}. ` +
      `Status: ${title(e.employmentStatus)}, type: ${title(e.employmentType)}, joined ${formatDate(e.hireDate)}` +
      (e.manager ? `, reports to ${e.manager.firstName} ${e.manager.lastName}` : "") + ".",
    table: {
      headers: ["Field", "Value"],
      rows: [
        ["Employee number", e.employeeNumber],
        ["Employment status", title(e.employmentStatus)],
        ["Employment type", title(e.employmentType)],
        ["Position", e.position?.title ?? "—"],
        ["Department", e.department?.name ?? "—"],
        ["Team", e.team?.name ?? "—"],
        ["Location", where],
        ["Manager", e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—"],
        ["Work email", e.workEmail ?? "—"],
        ["Phone", e.phone ?? "—"],
        ["Hire date", formatDate(e.hireDate)],
      ],
    },
  };
}

async function certificationAnswer(employeeId: string, name: string): Promise<NamedAnswer> {
  const certs = await prisma.employeeCertification.findMany({
    where: { employeeId },
    orderBy: { expiryDate: "asc" },
    include: { certification: { select: { name: true, isMandatory: true } } },
  });
  const soon = certs.filter((c) => c.status === "EXPIRING" || c.status === "EXPIRED");
  return {
    intent: "employee_certifications",
    answer:
      certs.length === 0
        ? `${name} has no certifications on record.`
        : `${name} holds ${certs.length} certification(s); ${soon.length} are expiring or expired.`,
    table: certs.length
      ? {
          headers: ["Certification", "Status", "Expires", "Mandatory"],
          rows: certs.map((c) => [
            c.certification.name,
            title(c.status),
            c.expiryDate ? formatDate(c.expiryDate) : "—",
            c.certification.isMandatory ? "Yes" : "No",
          ]),
        }
      : null,
  };
}

async function documentAnswer(employeeId: string, name: string): Promise<NamedAnswer> {
  const docs = await prisma.employeeDocument.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
    select: { title: true, category: true, expiryDate: true, createdAt: true },
  });
  const expiring = docs.filter((d) => d.expiryDate && d.expiryDate.getTime() <= daysAhead(60).getTime());
  return {
    intent: "employee_documents",
    answer:
      docs.length === 0
        ? `${name} has no documents on file.`
        : `${name} has ${docs.length} document(s); ${expiring.length} expire within 60 days.`,
    table: docs.length
      ? {
          headers: ["Document", "Category", "Expires", "Added"],
          rows: docs.slice(0, 8).map((d) => [
            d.title,
            d.category,
            d.expiryDate ? formatDate(d.expiryDate) : "—",
            formatDate(d.createdAt),
          ]),
        }
      : null,
  };
}

async function payAnswer(ref: EmployeeRef, name: string): Promise<NamedAnswer> {
  const [employee, latestPayslip, superAgg, paygAgg, payslipCount] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: ref.id },
      select: {
        employeeNumber: true,
        employmentStatus: true,
        employmentType: true,
        salaryType: true,
        baseSalary: true,
        hourlyRate: true,
        standardHoursPerWeek: true,
        superFundName: true,
      },
    }),
    prisma.payslip.findFirst({
      where: { employeeId: ref.id },
      orderBy: { createdAt: "desc" },
      select: { grossPay: true, netPay: true, taxAmount: true, superAmount: true, periodStart: true, periodEnd: true, status: true },
    }),
    prisma.superannuationRecord.aggregate({ where: { employeeId: ref.id }, _sum: { superAmount: true }, _count: true }),
    prisma.paygRecord.aggregate({ where: { employeeId: ref.id }, _sum: { grossPay: true }, _count: true }),
    prisma.payslip.count({ where: { employeeId: ref.id } }),
  ]);

  const rate =
    employee?.salaryType === "HOURLY"
      ? `${formatMoney(num(employee.hourlyRate))}/hour`
      : `${formatMoney(num(employee?.baseSalary))}/year`;

  const payslipLine = latestPayslip
    ? `Latest payslip (${formatDate(latestPayslip.periodStart)} → ${formatDate(latestPayslip.periodEnd)}): ` +
      `${formatMoney(num(latestPayslip.grossPay))} gross, ${formatMoney(num(latestPayslip.taxAmount))} PAYG, ` +
      `${formatMoney(num(latestPayslip.superAmount))} super, ${formatMoney(num(latestPayslip.netPay))} net (${title(latestPayslip.status)}).`
    : `No payslips have been issued to ${name} yet.`;

  return {
    intent: "employee_pay",
    answer: `${name} (#${ref.employeeNumber}) is on ${rate}. ${payslipLine}`,
    table: {
      headers: ["Item", "Value"],
      rows: [
        ["Pay basis", rate],
        ["Standard hours / week", num(employee?.standardHoursPerWeek).toFixed(1)],
        ["Employment status", title(employee?.employmentStatus ?? "—")],
        ["Employment type", title(employee?.employmentType ?? "—")],
        ["Payslips issued", String(payslipCount)],
        ["Super accrued", `${formatMoney(num(superAgg._sum.superAmount))} (${superAgg._count} records)`],
        ["PAYG records", `${paygAgg._count} (${formatMoney(num(paygAgg._sum.grossPay))} gross)`],
        ["Super fund", employee?.superFundName ?? "—"],
      ],
    },
  };
}

/** Platform assistant: answer about one named organisation. */
export async function answerNamedOrganisation(question: string): Promise<NamedAnswer | null> {
  const org = await findOrganisationInText(question);
  if (!org) return null;

  const [subscription, employeeCount, integrations, syncs, errors] = await Promise.all([
    prisma.organisationSubscription.findFirst({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      select: { status: true, cycle: true, seats: true, amount: true, plan: { select: { name: true } }, trialEndsAt: true },
    }),
    prisma.employee.count({ where: { organisationId: org.id } }),
    prisma.organisationIntegration.count({ where: { organisationId: org.id } }),
    prisma.syncLog.count({ where: { organisationId: org.id } }),
    prisma.auditLog.count({ where: { organisationId: org.id } }),
  ]);

  const record = await prisma.organisation.findUnique({
    where: { id: org.id },
    select: { name: true, status: true, city: true, state: true, industry: true, createdAt: true, employeeCount: true },
  });
  if (!record) return null;

  return {
    intent: "organisation_detail",
    answer:
      `${record.name} is ${title(record.status)}${record.city ? `, based in ${record.city}${record.state ? `, ${record.state}` : ""}` : ""}. ` +
      `${employeeCount} employee record(s); ${integrations} integration connection(s) and ${syncs} sync run(s).` +
      (subscription ? ` Plan: ${subscription.plan.name} (${title(subscription.status)}, ${title(subscription.cycle)}).` : " No subscription on record."),
    table: {
      headers: ["Field", "Value"],
      rows: [
        ["Status", title(record.status)],
        ["Industry", record.industry ?? "—"],
        ["Employees", String(employeeCount)],
        ["Plan", subscription ? subscription.plan.name : "—"],
        ["Subscription", subscription ? `${title(subscription.status)} · ${title(subscription.cycle)}` : "—"],
        ["Seats", subscription ? String(subscription.seats) : "—"],
        ["Billing amount", subscription ? formatMoney(num(subscription.amount)) : "—"],
        ["Integrations", String(integrations)],
        ["Sync runs", String(syncs)],
        ["Audit events", String(errors)],
        ["Created", formatDate(record.createdAt)],
      ],
    },
  };
}
