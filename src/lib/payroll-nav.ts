export type PayrollNavChild = { label: string; href: string };
export type PayrollNavItem = {
  label: string;
  icon: string;
  href?: string;
  children?: PayrollNavChild[];
};

/** Full Payroll Admin menu — every href lives under /payroll. */
export const PAYROLL_NAV: PayrollNavItem[] = [
  { label: "Dashboard", icon: "🏠", href: "/payroll/dashboard" },
  { label: "AI Assistant", icon: "🤖", href: "/payroll/assistant" },
  {
    label: "Payroll Management",
    icon: "💰",
    children: [
      { label: "All Pay Runs", href: "/payroll/pay-runs" },
      { label: "Create Pay Run", href: "/payroll/pay-runs/new" },
      { label: "Calculate Payroll", href: "/payroll/calculate" },
      { label: "Review Payroll", href: "/payroll/review" },
      { label: "Approve Pay Run", href: "/payroll/approve" },
      { label: "Finalise Payroll", href: "/payroll/finalise" },
    ],
  },
  {
    label: "Pay Schedules",
    icon: "📅",
    children: [
      { label: "All Pay Schedules", href: "/payroll/schedules" },
      { label: "Create Pay Schedule", href: "/payroll/schedules/new" },
      { label: "Manage Pay Periods", href: "/payroll/schedules/periods" },
    ],
  },
  {
    label: "Payroll Employees",
    icon: "👥",
    children: [
      { label: "Employee Payroll Details", href: "/payroll/employees" },
      { label: "Salary & Wages", href: "/payroll/employees/salary" },
      { label: "Payment Details", href: "/payroll/employees/payment-details" },
      { label: "Tax Declarations", href: "/payroll/employees/tax-declarations" },
    ],
  },
  {
    label: "Timesheets",
    icon: "⏱️",
    children: [
      { label: "All Timesheets", href: "/payroll/timesheets" },
      { label: "Pending Timesheets", href: "/payroll/timesheets/pending" },
      { label: "Approved Timesheets", href: "/payroll/timesheets/approved" },
      { label: "Timesheet Variances", href: "/payroll/timesheets/variances" },
    ],
  },
  {
    label: "Pay Categories",
    icon: "🧾",
    children: [
      { label: "All Pay Categories", href: "/payroll/categories" },
      { label: "Ordinary Hours", href: "/payroll/categories/ordinary" },
      { label: "Overtime", href: "/payroll/categories/overtime" },
      { label: "Penalty Rates", href: "/payroll/categories/penalty-rates" },
      { label: "Allowances", href: "/payroll/categories/allowances" },
    ],
  },
  {
    label: "Tax & Superannuation",
    icon: "🇦🇺",
    children: [
      { label: "PAYG", href: "/payroll/tax/payg" },
      { label: "Superannuation", href: "/payroll/tax/superannuation" },
      { label: "Tax Declarations", href: "/payroll/tax/declarations" },
      { label: "Payroll Tax Information", href: "/payroll/tax/payroll-tax" },
    ],
  },
  {
    label: "Payslips",
    icon: "📄",
    children: [
      { label: "Generate Payslips", href: "/payroll/payslips/generate" },
      { label: "All Payslips", href: "/payroll/payslips" },
      { label: "Payslip History", href: "/payroll/payslips/history" },
    ],
  },
  {
    label: "Payroll Reports",
    icon: "📊",
    children: [
      { label: "Payroll Summary", href: "/payroll/reports/summary" },
      { label: "Earnings Reports", href: "/payroll/reports/earnings" },
      { label: "Tax Reports", href: "/payroll/reports/tax" },
      { label: "Superannuation Reports", href: "/payroll/reports/superannuation" },
      { label: "Pay Run Reports", href: "/payroll/reports/pay-run" },
    ],
  },
  {
    label: "Payroll Integrations",
    icon: "🔌",
    children: [
      { label: "Connected Integrations", href: "/payroll/integrations" },
      { label: "Integration Mapping", href: "/payroll/integrations/mapping" },
      { label: "Sync Status", href: "/payroll/integrations/sync" },
      { label: "Sync Logs", href: "/payroll/integrations/logs" },
    ],
  },
  {
    label: "Payroll Exceptions",
    icon: "⚠️",
    children: [
      { label: "Calculation Errors", href: "/payroll/exceptions/calculation-errors" },
      { label: "Missing Timesheets", href: "/payroll/exceptions/missing-timesheets" },
      { label: "Payment Details Issues", href: "/payroll/exceptions/payment-details" },
      { label: "Payroll Anomalies", href: "/payroll/exceptions/anomalies" },
    ],
  },
  {
    label: "Single Touch Payroll",
    icon: "📤",
    children: [
      { label: "STP Reports", href: "/payroll/stp" },
      { label: "Submission Status", href: "/payroll/stp/status" },
      { label: "Submission History", href: "/payroll/stp/history" },
    ],
  },
  {
    label: "Notifications",
    icon: "🔔",
    children: [
      { label: "Payroll Reminders", href: "/payroll/notifications/reminders" },
      { label: "Approval Notifications", href: "/payroll/notifications/approvals" },
      { label: "Payroll Error Alerts", href: "/payroll/notifications/errors" },
    ],
  },
  {
    label: "Payroll Settings",
    icon: "⚙️",
    children: [
      { label: "Payroll Preferences", href: "/payroll/settings" },
      { label: "Pay Run Settings", href: "/payroll/settings/pay-run" },
      { label: "Pay Categories Settings", href: "/payroll/settings/categories" },
      { label: "Tax Settings", href: "/payroll/settings/tax" },
      { label: "Superannuation Settings", href: "/payroll/settings/super" },
      { label: "Payslip Settings", href: "/payroll/settings/payslip" },
    ],
  },
];
