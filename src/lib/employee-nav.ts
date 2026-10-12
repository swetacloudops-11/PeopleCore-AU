export type EmployeeNavChild = { label: string; href: string };
export type EmployeeNavItem = {
  label: string;
  icon: string;
  href?: string;
  children?: EmployeeNavChild[];
};

/** Full Employee self-service menu — every href lives under /employee. */
export const EMPLOYEE_NAV: EmployeeNavItem[] = [
  {
    label: "Dashboard",
    icon: "🏠",
    href: "/employee/dashboard",
  },
  {
    label: "AI Assistant",
    icon: "🤖",
    href: "/employee/assistant",
  },
  {
    label: "My Profile",
    icon: "👤",
    children: [
      { label: "Personal Details", href: "/employee/profile#personal" },
      { label: "Contact Information", href: "/employee/profile#contact" },
      { label: "Employment Details", href: "/employee/profile#employment" },
      { label: "Emergency Contacts", href: "/employee/profile#emergency" },
      { label: "Update Profile", href: "/employee/profile/edit" },
    ],
  },
  {
    label: "My Roster",
    icon: "📅",
    children: [
      { label: "My Schedule", href: "/employee/roster" },
      { label: "Upcoming Shifts", href: "/employee/roster/upcoming" },
      { label: "Request Shift Swap", href: "/employee/roster/swaps" },
      { label: "My Availability", href: "/employee/availability" },
    ],
  },
  {
    label: "Time & Attendance",
    icon: "⏰",
    children: [
      { label: "Clock In / Clock Out", href: "/employee/attendance" },
      { label: "My Attendance History", href: "/employee/attendance/history" },
      { label: "My Timesheets", href: "/employee/timesheets" },
      { label: "Submit Timesheet", href: "/employee/timesheets/new" },
    ],
  },
  {
    label: "Leave Management",
    icon: "🏖️",
    children: [
      { label: "Apply for Leave", href: "/employee/leave/new" },
      { label: "My Leave Requests", href: "/employee/leave" },
      { label: "Leave Request Status", href: "/employee/leave/status" },
      { label: "My Leave Balance", href: "/employee/leave/balance" },
      { label: "Leave History", href: "/employee/leave/history" },
    ],
  },
  {
    label: "My Payroll",
    icon: "💰",
    children: [
      { label: "My Payslips", href: "/employee/payslips" },
      { label: "Pay History", href: "/employee/payroll/history" },
      { label: "Payment Details", href: "/employee/payroll/details" },
    ],
  },
  {
    label: "My Expenses",
    icon: "💳",
    children: [
      { label: "Submit Expense Claim", href: "/employee/expenses/new" },
      { label: "My Expense Claims", href: "/employee/expenses" },
      { label: "Claim Status", href: "/employee/expenses/status" },
    ],
  },
  {
    label: "My Documents",
    icon: "📄",
    children: [
      { label: "Employment Documents", href: "/employee/documents" },
      { label: "Upload Documents", href: "/employee/documents/upload" },
      { label: "Company Policies", href: "/employee/policies" },
      { label: "Policy Acknowledgements", href: "/employee/policies/acknowledgements" },
    ],
  },
  {
    label: "Onboarding",
    icon: "🚀",
    children: [
      { label: "Onboarding Tasks", href: "/employee/onboarding" },
      { label: "Required Documents", href: "/employee/onboarding/documents" },
      { label: "Checklist Status", href: "/employee/onboarding/checklist" },
    ],
  },
  {
    label: "My Tasks",
    icon: "🎯",
    children: [
      { label: "Pending Tasks", href: "/employee/tasks" },
      { label: "Completed Tasks", href: "/employee/tasks/completed" },
    ],
  },
  {
    label: "Notifications",
    icon: "🔔",
    children: [
      { label: "All Notifications", href: "/employee/notifications" },
      { label: "Shift Updates", href: "/employee/notifications/shifts" },
      { label: "Leave Updates", href: "/employee/notifications/leave" },
      { label: "Company Announcements", href: "/employee/notifications/announcements" },
    ],
  },
  {
    label: "My Settings",
    icon: "⚙️",
    children: [
      { label: "Account Settings", href: "/employee/settings" },
      { label: "Change Password", href: "/employee/settings/password" },
      { label: "Notification Preferences", href: "/employee/settings/notifications" },
    ],
  },
];
