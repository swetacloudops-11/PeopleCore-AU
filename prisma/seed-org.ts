/**
 * Organisation Admin (HR) seed.
 * Creates organ@jabit.com, attaches it to a target organisation, then fills
 * that organisation with realistic HR data so every module page has content.
 *
 * Run:  npm run db:seed-org
 */
import { PrismaClient, Prisma, EmploymentStatus, EmploymentType, SalaryType, AttendanceStatus, TimesheetStatus, LeaveStatus, PayRunStatus, ShiftStatus, SwapStatus, PayCategoryType, ExpenseStatus, TaskStage, TaskStatus, ReviewType, ReviewStatus, GoalStatus, FeedbackType, AcknowledgementStatus, RosterStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

/** Counts rows for the org without reaching for an untyped client index. */
const MODEL_COUNT: Record<string, (p: PrismaClient, orgId: string) => Promise<number>> = {
  employee: (p, id) => p.employee.count({ where: { organisationId: id } }),
  department: (p, id) => p.department.count({ where: { organisationId: id } }),
  team: (p, id) => p.team.count({ where: { organisationId: id } }),
  location: (p, id) => p.location.count({ where: { organisationId: id } }),
  position: (p, id) => p.position.count({ where: { organisationId: id } }),
  employeeDocument: (p, id) => p.employeeDocument.count({ where: { organisationId: id } }),
  certification: (p, id) => p.certification.count({ where: { organisationId: id } }),
  attendanceRecord: (p, id) => p.attendanceRecord.count({ where: { organisationId: id } }),
  timesheet: (p, id) => p.timesheet.count({ where: { organisationId: id } }),
  leaveType: (p, id) => p.leaveType.count({ where: { organisationId: id } }),
  leaveRequest: (p, id) => p.leaveRequest.count({ where: { organisationId: id } }),
  leaveBalance: (p, id) => p.leaveBalance.count({ where: { organisationId: id } }),
  availability: (p, id) => p.availability.count({ where: { organisationId: id } }),
  roster: (p, id) => p.roster.count({ where: { organisationId: id } }),
  shift: (p, id) => p.shift.count({ where: { organisationId: id } }),
  shiftSwapRequest: (p, id) => p.shiftSwapRequest.count({ where: { organisationId: id } }),
  rosterConflict: (p, id) => p.rosterConflict.count({ where: { organisationId: id } }),
  paySchedule: (p, id) => p.paySchedule.count({ where: { organisationId: id } }),
  payCategory: (p, id) => p.payCategory.count({ where: { organisationId: id } }),
  payRun: (p, id) => p.payRun.count({ where: { organisationId: id } }),
  payslip: (p, id) => p.payslip.count({ where: { organisationId: id } }),
  superannuationRecord: (p, id) => p.superannuationRecord.count({ where: { organisationId: id } }),
  paygRecord: (p, id) => p.paygRecord.count({ where: { organisationId: id } }),
  expense: (p, id) => p.expense.count({ where: { organisationId: id } }),
  expenseReport: (p, id) => p.expenseReport.count({ where: { organisationId: id } }),
  onboardingChecklist: (p, id) => p.onboardingChecklist.count({ where: { organisationId: id } }),
  onboardingTask: (p, id) => p.onboardingTask.count({ where: { organisationId: id } }),
  review: (p, id) => p.review.count({ where: { organisationId: id } }),
  goal: (p, id) => p.goal.count({ where: { organisationId: id } }),
  feedback: (p, id) => p.feedback.count({ where: { organisationId: id } }),
  policy: (p, id) => p.policy.count({ where: { organisationId: id } }),
  policyAcknowledgement: (p, id) => p.policyAcknowledgement.count({ where: { organisationId: id } }),
  orgSetting: (p, id) => p.orgSetting.count({ where: { organisationId: id } }),
  leaveRule: (p, id) => p.leaveRule.count({ where: { organisationId: id } }),
  orgNotification: (p, id) => p.orgNotification.count({ where: { organisationId: id } }),
};


const p = new PrismaClient();

// ── tiny deterministic PRNG so re-runs produce stable-looking data ──
let _s = 20261009;
const rnd = () => {
  _s = (_s * 1664525 + 1013904223) % 4294967296;
  return _s / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

const D = (daysFromNow: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d;
};
const iso = (d: Date) => d.toISOString();

const dec = (n: number) => new Prisma.Decimal(n);

// ── reference data ──────────────────────────────────────────────────
const DEPARTMENTS = [
  ["Operations", "OPS", "Day-to-day service delivery"],
  ["People & Culture", "P&C", "HR, recruitment and employee experience"],
  ["Finance", "FIN", "Accounting, payroll and reporting"],
  ["Technology", "TECH", "Platform, infrastructure and support"],
  ["Sales", "SLS", "New business and account management"],
  ["Warehouse", "WHSE", "Fulfilment, dispatch and inventory"],
];

const LOCATIONS: Array<[string, string | null, string | null, string | null, boolean]> = [
  ["Sydney HQ", "10 Harbour Street", "Sydney", "NSW", false],
  ["Melbourne Depot", "44 King Street", "Melbourne", "VIC", false],
  ["Brisbane Warehouse", "88 Church Road", "Brisbane", "QLD", false],
  ["Perth Field Office", "21 Queen Street", "Perth", "WA", false],
  ["Remote", null, null, null, true],
];

const POSITIONS: Array<[string, string, number]> = [
  ["Operations Coordinator", "OPS-1", 2],
  ["Shift Supervisor", "SUP-1", 3],
  ["Warehouse Associate", "WH-1", 1],
  ["HR Advisor", "HR-1", 3],
  ["Payroll Officer", "PAY-1", 3],
  ["Software Engineer", "ENG-2", 3],
  ["Account Executive", "AE-1", 2],
  ["Finance Analyst", "FIN-2", 3],
  ["Forklift Driver", "FLT-1", 1],
  ["Team Leader", "TL-1", 4],
  ["Customer Support Rep", "CSR-1", 1],
  ["Operations Manager", "OM-1", 5],
];

const FIRST = [
  "Olivia","Jack","Amelia","Noah","Isla","Liam","Mia","Ethan","Charlotte","Lucas",
  "Harper","Mason","Grace","Leo","Zoe","Hugo","Ruby","Oscar","Lily","Henry",
  "Sophie","Arthur","Evie","Freddie","Chloe","Max","Willow","Cooper","Matilda","Finn",
  "Alice","George","Poppy","Thomas","Emily","Jacob","Hannah","Daniel","Sophia","Samuel",
  "Ella","Benjamin","Lucy","Alexander","Anna","William","Sarah","Joshua","Natalie","Ryan",
  "Priya","Rohan","Ananya","Arjun","Wei","Mei","Sofia","Diego","Fatima","Youssef",
];
const LAST = [
  "Smith","Jones","Williams","Brown","Wilson","Taylor","Johnson","White","Martin","Walker",
  "Thomas","Anderson","Nguyen","Davis","Lewis","Harris","Clark","Robinson","Young","Hall",
  "Walker","Wright","Scott","Green","Baker","Adams","Nelson","Carter","Mitchell","Perez",
  "Patel","Kumar","Singh","Chen","Wang","Li","Garcia","Martinez","Rossi","Kowalski",
  "O'Brien","MacDonald","Thompson","Campbell","Robertson","Fraser","McDonald","Kaur","Ali","Hassan",
];

const SUPER_FUNDS = ["AustralianSuper", "Hostplus", "Cbus", "Aware Super", "UniSuper", "REST"];

// ── helpers ─────────────────────────────────────────────────────────
function hoursBetween(start: string, end: string, breakMin: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm) - breakMin;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function main() {
  console.log("Seeding Organisation Admin (HR) data …");

  // ── target organisation ────────────────────────────────────────
  let org = await p.organisation.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!org) {
    org = await p.organisation.create({
      data: {
        name: "Harbour Logistics Pty Ltd",
        slug: "harbour-logistics",
        industry: "Logistics",
        city: "Sydney",
        state: "NSW",
        postcode: "2000",
        status: "ACTIVE",
        employeeCount: 60,
      },
    });
  }
  console.log(`  Target organisation: ${org.name} (${org.id})`);

  // ── org admin account ──────────────────────────────────────────
  const hash = await bcrypt.hash("Admin@1234", 10);
  const admin = await p.user.upsert({
    where: { email: "organ@jabit.com" },
    update: { organisationId: org.id, status: "ACTIVE", name: "Harbour Ops Admin" },
    create: {
      email: "organ@jabit.com",
      passwordHash: hash,
      name: "Harbour Ops Admin",
      status: "ACTIVE",
      organisationId: org.id,
      lastLoginAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  });
  console.log(`  Account: organ@jabit.com`);

  // ── org-scoped permissions catalogue additions ─────────────────
  const permDefs: Array<[string, string, string]> = [
    ["people.view", "People", "View employee records"],
    ["people.manage", "People", "Create and edit employees"],
    ["people.delete", "People", "Terminate or remove employees"],
    ["docs.manage", "People", "Upload and manage employee documents"],
    ["certs.manage", "People", "Manage certifications"],
    ["time.view", "Time & Attendance", "View attendance and timesheets"],
    ["time.manage", "Time & Attendance", "Edit attendance and timesheets"],
    ["leave.view", "Leave", "View leave requests and balances"],
    ["leave.approve", "Leave", "Approve or reject leave"],
    ["roster.view", "Rostering", "View rosters and shifts"],
    ["roster.manage", "Rostering", "Create and edit shifts"],
    ["roster.publish", "Rostering", "Publish rosters and resolve conflicts"],
    ["roster.approve", "Rostering", "Approve shift swaps"],
    ["payroll.view", "Payroll", "View pay runs and payslips"],
    ["payroll.manage", "Payroll", "Create pay runs and manage pay categories"],
    ["payroll.approve", "Payroll", "Approve and finalise pay runs"],
    ["expense.view", "Expenses", "View expenses"],
    ["expense.approve", "Expenses", "Approve or reject expenses"],
    ["onboarding.view", "Onboarding", "View onboarding and offboarding"],
    ["onboarding.manage", "Onboarding", "Manage checklists and tasks"],
    ["performance.view", "Performance", "View reviews, goals and feedback"],
    ["performance.manage", "Performance", "Manage reviews, goals and feedback"],
    ["policy.view", "Policies", "View company policies"],
    ["policy.manage", "Policies", "Create and publish policies"],
    ["reports.view", "Reports", "Run organisation reports"],
    ["orgusers.view", "User Management", "View organisation users"],
    ["orgusers.manage", "User Management", "Invite and manage organisation users"],
    ["orgint.view", "Integrations", "View connected integrations"],
    ["settings.manage", "Organisation Settings", "Manage organisation settings"],
  ];

  for (const [key, module, description] of permDefs) {
    await p.permission.upsert({
      where: { key },
      update: { module, action: key.split(".")[1], description },
      create: { key, module, action: key.split(".")[1], description },
    });
  }
  const allPerms = await p.permission.findMany({ select: { id: true, key: true } });

  // ── org-scoped roles ───────────────────────────────────────────
  const roleMatrix: Array<[string, string, string, string[]]> = [
    ["ORG_ADMIN", "Organisation Admin", "Full control over this organisation", ["*"]],
    ["HR_MANAGER", "HR Manager", "People, leave, onboarding and performance", [
      "people.view","people.manage","docs.manage","certs.manage","time.view","time.manage",
      "leave.view","leave.approve","onboarding.view","onboarding.manage",
      "performance.view","performance.manage","policy.view","policy.manage",
      "reports.view","orgusers.view","roster.view",
    ]],
    ["PAYROLL_MANAGER", "Payroll Manager", "Payroll, expenses and reporting", [
      "payroll.view","payroll.manage","payroll.approve","expense.view","expense.approve",
      "reports.view","people.view","time.view",
    ]],
    ["TEAM_LEADER", "Team Leader", "Rostering and team approvals", [
      "people.view","roster.view","roster.manage","roster.publish","roster.approve",
      "leave.view","leave.approve","time.view","reports.view",
    ]],
    ["EMPLOYEE", "Employee", "Self-service access only", [
      "policy.view","roster.view","leave.view",
    ]],
  ];

  const orgRoleIds: Record<string, string> = {};
  for (const [key, name, description, keys] of roleMatrix) {
    const role = await p.role.upsert({
      where: { key },
      update: { organisationId: org.id, name, description },
      create: {
        key, name, description, isSystem: key === "ORG_ADMIN",
        organisationId: org.id,
      },
    });
    orgRoleIds[key] = role.id;

    const selected = keys.includes("*")
      ? allPerms.filter((x) => !x.key.startsWith("org.")) // platform perms excluded
      : allPerms.filter((x) => keys.includes(x.key));

    await p.rolePermission.deleteMany({ where: { roleId: role.id } });
    await p.rolePermission.createMany({
      data: selected.map((x) => ({ roleId: role.id, permissionId: x.id, allowed: true })),
      skipDuplicates: true,
    });
  }

  await p.roleAssignment.deleteMany({ where: { userId: admin.id } });
  await p.roleAssignment.create({ data: { userId: admin.id, roleId: orgRoleIds.ORG_ADMIN } });

  // ── org units ──────────────────────────────────────────────────
  const deptIds: Record<string, string> = {};
  for (const [name, code, description] of DEPARTMENTS) {
    const d = await p.department.upsert({
      where: { organisationId_name: { organisationId: org.id, name } },
      update: {},
      create: { organisationId: org.id, name, code, description },
    });
    deptIds[name] = d.id;
  }

  const teamDefs: Array<[string, string, string]> = [
    ["Dispatch", "Operations", "Outbound dispatch crew"],
    ["Receiving", "Operations", "Inbound goods and checking"],
    ["Fleet", "Operations", "Drivers and vehicle maintenance"],
    ["Talent", "People & Culture", "Recruitment and onboarding"],
    ["Accounts Payable", "Finance", "Supplier payments"],
    ["Payroll", "Finance", "Pay cycles and super"],
    ["Platform", "Technology", "Core platform engineering"],
    ["Support", "Technology", "Tier 1 and 2 support"],
    ["Enterprise", "Sales", "Large account management"],
    ["SMB", "Sales", "SMB new business"],
    ["Picking", "Warehouse", "Pick and pack"],
    ["Dispatch Bay", "Warehouse", "Loading and freight"],
  ];
  const teamIds: Record<string, string> = {};
  for (const [name, dept, description] of teamDefs) {
    const t = await p.team.upsert({
      where: { organisationId_name: { organisationId: org.id, name } },
      update: {},
      create: {
        organisationId: org.id, name, description,
        departmentId: deptIds[dept],
        code: name.slice(0, 3).toUpperCase(),
      },
    });
    teamIds[name] = t.id;
  }

  const locIds: string[] = [];
  for (const [name, a1, city, state, remote] of LOCATIONS) {
    const l = await p.location.upsert({
      where: { organisationId_name: { organisationId: org.id, name } },
      update: {},
      create: {
        organisationId: org.id, name,
        addressLine1: remote ? null : a1,
        city: remote ? null : city,
        state: remote ? null : state,
        isRemote: remote,
        isDefault: name === "Sydney HQ",
      },
    });
    locIds.push(l.id);
  }

  const posIds: Record<string, string> = {};
  for (const [title, code, level] of POSITIONS) {
    const deptFor: Record<string, string> = {
      "Operations Coordinator": "Operations", "Shift Supervisor": "Operations",
      "Warehouse Associate": "Warehouse", "HR Advisor": "People & Culture",
      "Payroll Officer": "Finance", "Software Engineer": "Technology",
      "Account Executive": "Sales", "Finance Analyst": "Finance",
      "Forklift Driver": "Warehouse", "Team Leader": "Operations",
      "Customer Support Rep": "Technology", "Operations Manager": "Operations",
    };
    const pos = await p.position.upsert({
      where: { organisationId_title: { organisationId: org.id, title } },
      update: {},
      create: {
        organisationId: org.id, title, code, level,
        departmentId: deptIds[deptFor[title]],
        description: `${title} role within the organisation.`,
      },
    });
    posIds[title] = pos.id;
  }

  // ── employees ──────────────────────────────────────────────────
  const existingEmployees = await p.employee.count({ where: { organisationId: org.id } });
  const employees: Array<{ id: string; first: string; last: string; dept: string; pos: string }> = [];

  if (existingEmployees < 30) {
    console.log("  Creating 60 employees …");
    const usedNums = new Set<number>();
    const usedEmails = new Set<string>();

    for (let i = 0; i < 60; i++) {
      let num: number;
      do num = int(1001, 9999); while (usedNums.has(num));
      usedNums.add(num);

      const first = pick(FIRST);
      const last = pick(LAST);
      const posTitle = pick(POSITIONS.map((p) => p[0]));
      const deptTitle = pick(DEPARTMENTS.map((d) => d[0]));
      const teamName = pick(teamDefs.map((t) => t[0]));
      const empType = rnd() < 0.72 ? "FULL_TIME" : rnd() < 0.6 ? "PART_TIME" : "CASUAL";
      const salaryType = empType === "CASUAL" || rnd() < 0.25 ? "HOURLY" : "ANNUAL";

      const statusRoll = rnd();
      const employmentStatus =
        i < 4 ? "PROBATION" :
        statusRoll > 0.95 ? "LEAVE" :
        statusRoll > 0.93 ? "TERMINATED" : "ACTIVE";

      const hireOffset = -int(30, 2200);

      let email = `${first}.${last}${i}`.toLowerCase().replace(/[^a-z.]/g, "") + "@harbourlogistics.com.au";
      if (usedEmails.has(email)) email = `${first}${num}`.toLowerCase() + "@harbourlogistics.com.au";
      usedEmails.add(email);

      const base = salaryType === "ANNUAL" ? int(62000, 148000) : int(28, 62);
      const hourly = salaryType === "HOURLY" ? base : Math.round((base / 2080) * 100) / 100;

      employees.push({ id: "", first, last, dept: deptTitle, pos: posTitle });

      // managerId resolved in a second pass
      await p.employee.create({
        data: {
          organisationId: org.id,
          employeeNumber: `EMP-${num}`,
          firstName: first,
          lastName: last,
          preferredName: rnd() < 0.3 ? first.slice(0, 4) : null,
          workEmail: email,
          personalEmail: `${first}.${last}${num}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com",
          phone: `04${int(10, 99)} ${int(100, 999)} ${int(100, 999)}`,
          dateOfBirth: D(-int(22 * 365, 58 * 365)),
          gender: pick(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]),
          taxFileNumber: `${int(1, 9)}${int(100, 999)} ${int(100, 999)} ${int(10, 99)}`,
          employmentStatus: employmentStatus as EmploymentStatus,
          employmentType: empType as EmploymentType,
          hireDate: D(hireOffset),
          probationEndDate: i < 4 ? D(int(20, 70)) : null,
          terminationDate: employmentStatus === "TERMINATED" ? D(-int(10, 200)) : null,
          terminationReason: employmentStatus === "TERMINATED" ? pick(["Resignation", "End of contract", "Redundancy"]) : null,
          departmentId: deptIds[deptTitle],
          teamId: teamIds[teamName],
          locationId: pick(locIds),
          positionId: posIds[posTitle],
          salaryType: salaryType as SalaryType,
          baseSalary: dec(salaryType === "ANNUAL" ? base : 0),
          hourlyRate: dec(hourly),
          standardHoursPerWeek: dec(empType === "FULL_TIME" ? 38 : empType === "PART_TIME" ? 24 : 20),
          superFundName: pick(SUPER_FUNDS),
          superMemberNumber: `${pick(["ABC", "DEF", "GHI", "JKL"])}${int(1000000, 9999999)}`,
          emergencyContactName: `${pick(FIRST)} ${last}`,
          emergencyContactPhone: `04${int(10, 99)} ${int(100, 999)} ${int(100, 999)}`,
          notes: rnd() < 0.15 ? "Preferred flexible start times." : null,
        },
      });
    }

    // second pass: managers
    const all = await p.employee.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "asc" },
    });
    for (let i = 0; i < all.length; i++) {
      const isSenior = POSITIONS.find((x) => x[0] === all[i].positionId) === undefined;
      void isSenior;
      if (i > 0 && i % 7 !== 0) {
        const mgr = all[Math.max(0, i - int(2, 7))];
        if (mgr.id !== all[i].id) {
          await p.employee.update({
            where: { id: all[i].id },
            data: { managerId: mgr.id },
          });
        }
      }
    }
    // link admin to an employee profile (the senior-most ops manager)
    const lead = all[0];
    if (lead) {
      await p.employee.update({ where: { id: lead.id }, data: { userId: admin.id } });
    }
  }

  const emps = await p.employee.findMany({
    where: { organisationId: org.id },
    orderBy: { employeeNumber: "asc" },
  });
  const active = emps.filter((e) => e.employmentStatus !== "TERMINATED");
  console.log(`  Employees: ${emps.length} (${active.length} active)`);

  await p.organisation.update({
    where: { id: org.id },
    data: { employeeCount: emps.length },
  });

  // ── leave types ────────────────────────────────────────────────
  const leaveDefs: Array<[string, string, number, boolean, number, string]> = [
    ["Annual Leave", "ANNUAL", 4, true, 20, "#6366f1"],
    ["Personal / Sick Leave", "PERSONAL", 1, true, 10, "#f59e0b"],
    ["Long Service Leave", "LSL", 0.866, true, 0, "#10b981"],
    ["Unpaid Leave", "UNPAID", 0, false, 0, "#64748b"],
    ["Parental Leave", "PARENTAL", 0, true, 0, "#ec4899"],
    ["Public Holidays", "PUBLIC", 0, true, 11, "#0ea5e9"],
  ];
  const leaveTypeIds: Record<string, string> = {};
  for (const [name, code, accrual, isPaid, , colour] of leaveDefs) {
    const lt = await p.leaveType.upsert({
      where: { organisationId_code: { organisationId: org.id, code } },
      update: {},
      create: {
        organisationId: org.id, name, code,
        accrualRate: dec(accrual), isPaid, colour,
        maxCarryOver: dec(code === "ANNUAL" ? 40 : 0),
      },
    });
    leaveTypeIds[code] = lt.id;
  }

  const year = new Date().getFullYear();

  // ── leave balances ─────────────────────────────────────────────
  const balCount = await p.leaveBalance.count({ where: { organisationId: org.id } });
  if (balCount === 0) {
    for (const e of active) {
      for (const [, code] of leaveDefs) {
        if (code === "UNPAID" || code === "PUBLIC") continue;
        const ent = code === "ANNUAL" ? 20 : code === "PERSONAL" ? 10 : code === "LSL" ? 5 : 12;
        const taken = int(0, Math.max(0, ent - 2));
        await p.leaveBalance.create({
          data: {
            organisationId: org.id,
            employeeId: e.id,
            leaveTypeId: leaveTypeIds[code],
            year,
            entitlement: dec(ent),
            taken: dec(taken),
            pending: dec(int(0, 3)),
            carriedOver: dec(int(0, 6)),
          },
        });
      }
    }
  }

  // ── availability ───────────────────────────────────────────────
  const availCount = await p.availability.count({ where: { organisationId: org.id } });
  if (availCount === 0) {
    for (const e of active) {
      for (let dow = 0; dow < 7; dow++) {
        const weekend = dow === 0 || dow === 6;
        await p.availability.create({
          data: {
            organisationId: org.id,
            employeeId: e.id,
            dayOfWeek: dow,
            isAvailable: weekend ? rnd() < 0.35 : rnd() > 0.08,
            startTime: weekend ? "09:00" : "08:00",
            endTime: weekend ? "15:00" : "16:30",
            note: weekend ? "Weekend preference" : null,
          },
        });
      }
    }
  }

  // ── attendance (last 14 days) ──────────────────────────────────
  const attCount = await p.attendanceRecord.count({ where: { organisationId: org.id } });
  if (attCount === 0) {
    for (const e of active) {
      for (let d = -14; d <= -1; d++) {
        const date = D(d);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue;
        if (rnd() < 0.1) continue;

        const roll = rnd();
        const status = roll > 0.92 ? "ON_LEAVE" : roll > 0.88 ? "LATE" : roll > 0.86 ? "HALF_DAY" : "PRESENT";
        const start = status === "LATE" ? addMinutes("08:30", int(15, 55)) : "08:30";
        const end = status === "HALF_DAY" ? "12:30" : addMinutes("17:00", int(-30, 45));
        const brk = status === "HALF_DAY" ? 0 : 30;
        const worked = hoursBetween(start, end, brk) * 60;

        await p.attendanceRecord.create({
          data: {
            organisationId: org.id,
            employeeId: e.id,
            date,
            clockIn: status === "ON_LEAVE" ? null : new Date(`${iso(date).slice(0, 10)}T${start}:00`),
            clockOut: status === "ON_LEAVE" ? null : new Date(`${iso(date).slice(0, 10)}T${end}:00`),
            breakMinutes: brk,
            workedMinutes: status === "ON_LEAVE" ? 0 : Math.round(worked),
            overtimeMinutes: worked > 480 ? Math.round(worked - 480) : 0,
            status: status as AttendanceStatus,
            source: rnd() < 0.7 ? "CLOCK_IN" : "MANUAL",
            notes: status === "LATE" ? "Traffic delay reported" : null,
          },
        });
      }
    }
  }

  // ── timesheets ─────────────────────────────────────────────────
  const tsCount = await p.timesheet.count({ where: { organisationId: org.id } });
  if (tsCount === 0) {
    const periods = [
      { start: D(-14), end: D(-8), status: "APPROVED" },
      { start: D(-7), end: D(-1), status: "SUBMITTED" },
      { start: D(0), end: D(6), status: "DRAFT" },
    ];
    for (const e of active.slice(0, 45)) {
      for (const per of periods) {
        const hours = per.status === "DRAFT" ? int(12, 28) : int(30, 42);
        const ts = await p.timesheet.create({
          data: {
            organisationId: org.id,
            employeeId: e.id,
            periodStart: per.start,
            periodEnd: per.end,
            totalHours: dec(hours),
            overtimeHours: dec(int(0, 5)),
            status: per.status as TimesheetStatus,
            submittedAt: per.status !== "DRAFT" ? per.end : null,
            approvedAt: per.status === "APPROVED" ? new Date(per.end.getTime() + 86400000) : null,
            approvedById: per.status === "APPROVED" ? admin.id : null,
          },
        });
        for (let d = 0; d <= 6; d++) {
          const day = D(-14 + (per.start > D(-8) ? 7 : 0) + d);
          if (day.getDay() === 0 || day.getDay() === 6) continue;
          const h = Math.round((hours / 5) * 100) / 100;
          await p.timesheetEntry.create({
            data: {
              timesheetId: ts.id,
              date: day,
              startTime: "08:30",
              endTime: "17:00",
              breakMinutes: 30,
              hours: dec(h),
              overtimeHours: dec(rnd() < 0.3 ? 1 : 0),
            },
          });
        }
      }
    }
  }

  // ── leave requests ─────────────────────────────────────────────
  const lrCount = await p.leaveRequest.count({ where: { organisationId: org.id } });
  if (lrCount === 0) {
    const statuses = ["APPROVED", "APPROVED", "APPROVED", "PENDING", "PENDING", "REJECTED"];
    for (let i = 0; i < 48; i++) {
      const e = pick(active);
      const code = pick(["ANNUAL", "ANNUAL", "PERSONAL", "LSL", "UNPAID", "PARENTAL"]);
      const startOffset = int(-40, 35);
      const len = int(1, 10);
      const st = pick(statuses);
      await p.leaveRequest.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          leaveTypeId: leaveTypeIds[code],
          startDate: D(startOffset),
          endDate: D(startOffset + len),
          days: dec(len),
          hours: dec(len * 7.6),
          reason: pick(["Family holiday", "Medical appointment", "Personal leave", "Travel", "Rest and recovery", "School event"]),
          status: st as LeaveStatus,
          appliedAt: D(startOffset - int(3, 21)),
          reviewedAt: st === "PENDING" ? null : D(startOffset - int(1, 3)),
          reviewedById: st === "PENDING" ? null : admin.id,
          reviewNotes: st === "REJECTED" ? "Insufficient cover on shift roster" : st === "APPROVED" ? "Approved — coverage confirmed" : null,
        },
      });
    }
  }

  // ── rosters & shifts ───────────────────────────────────────────
  const rosterCount = await p.roster.count({ where: { organisationId: org.id } });
  if (rosterCount === 0) {
    // find the Monday of this week
    const today = D(0);
    const dow = (today.getDay() + 6) % 7;
    const monday = D(-dow);

    const rosterDefs = [
      { name: "Current Week", start: monday, status: "PUBLISHED" },
      { name: "Next Week", start: new Date(monday.getTime() + 7 * 86400000), status: "DRAFT" },
    ];

    for (const rd of rosterDefs) {
      const end = new Date(rd.start.getTime() + 6 * 86400000);
      const roster = await p.roster.create({
        data: {
          organisationId: org.id,
          name: rd.name,
          weekStart: rd.start,
          weekEnd: end,
          status: rd.status as RosterStatus,
          publishedAt: rd.status === "PUBLISHED" ? rd.start : null,
          publishedById: rd.status === "PUBLISHED" ? admin.id : null,
        },
      });

      const crew = active.slice(0, 34);
      for (const e of crew) {
        const days = rnd() < 0.6 ? 5 : rnd() < 0.7 ? 4 : 3;
        for (let d = 0; d < days; d++) {
          const dayIdx = Math.min(4, d);
          const shiftDate = new Date(rd.start.getTime() + dayIdx * 86400000);
          const start = pick(["06:00", "07:00", "08:00", "08:30", "09:00", "10:00", "14:00", "22:00"]);
          const brk = start === "22:00" ? 20 : 30;
          const endT = addMinutes(start, 8 * 60 + brk);
          const overtime = rnd() < 0.15;

          await p.shift.create({
            data: {
              organisationId: org.id,
              rosterId: roster.id,
              employeeId: e.id,
              locationId: pick(locIds),
              date: shiftDate,
              startTime: start,
              endTime: endT,
              breakMinutes: brk,
              hours: dec(hoursBetween(start, endT, brk)),
              roleLabel: pick(["Dispatch", "Receiving", "Pick & Pack", "Forklift", "Supervisor", "Support"]),
              isOvertime: overtime,
              status: (rd.status === "PUBLISHED"
                ? pick(["CONFIRMED", "CONFIRMED", "SCHEDULED", "SCHEDULED", "SWAP_REQUESTED"])
                : "SCHEDULED") as ShiftStatus,
              publishedAt: rd.status === "PUBLISHED" ? rd.start : null,
            },
          });
        }
      }
    }

    // a handful of swap requests
    const shifts = await p.shift.findMany({
      where: { organisationId: org.id },
      take: 200,
    });
    for (let i = 0; i < 9 && i < shifts.length; i++) {
      const sh = shifts[i * 7 % shifts.length];
      const other = pick(active);
      await p.shiftSwapRequest.create({
        data: {
          organisationId: org.id,
          shiftId: sh.id,
          requestedById: sh.employeeId,
          offeredToId: other.id === sh.employeeId ? null : other.id,
          reason: pick(["Appointment clash", "Childcare", "Study commitment", "Transport issue"]),
          status: pick(["PENDING", "PENDING", "APPROVED", "REJECTED"]) as SwapStatus,
          reviewedAt: rnd() < 0.5 ? new Date() : null,
        },
      });
    }

    // synthetic roster conflicts
    const confDefs: Array<[string, string, string]> = [
      ["OVERLAP", "ERROR", "Olivia Smith is rostered on two overlapping shifts (Mon 06:00–14:30 and 14:00–22:30)."],
      ["LEAVE_CLASH", "ERROR", "Jack Jones has approved annual leave during a scheduled Wednesday shift."],
      ["AVAILABILITY", "WARNING", "Isla Brown is not marked available on Friday afternoons but has a 14:00–22:00 shift."],
      ["OVERTIME", "WARNING", "Noah Wilson exceeds 38 standard hours by 6.5h this roster period."],
      ["UNFILLED", "ERROR", "Tuesday 22:00–06:00 dispatch shift has no assignee."],
      ["MISSING_BREAK", "INFO", "Two shifts exceed 5 hours without a recorded 30-minute break."],
      ["AVAILABILITY", "WARNING", "Mia Taylor marked unavailable Monday but rostered 08:30–17:00."],
      ["OVERTIME", "WARNING", "Three casual employees exceed 30 hours for the week."],
      ["OVERLAP", "ERROR", "Ethan Clark double-booked between Sydney HQ and Melbourne Depot on Thursday."],
      ["UNFILLED", "WARNING", "Weekend receiving cover is below minimum staffing (1 of 2 required)."],
    ];
    for (const [type, severity, message] of confDefs) {
      await p.rosterConflict.create({
        data: {
          organisationId: org.id,
          rosterId: (await p.roster.findFirst({ where: { organisationId: org.id } }))!.id,
          type: type as never,
          severity: severity as never,
          message,
          resolved: rnd() < 0.3,
        },
      });
    }
  }

  // ── payroll ────────────────────────────────────────────────────
  const schedCount = await p.paySchedule.count({ where: { organisationId: org.id } });
  if (schedCount === 0) {
    await p.paySchedule.createMany({
      data: [
        { organisationId: org.id, name: "Weekly Casual Crew", frequency: "WEEKLY", payDay: 4, nextRunDate: D(3), isActive: true },
        { organisationId: org.id, name: "Fortnightly Salaried", frequency: "FORTNIGHTLY", payDay: 3, nextRunDate: D(6), isActive: true },
        { organisationId: org.id, name: "Monthly Corporate", frequency: "MONTHLY", payDay: 1, nextRunDate: D(18), isActive: false },
      ],
      skipDuplicates: true,
    });

    const cats: Array<[string, string, PayCategoryType, boolean, number, string]> = [
      ["Ordinary Hours", "ORD-HRS", "ORDINARY", true, 1, "HOURS"],
      ["Overtime 1.5x", "OT-15", "OVERTIME", true, 1.5, "MULTIPLIER"],
      ["Overtime 2.0x", "OT-20", "OVERTIME", true, 2, "MULTIPLIER"],
      ["Casual Loading", "CAS-LOAD", "ALLOWANCE", true, 0.25, "PERCENT"],
      ["Vehicle Allowance", "VEH-ALLOW", "ALLOWANCE", true, 0.85, "PER_KM"],
      ["Meal Allowance", "MEAL-ALLOW", "ALLOWANCE", true, 1, "AMOUNT"],
      ["Shift Penalty", "SHIFT-PEN", "ALLOWANCE", true, 0.15, "PERCENT"],
      ["Performance Bonus", "BONUS", "BONUS", true, 1, "AMOUNT"],
      ["Superannuation", "SUPER", "SUPER", false, 11.5, "PERCENT"],
      ["PAYG Withholding", "PAYG", "TAX", false, 0, "AMOUNT"],
      ["Salary Sacrifice", "SAL-SAC", "DEDUCTION", false, 1, "AMOUNT"],
      ["Union Fee", "UNION", "DEDUCTION", false, 1, "AMOUNT"],
    ];
    for (let i = 0; i < cats.length; i++) {
      const [name, code, type, taxable, rate, unit] = cats[i];
      await p.payCategory.upsert({
        where: { organisationId_code: { organisationId: org.id, code } },
        update: {},
        create: {
          organisationId: org.id, name, code, type,
          isTaxable: taxable, isSuperable: type === "ORDINARY" || type === "OVERTIME",
          rate: dec(rate), unit, sortOrder: i,
        },
      });
    }
  }

  const payRunCount = await p.payRun.count({ where: { organisationId: org.id } });
  if (payRunCount === 0) {
    const schedules = await p.paySchedule.findMany({ where: { organisationId: org.id } });
    const runDefs = [
      { label: "Pay run 14 — week ending", offset: -29, status: "PAID" },
      { label: "Pay run 15 — week ending", offset: -22, status: "PAID" },
      { label: "Pay run 16 — week ending", offset: -15, status: "APPROVED" },
      { label: "Pay run 17 — week ending", offset: -8, status: "PENDING_APPROVAL" },
      { label: "Pay run 18 — week ending", offset: -1, status: "DRAFT" },
    ];

    for (const rd of runDefs) {
      const periodStart = D(rd.offset - 6);
      const periodEnd = D(rd.offset);
      const run = await p.payRun.create({
        data: {
          organisationId: org.id,
          payScheduleId: pick(schedules).id,
          label: `${rd.label} ${periodEnd.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}`,
          periodStart, periodEnd,
          payDate: D(rd.offset + 3),
          status: rd.status as PayRunStatus,
          approvedAt: ["APPROVED", "PAID"].includes(rd.status) ? D(rd.offset + 1) : null,
          approvedById: ["APPROVED", "PAID"].includes(rd.status) ? admin.id : null,
          paidAt: rd.status === "PAID" ? D(rd.offset + 3) : null,
          notes: rd.status === "DRAFT" ? "Awaiting final timesheet approvals" : null,
        },
      });

      const pool = active.slice(0, 40);
      let gross = 0, superSum = 0, tax = 0, net = 0;

      for (const e of pool) {
        const hourly = Number(e.hourlyRate) || 35;
        const annual = Number(e.baseSalary) || 0;
        const isCasual = e.employmentType === "CASUAL";
        const hours = isCasual ? int(24, 40) : e.employmentType === "PART_TIME" ? int(20, 34) : int(34, 42);
        const g = e.salaryType === "ANNUAL"
          ? Math.round(((annual / 26) * (hours / 38)) * 100) / 100
          : Math.round(hours * hourly * 100) / 100;
        const superAmt = Math.round(g * 0.115 * 100) / 100;
        const taxAmt = Math.round(g * (g > 1800 ? 0.24 : g > 1000 ? 0.19 : 0.13) * 100) / 100;
        const netAmt = Math.round((g - taxAmt) * 100) / 100;

        gross += g; superSum += superAmt; tax += taxAmt; net += netAmt;

        if (rd.status !== "DRAFT") {
          await p.payRunLine.create({
            data: {
              payRunId: run.id,
              employeeId: e.id,
              hoursWorked: dec(hours),
              grossPay: dec(g),
              superAmount: dec(superAmt),
              taxAmount: dec(taxAmt),
              netPay: dec(netAmt),
              breakdown: [
                { label: "Ordinary hours", amount: g },
                { label: "Superannuation (11.5%)", amount: superAmt },
                { label: "PAYG withholding", amount: -taxAmt },
              ],
            },
          });
        }

        if (["PAID", "APPROVED"].includes(rd.status)) {
          await p.payslip.create({
            data: {
              organisationId: org.id,
              payRunId: run.id,
              employeeId: e.id,
              periodStart, periodEnd,
              grossPay: dec(g), superAmount: dec(superAmt),
              taxAmount: dec(taxAmt), netPay: dec(netAmt),
              status: rd.status === "PAID" ? "ISSUED" : "PENDING",
              issuedAt: rd.status === "PAID" ? D(rd.offset + 3) : null,
            },
          });
        }
      }

      await p.payRun.update({
        where: { id: run.id },
        data: {
          employeeCount: pool.length,
          grossPay: dec(Math.round(gross * 100) / 100),
          superAmount: dec(Math.round(superSum * 100) / 100),
          taxAmount: dec(Math.round(tax * 100) / 100),
          netPay: dec(Math.round(net * 100) / 100),
        },
      });
    }

    // super + PAYG records for the current period
    for (const e of active.slice(0, 40)) {
      const base = e.salaryType === "ANNUAL" ? Number(e.baseSalary) : Number(e.hourlyRate) * 38;
      await p.superannuationRecord.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          periodLabel: "Oct 2026",
          salaryBase: dec(Math.round(base)),
          superRate: dec(11.5),
          superAmount: dec(Math.round(base * 0.115 * 100) / 100),
          fundName: e.superFundName,
          memberNumber: e.superMemberNumber,
          status: pick(["PROCESSED", "PROCESSED", "PENDING"]),
        },
      });
      await p.paygRecord.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          periodLabel: "Oct 2026",
          grossPay: dec(Math.round(base / 26)),
          taxWithheld: dec(Math.round((base / 26) * 0.18 * 100) / 100),
          cumulativeGross: dec(Math.round(base * 0.77)),
          cumulativeTax: dec(Math.round(base * 0.77 * 0.19 * 100) / 100),
          status: pick(["LODGED", "LODGED", "PENDING"]),
        },
      });
    }
  }

  // ── expenses ───────────────────────────────────────────────────
  const expCount = await p.expense.count({ where: { organisationId: org.id } });
  if (expCount === 0) {
    const cats = ["Travel", "Meals", "Fuel", "Equipment", "Training", "Software", "Office Supplies", "Parking"];
    const statuses = ["APPROVED", "APPROVED", "PENDING", "PENDING", "REJECTED", "REIMBURSED"];
    for (let i = 0; i < 46; i++) {
      const e = pick(active);
      const st = pick(statuses);
      await p.expense.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          category: pick(cats),
          description: pick([
            "Client site travel", "Team lunch", "Fuel — site visit", "Monitor stand",
            "First aid refresher course", "Figma monthly", "Printer toner", "Airport parking",
            "Courier materials", "Conference ticket",
          ]),
          amount: dec(int(12, 780)),
          expenseDate: D(-int(1, 75)),
          receiptName: `receipt-${1000 + i}.pdf`,
          status: st as ExpenseStatus,
          submittedAt: D(-int(1, 74)),
          reviewedAt: st === "PENDING" ? null : D(-int(0, 20)),
          reviewedById: st === "PENDING" ? null : admin.id,
          reviewNotes: st === "REJECTED" ? "Missing itemised receipt" : null,
          reimbursedAt: st === "REIMBURSED" ? D(-int(0, 10)) : null,
        },
      });
    }
    for (let i = 0; i < 5; i++) {
      const e = pick(active);
      await p.expenseReport.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          name: `Travel claim ${i + 1}`,
          periodStart: D(-60 + i * 10),
          periodEnd: D(-50 + i * 10),
          totalAmount: dec(int(240, 2100)),
          itemCount: int(3, 9),
          status: pick(["DRAFT", "PENDING", "APPROVED"]) as ExpenseStatus,
        },
      });
    }
  }

  // ── onboarding ─────────────────────────────────────────────────
  const chkCount = await p.onboardingChecklist.count({ where: { organisationId: org.id } });
  if (chkCount === 0) {
    const checklists: Array<[string, string, string[]]> = [
      ["Standard Employee Onboarding", "Default for all new starters", [
        "Send signed contract", "Collect TFN declaration", "Set up payroll profile",
        "Order laptop and accessories", "Create email and system accounts",
        "Complete induction session", "Assign workplace health & safety induction",
        "Introduce to team and manager", "Set 30-day check-in",
      ]],
      ["Casual Warehouse Onboarding", "Warehouse casuals", [
        "Verify right to work", "White card verification", "Forklift licence check",
        "Site induction", "PPE issued", "Roster assignment",
      ]],
      ["Offboarding Checklist", "All leavers", [
        "Exit interview scheduled", "Access revoked", "Equipment returned",
        "Final pay calculated", "Knowledge transfer complete", "Alumni contact recorded",
      ]],
    ];
    for (const [name, description, tasks] of checklists) {
      await p.onboardingChecklist.create({
        data: {
          organisationId: org.id,
          name,
          description,
          isDefault: name.startsWith("Standard"),
        },
      });
      void tasks;
    }

    const allCl = await p.onboardingChecklist.findMany({ where: { organisationId: org.id } });
    const newStarters = await p.employee.findMany({
      where: { organisationId: org.id, employmentStatus: { in: ["PROBATION", "ACTIVE"] } },
      take: 14,
      orderBy: { hireDate: "desc" },
    });

    for (const cl of allCl) {
      const stage = cl.name.includes("Offboarding") ? "OFFBOARDING" : "ONBOARDING";
      const titles = checklists.find((c) => c[0] === cl.name)?.[2] ?? [];
      const assigned = stage === "OFFBOARDING" ? newStarters.slice(0, 5) : newStarters;

      for (const e of assigned) {
        for (let i = 0; i < titles.length; i++) {
          const done = rnd() < 0.55;
          await p.onboardingTask.create({
            data: {
              organisationId: org.id,
              checklistId: cl.id,
              employeeId: e.id,
              assigneeId: rnd() < 0.4 ? admin.id : null,
              title: titles[i],
              stage: stage as TaskStage,
              category: pick(["Admin", "Payroll", "IT", "Training", "HR", "Equipment"]),
              status: (done ? pick(["COMPLETED", "COMPLETED", "IN_PROGRESS"]) : pick(["NOT_STARTED", "NOT_STARTED", "IN_PROGRESS", "BLOCKED"])) as TaskStatus,
              dueDate: D(int(-5, 30)),
              completedAt: done ? D(-int(0, 12)) : null,
            },
          });
        }
      }
    }
  }

  // ── performance ────────────────────────────────────────────────
  const revCount = await p.review.count({ where: { organisationId: org.id } });
  if (revCount === 0) {
    const sample = active.slice(0, 26);
    for (const e of sample) {
      const st = pick(["COMPLETED", "COMPLETED", "IN_PROGRESS", "DRAFT", "CANCELLED"]);
      await p.review.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          reviewerId: e.managerId,
          type: pick(["ANNUAL", "QUARTERLY", "PROBATION", "MID_YEAR"]) as ReviewType,
          title: `${new Date().getFullYear()} Performance Review`,
          periodStart: D(-180),
          periodEnd: D(-1),
          dueDate: D(int(-10, 45)),
          status: st as ReviewStatus,
          overallRating: st === "COMPLETED" ? dec(Math.round((3 + rnd() * 2) * 100) / 100) : null,
          employeeComments: st === "COMPLETED" ? "Enjoying the variety of work and supportive team." : null,
          reviewerComments: st === "COMPLETED" ? "Consistently reliable with strong attention to detail." : null,
          strengths: st === "COMPLETED" ? "Communication, reliability, problem solving" : null,
          improvements: st === "COMPLETED" ? "Could delegate more during peak periods" : null,
          completedAt: st === "COMPLETED" ? D(-int(1, 60)) : null,
        },
      });
    }

    const goals = [
      "Reduce dispatch errors below 1%", "Complete first aid recertification",
      "Improve on-time delivery to 97%", "Lead weekly team toolbox talks",
      "Close out overdue safety actions", "Mentor two new starters",
      "Automate the weekly roster export", "Grow managed accounts by 12%",
      "Reduce support first-response time to under 2h",
    ];
    for (let i = 0; i < 34; i++) {
      const e = pick(active);
      const st = pick(["IN_PROGRESS", "IN_PROGRESS", "COMPLETED", "NOT_STARTED", "AT_RISK"]);
      await p.goal.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          title: pick(goals),
          description: "Set during the quarterly check-in with the team leader.",
          category: pick(["Performance", "Development", "Compliance", "Team"]),
          progress: st === "COMPLETED" ? 100 : st === "NOT_STARTED" ? 0 : int(10, 90),
          status: st as GoalStatus,
          dueDate: D(int(-20, 120)),
        },
      });
    }

    const comments = [
      "Stepped up to cover the early shift without being asked — really appreciate it.",
      "Handover notes have become much clearer, makes the next shift easier.",
      "Could slow down during peak to double-check pick accuracy.",
      "Great work coaching the new starter through their first week.",
      "Response times on tickets have improved noticeably this month.",
      "Please flag roster clashes earlier so we can find cover.",
    ];
    for (let i = 0; i < 24; i++) {
      const e = pick(active);
      const a = pick(active);
      await p.feedback.create({
        data: {
          organisationId: org.id,
          employeeId: e.id,
          authorId: a.id === e.id ? (active[0].id === e.id ? active[1].id : active[0].id) : a.id,
          type: pick(["POSITIVE", "CONSTRUCTIVE", "RECOGNITION", "GENERAL"]) as FeedbackType,
          visibility: pick(["PRIVATE", "MANAGER_ONLY", "PUBLIC"]),
          comment: pick(comments),
        },
      });
    }
  }

  // ── policies ───────────────────────────────────────────────────
  const polCount = await p.policy.count({ where: { organisationId: org.id } });
  if (polCount === 0) {
    const policies: Array<[string, string, boolean, number]> = [
      ["Code of Conduct", "Governance", true, 0],
      ["Work Health & Safety Policy", "Safety", true, 0],
      ["Leave & Attendance Policy", "Employment", true, 0],
      ["Flexible Working Arrangements", "Employment", false, 7],
      ["Expense Reimbursement Policy", "Finance", true, 14],
      ["Information Security Policy", "Governance", true, 0],
      ["Bullying & Harassment Policy", "Safety", true, 3],
      ["Social Media Policy", "Governance", false, 21],
    ];
    for (const [title, category, mandatory, dueOffset] of policies) {
      const pol = await p.policy.create({
        data: {
          organisationId: org.id,
          title,
          category,
          content: `# ${title}\n\nThis policy sets out the organisation's expectations and applies to all employees and contractors.\n\n## Scope\nApplies to all staff across every location.\n\n## Responsibilities\nManagers are responsible for implementation; employees are responsible for compliance.\n\n## Review\nThis policy is reviewed annually by the People & Culture team.`,
          version: `1.${int(0, 4)}`,
          effectiveDate: D(-int(60, 700)),
          reviewDate: D(int(30, 300)),
          isMandatory: mandatory,
          createdById: admin.id,
        },
      });

      const audience = mandatory ? active : active.slice(0, 30);
      for (const e of audience) {
        const roll = rnd();
        const st = roll > 0.22 ? "ACKNOWLEDGED" : roll > 0.1 ? "PENDING" : "OVERDUE";
        await p.policyAcknowledgement.create({
          data: {
            organisationId: org.id,
            policyId: pol.id,
            employeeId: e.id,
            status: st as AcknowledgementStatus,
            acknowledgedAt: st === "ACKNOWLEDGED" ? D(-int(0, 55)) : null,
            dueDate: D(dueOffset),
            ipAddress: `10.${int(1, 9)}.${int(1, 9)}.${int(2, 250)}`,
          },
        });
      }
    }
  }

  // ── organisation settings ──────────────────────────────────────
  const settings: Array<[string, string, string, string, string, boolean]> = [
    ["hr", "date_format", "Date format", "DD/MM/YYYY", "string", false],
    ["hr", "week_starts", "Week starts on", "Monday", "string", false],
    ["hr", "probation_default", "Default probation period (days)", "90", "number", false],
    ["hr", "employee_number_prefix", "Employee number prefix", "EMP-", "string", false],
    ["hr", "require_probation_review", "Require probation review", "true", "boolean", false],
    ["hr", "allow_self_profile_edit", "Employees can edit own profile", "true", "boolean", false],
    ["leave", "annual_accrual", "Annual leave accrual method", "per_fortnight", "string", false],
    ["leave", "personal_leave_requires_note", "Personal leave requires a note", "false", "boolean", false],
    ["leave", "max_concurrent_leave_pct", "Max team on leave at once (%)", "20", "number", false],
    ["leave", "leave_year_start", "Leave year start month", "July", "string", false],
    ["payroll", "super_rate", "Default superannuation rate (%)", "11.5", "number", false],
    ["payroll", "pay_day", "Default pay day", "Thursday", "string", false],
    ["payroll", "payg_withholding_enabled", "PAYG withholding enabled", "true", "boolean", false],
    ["payroll", "rounding", "Pay rounding", "nearest_cent", "string", false],
    ["payroll", "payslip_delivery", "Payslip delivery", "email", "string", false],
    ["notifications", "notify_new_starter", "Notify on new starter", "true", "boolean", false],
    ["notifications", "notify_leave_request", "Notify on leave request", "true", "boolean", false],
    ["notifications", "notify_timesheet_overdue", "Notify on overdue timesheet", "true", "boolean", false],
    ["notifications", "notify_expiry_30_days", "Notify 30 days before expiry", "true", "boolean", false],
    ["notifications", "daily_digest", "Send daily manager digest", "false", "boolean", false],
    ["business_rules", "auto_approve_leave_under_days", "Auto-approve leave under (days)", "2", "number", false],
    ["business_rules", "require_timesheet_approval", "Require timesheet approval", "true", "boolean", false],
    ["business_rules", "allow_shift_swaps", "Allow shift swaps", "true", "boolean", false],
    ["business_rules", "max_overtime_hours_week", "Max overtime hours per week", "12", "number", false],
    ["business_rules", "probation_review_reminder_days", "Probation review reminder (days)", "14", "number", false],
  ];
  for (const [group, key, label, value, dataType, isSecret] of settings) {
    await p.orgSetting.upsert({
      where: { organisationId_key: { organisationId: org.id, key } },
      update: {},
      create: { organisationId: org.id, group, key, label, value, dataType, isSecret },
    });
  }

  const ruleDefs: Array<[string, string, string, string, boolean]> = [
    ["annual_carry_over", "Annual leave carry-over limit", "Maximum days that can be carried into the next leave year", "40", true],
    ["personal_carry_over", "Personal leave carry-over", "Personal leave that expires at year end", "0", true],
    ["notice_period_probation", "Notice during probation", "Notice period while on probation", "1 week", true],
    ["notice_period_post_probation", "Notice after probation", "Notice period after probation completes", "4 weeks", true],
    ["min_shift_hours", "Minimum shift length", "Shortest rosterable shift", "3", true],
    ["max_consecutive_days", "Maximum consecutive working days", "Roster guard before overtime triggers", "6", true],
    ["leave_advance_notice", "Leave advance notice (days)", "Minimum notice required for annual leave", "14", true],
    ["sick_certificate_days", "Medical certificate required after", "Days of personal leave before a certificate is needed", "2", true],
    ["probation_extension_days", "Probation extension allowed (days)", "Maximum probation extension", "30", false],
    ["public_holiday_penalty", "Public holiday penalty", "Multiplier applied to public holiday hours", "2.5", true],
  ];
  for (const [key, name, description, value, isEnabled] of ruleDefs) {
    await p.leaveRule.upsert({
      where: { organisationId_key: { organisationId: org.id, key } },
      update: {},
      create: {
        organisationId: org.id, key, name, description, value,
        dataType: Number.isNaN(Number(value)) ? "string" : "number",
        unit: null, isEnabled,
      },
    });
  }

  // ── notifications ──────────────────────────────────────────────
  const notifCount = await p.orgNotification.count({ where: { organisationId: org.id } });
  if (notifCount === 0) {
    const notifs: Array<[string, string, string, string, boolean]> = [
      ["LEAVE_REQUESTED", "New leave request", "Olivia Smith requested 5 days of Annual Leave starting next Monday.", "/org/time/leave", false],
      ["LEAVE_APPROVED", "Leave approved", "Your Annual Leave request for 3–7 Nov has been approved.", "/org/time/leave", false],
      ["TIMESHEET_SUBMITTED", "Timesheet submitted", "12 timesheets are awaiting your approval.", "/org/time/timesheets", false],
      ["NEW_STARTER", "New starter added", "Noah Williams starts on Monday — 4 onboarding tasks are due.", "/org/onboarding/new-starters", false],
      ["EXPENSE_PENDING", "Expense awaiting approval", "3 expenses totalling $1,240.00 need review.", "/org/expenses/approvals", false],
      ["ROSTER_PUBLISHED", "Roster published", "The roster for week commencing 12 Oct has been published.", "/org/roster", false],
      ["SHIFT_SWAP", "Shift swap requested", "Mia Taylor wants to swap her Friday 14:00 shift.", "/org/roster/swaps", false],
      ["ROSTER_CONFLICT", "Roster conflict detected", "2 errors and 3 warnings found in the current roster.", "/org/roster/conflicts", false],
      ["PAY_RUN_READY", "Pay run ready for approval", "Pay run 17 is ready — $182,400.00 gross across 40 employees.", "/org/payroll/pay-runs", false],
      ["CERT_EXPIRING", "Certification expiring soon", "3 forklift licences expire within 30 days.", "/org/people/certifications", true],
      ["REVIEW_DUE", "Review due", "5 performance reviews are due this week.", "/org/performance/reviews", true],
      ["POLICY_OVERDUE", "Policy acknowledgement overdue", "8 employees haven't acknowledged the WHS policy.", "/org/policies", false],
    ];
    for (const [event, title, body, link, isRead] of notifs) {
      await p.orgNotification.createMany({
        data: [{
          organisationId: org.id,
          userId: admin.id,
          event, title, body, linkUrl: link, isRead,
        }],
      });
    }
  }

  // ── summary ────────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  const models = [
    "employee", "department", "team", "location", "position",
    "employeeDocument", "certification", "attendanceRecord", "timesheet",
    "leaveType", "leaveRequest", "leaveBalance", "availability",
    "roster", "shift", "shiftSwapRequest", "rosterConflict",
    "paySchedule", "payCategory", "payRun", "payslip",
    "superannuationRecord", "paygRecord", "expense", "expenseReport",
    "onboardingChecklist", "onboardingTask", "review", "goal", "feedback",
    "policy", "policyAcknowledgement", "orgSetting", "leaveRule", "orgNotification",
  ];
  for (const m of models) {
    counts[m] = MODEL_COUNT[m] ? await MODEL_COUNT[m](p, org.id) : -1;
  }
  console.log("\n  ── Organisation data ──");
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(`    ${k.padEnd(26)} ${v}`);
  }
  console.log("\nSeed complete.  Login: organ@jabit.com / Admin@1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
