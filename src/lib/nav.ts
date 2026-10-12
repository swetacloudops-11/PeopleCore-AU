export type NavChild = { label: string; href: string };
export type NavItem = { label: string; icon: string; href?: string; children?: NavChild[] };

export const NAV: NavItem[] = [
  {
    label: "Dashboard",
    icon: "🏠",
    href: "/dashboard",
  },
  {
    label: "Organisations",
    icon: "🏢",
    children: [
      { label: "All Organisations", href: "/organisations" },
      { label: "Create Organisation", href: "/organisations/create" },
      { label: "Disabled Organisations", href: "/organisations/disabled" },
    ],
  },
  {
    label: "Subscriptions",
    icon: "💳",
    children: [
      { label: "Plans", href: "/subscriptions/plans" },
      { label: "Organisation Subscriptions", href: "/subscriptions/organisations" },
    ],
  },
  {
    label: "Integrations",
    icon: "🔌",
    children: [
      { label: "All Integrations", href: "/integrations" },
      { label: "Integration Mapping", href: "/integrations/mapping" },
      { label: "Sync Logs", href: "/integrations/sync-logs" },
    ],
  },
  {
    label: "System Configuration",
    icon: "⚙️",
    children: [
      { label: "Business Rules", href: "/configuration/business-rules" },
      { label: "Permissions", href: "/configuration/permissions" },
      { label: "Notifications", href: "/configuration/notifications" },
      { label: "Global Settings", href: "/configuration/global-settings" },
    ],
  },
  {
    label: "Platform Diagnostics",
    icon: "🩺",
    children: [
      { label: "System Health", href: "/diagnostics/system-health" },
      { label: "Errors", href: "/diagnostics/errors" },
      { label: "Jobs", href: "/diagnostics/jobs" },
      { label: "Integration Health", href: "/diagnostics/integration-health" },
    ],
  },
  {
    label: "Security",
    icon: "🔐",
    children: [
      { label: "Users", href: "/security/users" },
      { label: "Roles", href: "/security/roles" },
      { label: "Permissions", href: "/security/permissions" },
      { label: "Sessions", href: "/security/sessions" },
    ],
  },
  { label: "Audit Logs", icon: "📋", href: "/audit-logs" },
  { label: "Settings", icon: "⚙️", href: "/settings" },
];
