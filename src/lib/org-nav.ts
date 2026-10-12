export type OrgNavChild = { label: string; href: string };
export type OrgNavItem = {
  label: string;
  icon: string;
  href?: string;
  children?: OrgNavChild[];
};

/** Full Organisation Admin menu — every href lives under /org. */
export const ORG_NAV: OrgNavItem[] = [
  {
    label: "Dashboard",
    icon: "🏠",
    href: "/org/dashboard",
  },
  {
    label: "People",
    icon: "👥",
    children: [
      { label: "All Employees", href: "/org/people" },
      { label: "Teams", href: "/org/people/teams" },
      { label: "Departments", href: "/org/people/departments" },
      { label: "Locations", href: "/org/people/locations" },
      { label: "Positions", href: "/org/people/positions" },
      { label: "Documents", href: "/org/people/documents" },
      { label: "Certifications", href: "/org/people/certifications" },
    ],
  },
  {
    label: "Time & Attendance",
    icon: "⏰",
    children: [
      { label: "Attendance", href: "/org/time/attendance" },
      { label: "Timesheets", href: "/org/time/timesheets" },
      { label: "Leave Management", href: "/org/time/leave" },
      { label: "Leave Balances", href: "/org/time/leave-balances" },
      { label: "Employee Availability", href: "/org/time/availability" },
    ],
  },
  {
    label: "Rostering",
    icon: "📅",
    children: [
      { label: "Roster Calendar", href: "/org/roster" },
      { label: "Create Shifts", href: "/org/roster/create" },
      { label: "Publish Rosters", href: "/org/roster/publish" },
      { label: "Shift Swaps", href: "/org/roster/swaps" },
      { label: "Roster Conflicts", href: "/org/roster/conflicts" },
    ],
  },
  {
    label: "Payroll",
    icon: "💰",
    children: [
      { label: "Pay Runs", href: "/org/payroll/pay-runs" },
      { label: "Pay Schedules", href: "/org/payroll/schedules" },
      { label: "Pay Categories", href: "/org/payroll/categories" },
      { label: "Superannuation", href: "/org/payroll/superannuation" },
      { label: "PAYG", href: "/org/payroll/payg" },
      { label: "Payslips", href: "/org/payroll/payslips" },
      { label: "Payroll Reports", href: "/org/payroll/reports" },
    ],
  },
  {
    label: "Expenses",
    icon: "💳",
    children: [
      { label: "All Expenses", href: "/org/expenses" },
      { label: "Pending Approvals", href: "/org/expenses/approvals" },
      { label: "Expense Reports", href: "/org/expenses/reports" },
    ],
  },
  {
    label: "Onboarding",
    icon: "🚀",
    children: [
      { label: "New Starters", href: "/org/onboarding/new-starters" },
      { label: "Onboarding Checklists", href: "/org/onboarding/checklists" },
      { label: "Tasks", href: "/org/onboarding/tasks" },
      { label: "Offboarding", href: "/org/onboarding/offboarding" },
    ],
  },
  {
    label: "Performance",
    icon: "📈",
    children: [
      { label: "Employee Performance", href: "/org/performance" },
      { label: "Reviews", href: "/org/performance/reviews" },
      { label: "Goals & Feedback", href: "/org/performance/goals" },
    ],
  },
  {
    label: "Policies",
    icon: "📜",
    children: [
      { label: "Company Policies", href: "/org/policies" },
      { label: "Policy Acknowledgements", href: "/org/policies/acknowledgements" },
    ],
  },
  {
    label: "Reports",
    icon: "📊",
    children: [
      { label: "Employee Reports", href: "/org/reports/employees" },
      { label: "Attendance Reports", href: "/org/reports/attendance" },
      { label: "Leave Reports", href: "/org/reports/leave" },
      { label: "Roster Reports", href: "/org/reports/roster" },
      { label: "Payroll Reports", href: "/org/reports/payroll" },
    ],
  },
  {
    label: "User Management",
    icon: "👤",
    children: [
      { label: "All Users", href: "/org/users" },
      { label: "Invite Users", href: "/org/users/invite" },
      { label: "User Roles", href: "/org/users/roles" },
      { label: "Permissions", href: "/org/users/permissions" },
    ],
  },
  {
    label: "Integrations",
    icon: "🔌",
    children: [
      { label: "Connected Integrations", href: "/org/integrations" },
      { label: "Sync Status", href: "/org/integrations/sync" },
    ],
  },
  {
    label: "AI Assistant",
    icon: "🤖",
    href: "/org/assistant",
  },
  {
    label: "Organisation Settings",
    icon: "⚙️",
    children: [
      { label: "Organisation Profile", href: "/org/settings/profile" },
      { label: "HR Settings", href: "/org/settings/hr" },
      { label: "Leave Rules", href: "/org/settings/leave-rules" },
      { label: "Payroll Settings", href: "/org/settings/payroll" },
      { label: "Notifications", href: "/org/settings/notifications" },
      { label: "Business Rules", href: "/org/settings/business-rules" },
    ],
  },
];
