export type HrNavChild = { label: string; href: string };
export type HrNavItem = {
  label: string;
  icon: string;
  href?: string;
  children?: HrNavChild[];
};

/** Full HR Admin menu — every href lives under /hr. */
export const HR_NAV: HrNavItem[] = [
  {
    label: "Dashboard",
    icon: "🏠",
    href: "/hr/dashboard",
  },
  {
    label: "AI Assistant",
    icon: "🤖",
    href: "/hr/assistant",
  },
  {
    label: "Employee Management",
    icon: "👥",
    children: [
      { label: "All Employees", href: "/hr/employees" },
      { label: "Add Employee", href: "/hr/employees/new" },
      { label: "Employee Details", href: "/hr/employees/details" },
      { label: "Employee Documents", href: "/hr/employees/documents" },
      { label: "Certifications", href: "/hr/employees/certifications" },
      { label: "Employee History", href: "/hr/employees/history" },
    ],
  },
  {
    label: "Onboarding",
    icon: "🚀",
    children: [
      { label: "New Starters", href: "/hr/onboarding/new-starters" },
      { label: "Onboarding Checklists", href: "/hr/onboarding/checklists" },
      { label: "Onboarding Tasks", href: "/hr/onboarding/tasks" },
      { label: "Required Documents", href: "/hr/onboarding/documents" },
    ],
  },
  {
    label: "Offboarding",
    icon: "👋",
    children: [
      { label: "Employees Leaving", href: "/hr/offboarding/leaving" },
      { label: "Exit Checklist", href: "/hr/offboarding/checklist" },
      { label: "Exit Documents", href: "/hr/offboarding/documents" },
    ],
  },
  {
    label: "Leave Management",
    icon: "⏰",
    children: [
      { label: "Leave Requests", href: "/hr/leave/requests" },
      { label: "Approve / Reject Leave", href: "/hr/leave/approvals" },
      { label: "Leave Balances", href: "/hr/leave/balances" },
      { label: "Leave Types", href: "/hr/leave/types" },
      { label: "Leave History", href: "/hr/leave/history" },
    ],
  },
  {
    label: "Documents",
    icon: "📄",
    children: [
      { label: "All Documents", href: "/hr/documents" },
      { label: "Upload Documents", href: "/hr/documents/upload" },
      { label: "Employee Documents", href: "/hr/documents/employees" },
      { label: "Document Expiry Tracking", href: "/hr/documents/expiry" },
    ],
  },
  {
    label: "Policies",
    icon: "📜",
    children: [
      { label: "Company Policies", href: "/hr/policies" },
      { label: "Create / Update Policies", href: "/hr/policies/new" },
      { label: "Policy Acknowledgements", href: "/hr/policies/acknowledgements" },
    ],
  },
  {
    label: "Certifications",
    icon: "🏅",
    children: [
      { label: "All Certifications", href: "/hr/certifications" },
      { label: "Expiring Certifications", href: "/hr/certifications/expiring" },
      { label: "Certification Records", href: "/hr/certifications/records" },
    ],
  },
  {
    label: "HR Reports",
    icon: "📊",
    children: [
      { label: "Employee Reports", href: "/hr/reports/employees" },
      { label: "Headcount Reports", href: "/hr/reports/headcount" },
      { label: "Leave Reports", href: "/hr/reports/leave" },
      { label: "Onboarding Reports", href: "/hr/reports/onboarding" },
      { label: "Offboarding Reports", href: "/hr/reports/offboarding" },
    ],
  },
  {
    label: "Tasks & Approvals",
    icon: "✅",
    children: [
      { label: "Pending HR Tasks", href: "/hr/tasks" },
      { label: "Employee Requests", href: "/hr/tasks/requests" },
      { label: "Document Approvals", href: "/hr/tasks/document-approvals" },
    ],
  },
  {
    label: "Notifications",
    icon: "🔔",
    children: [
      { label: "Employee Notifications", href: "/hr/notifications" },
      { label: "Policy Reminders", href: "/hr/notifications/policy-reminders" },
      { label: "Expiry Reminders", href: "/hr/notifications/expiry-reminders" },
    ],
  },
  {
    label: "HR Settings",
    icon: "⚙️",
    children: [
      { label: "HR Preferences", href: "/hr/settings" },
      { label: "Leave Rules", href: "/hr/settings/leave-rules" },
      { label: "Onboarding Settings", href: "/hr/settings/onboarding" },
      { label: "Document Settings", href: "/hr/settings/documents" },
      { label: "Notification Settings", href: "/hr/settings/notifications" },
    ],
  },
];
