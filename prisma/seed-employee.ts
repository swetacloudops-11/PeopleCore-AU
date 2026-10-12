/**
 * Employee self-service portal seed.
 *
 * Creates employee@jabitsoft.com (EMPLOYEE role) and links it to a real,
 * data-rich employee record in the target organisation so every self-service
 * page has content: roster shifts, timesheets, payslips, leave, expenses,
 * documents, onboarding tasks and policy acknowledgements.
 *
 * Idempotent — safe to run repeatedly.
 *
 * Run:  npm run db:seed-employee
 */
import { PrismaClient, LeaveStatus, AcknowledgementStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();

const ORG_SLUG = "coral-coast-tourism";
const EMAIL = "employee@jabitsoft.com";
const PASSWORD = "Admin@1234";

/** The employee record the portal account is attached to (chosen for data richness). */
const TARGET_EMPLOYEE_NUMBER = "EMP-6069"; // Arjun White

const day = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};

async function main() {
  console.log("Seeding Employee self-service portal …");

  const org = await p.organisation.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Organisation ${ORG_SLUG} not found — run db:seed-org first.`);

  const employee = await p.employee.findFirst({
    where: { organisationId: org.id, employeeNumber: TARGET_EMPLOYEE_NUMBER },
  });
  if (!employee) throw new Error(`Employee ${TARGET_EMPLOYEE_NUMBER} not found.`);

  // ── 1. portal account ──────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = await p.user.upsert({
    where: { email: EMAIL },
    update: { organisationId: org.id, status: "ACTIVE", name: `${employee.firstName} ${employee.lastName}` },
    create: {
      email: EMAIL,
      passwordHash: hash,
      name: `${employee.firstName} ${employee.lastName}`,
      status: "ACTIVE",
      organisationId: org.id,
      lastLoginAt: new Date(Date.now() - 1000 * 60 * 30),
    },
  });

  const employeeRole = await p.role.findFirst({
    where: { key: "EMPLOYEE", organisationId: org.id },
    select: { id: true },
  });
  if (!employeeRole) throw new Error("EMPLOYEE role not found — run db:seed-org first.");

  await p.roleAssignment.deleteMany({ where: { userId: user.id } });
  await p.roleAssignment.create({ data: { userId: user.id, roleId: employeeRole.id } });

  // ── 2. link the account to the employee record ─────────────────
  await p.employee.update({
    where: { id: employee.id },
    data: { userId: user.id },
  });
  console.log(`  Account: ${EMAIL} → ${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`);

  // ── 3. top up leave requests so statuses are visible ───────────
  const leaveCount = await p.leaveRequest.count({ where: { employeeId: employee.id } });
  if (leaveCount < 3) {
    const types = await p.leaveType.findMany({
      where: { organisationId: org.id },
      select: { id: true, code: true },
    });
    const annual = types.find((t) => t.code === "ANNUAL") ?? types[0];
    const personal = types.find((t) => t.code === "PERSONAL") ?? types[1] ?? types[0];

    await p.leaveRequest.createMany({
      data: [
        {
          organisationId: org.id,
          employeeId: employee.id,
          leaveTypeId: annual.id,
          startDate: day(21),
          endDate: day(25),
          days: 5,
          hours: 38,
          reason: "Family holiday — pre-booked",
          status: LeaveStatus.PENDING,
        },
        {
          organisationId: org.id,
          employeeId: employee.id,
          leaveTypeId: personal.id,
          startDate: day(-14),
          endDate: day(-14),
          days: 1,
          hours: 7.6,
          reason: "Medical appointment",
          status: LeaveStatus.APPROVED,
          reviewedAt: day(-15),
        },
      ],
    });
    console.log("  Leave requests topped up (+2)");
  }

  // ── 4. availability for the week (empty by default) ────────────
  const availCount = await p.availability.count({ where: { employeeId: employee.id } });
  if (availCount === 0) {
    await p.availability.createMany({
      data: [1, 2, 3, 4, 5].map((dow) => ({
        organisationId: org.id,
        employeeId: employee.id,
        dayOfWeek: dow,
        startTime: "09:00",
        endTime: "17:00",
        isAvailable: true,
        note: null,
      })),
    });
    console.log("  Availability created (Mon–Fri 9–5)");
  }

  // ── 5. policy acknowledgements for this employee ───────────────
  const policies = await p.policy.findMany({
    where: { organisationId: org.id },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const existingAcks = await p.policyAcknowledgement.findMany({
    where: { employeeId: employee.id },
    select: { policyId: true, status: true },
  });
  const ackByPolicy = new Map(existingAcks.map((a) => [a.policyId, a.status]));

  let ackAdded = 0;
  for (let i = 0; i < policies.length; i++) {
    const policy = policies[i];
    if (ackByPolicy.has(policy.id)) continue;

    // Deterministic mix: earlier policies acknowledged, later ones pending/overdue.
    const status: AcknowledgementStatus =
      i < policies.length - 2 ? "ACKNOWLEDGED" : i === policies.length - 2 ? "OVERDUE" : "PENDING";

    await p.policyAcknowledgement.upsert({
      where: { policyId_employeeId: { policyId: policy.id, employeeId: employee.id } },
      update: {},
      create: {
        organisationId: org.id,
        policyId: policy.id,
        employeeId: employee.id,
        status,
        acknowledgedAt: status === "ACKNOWLEDGED" ? day(-30 + i) : null,
        dueDate: status === "ACKNOWLEDGED" ? null : day(status === "OVERDUE" ? -7 : 10),
      },
    });
    ackAdded++;
  }
  if (ackAdded > 0) console.log(`  Policy acknowledgements added: ${ackAdded}`);

  // ── 6. notifications for the employee + org-wide announcements ─
  const [ownNotifs, broadcasts] = await Promise.all([
    p.orgNotification.count({ where: { userId: user.id } }),
    p.orgNotification.count({ where: { organisationId: org.id, userId: null } }),
  ]);

  if (ownNotifs === 0) {
    const d = (n: number) => new Date(Date.now() - n * 3_600_000);
    await p.orgNotification.createMany({
      data: [
        {
          organisationId: org.id,
          userId: user.id,
          event: "SHIFT_UPDATE",
          title: "Roster updated for next week",
          body: `Hi ${employee.firstName}, your shifts for next week have been updated. Check My Roster for the latest times.`,
          channel: "IN_APP",
          linkUrl: "/employee/roster",
          createdAt: d(2),
        },
        {
          organisationId: org.id,
          userId: user.id,
          event: "LEAVE_UPDATE",
          title: "Leave request received",
          body: "Your leave request has been submitted and is awaiting manager approval.",
          channel: "IN_APP",
          linkUrl: "/employee/leave",
          createdAt: d(20),
        },
        {
          organisationId: org.id,
          userId: user.id,
          event: "PAYSLIP_READY",
          title: "Your payslip is ready",
          body: "Your latest payslip is now available in My Payroll.",
          channel: "IN_APP",
          linkUrl: "/employee/payslips",
          createdAt: d(50),
        },
        {
          organisationId: org.id,
          userId: user.id,
          event: "TASK_REMINDER",
          title: "Onboarding tasks due",
          body: "You have onboarding tasks due this week. Open My Tasks to keep on track.",
          channel: "IN_APP",
          linkUrl: "/employee/tasks",
          createdAt: d(70),
        },
      ],
    });
    console.log(`  Employee notifications created: 4`);
  }

  if (broadcasts === 0) {
    const d = (n: number) => new Date(Date.now() - n * 3_600_000);
    await p.orgNotification.createMany({
      data: [
        {
          organisationId: org.id,
          event: "ANNOUNCEMENT",
          title: "Welcome to the PeopleCore employee portal",
          body: "You can now view your roster, apply for leave, submit timesheets and download payslips — all in one place.",
          channel: "IN_APP",
          linkUrl: "/employee/announcements",
          createdAt: d(24 * 14),
        },
        {
          organisationId: org.id,
          event: "ANNOUNCEMENT",
          title: "Office closed on Monday — public holiday",
          body: "All sites will be closed for the public holiday. Casual shift timings will be confirmed by your team leader.",
          channel: "IN_APP",
          createdAt: d(24 * 5),
        },
        {
          organisationId: org.id,
          event: "ANNOUNCEMENT",
          title: "New expense policy now in effect",
          body: "Expense claims must be submitted within 30 days of purchase. See Company Policies for details.",
          channel: "IN_APP",
          linkUrl: "/employee/policies",
          createdAt: d(30),
        },
      ],
    });
    console.log("  Company announcements created: 3");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
