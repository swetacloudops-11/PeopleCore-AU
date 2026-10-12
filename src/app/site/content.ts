/**
 * Marketing site content.
 *
 * Pure data — no imports, no database. Everything here describes features that
 * actually exist in this platform, so the marketing copy stays honest.
 */

export type Solution = {
  slug: string;
  icon: string;
  name: string;
  tagline: string;
  summary: string;
  features: string[];
  builtIn: string; // where this lives in the product
  image: string;
};

export type Industry = {
  slug: string;
  icon: string;
  name: string;
  summary: string;
  highlights: string[];
  image: string;
};

export type Plan = {
  name: string;
  price: string;
  unit: string;
  audience: string;
  featured?: boolean;
  features: string[];
  cta: string;
};

export type AddOn = { name: string; price: string; blurb: string };

export const BRAND = {
  name: "PeopleCore AU",
  tagline: "Australian HR, payroll and rostering — intelligently run.",
  supportEmail: "hello@peoplecore.au",
};

export const STATS = [
  { value: "4", label: "Connected consoles" },
  { value: "170+", label: "Screens in the platform" },
  { value: "60+", label: "HR data models" },
  { value: "AI", label: "Assistant in every console" },
];

export const CONSOLES = [
  {
    icon: "🛠️",
    name: "Super Admin",
    who: "Platform owner",
    desc: "Organisations, plans, subscriptions, integrations, security and a full audit trail.",
  },
  {
    icon: "🏢",
    name: "Organisation Admin",
    who: "Business owner / ops manager",
    desc: "People, rostering, payroll, expenses, performance, users and settings.",
  },
  {
    icon: "👥",
    name: "HR Admin",
    who: "HR team",
    desc: "Onboarding, leave, documents, policies, certifications and HR reporting.",
  },
  {
    icon: "🙋",
    name: "Employee",
    who: "Every team member",
    desc: "My roster, clock in/out, leave, payslips, expenses, documents and tasks.",
  },
];

export const SOLUTIONS: Solution[] = [
  {
    slug: "hr-compliance",
    icon: "📜",
    name: "HR & Compliance",
    tagline: "Every employee record, document and policy in one place.",
    summary:
      "Keep the people file complete and audit-ready. Onboarding checklists, certification expiry tracking and policy acknowledgements are built in — not bolted on.",
    features: [
      "Employee records with departments, teams, locations and reporting lines",
      "Document register with categories, confidentiality and expiry tracking",
      "Certification catalogue with per-person expiry and compliance status",
      "Company policies with acceptance tracking and reminders",
      "Onboarding and offboarding checklists with assigned tasks",
      "Leave management: requests, approvals, balances, types and history",
      "HR reports for headcount, leave, onboarding and offboarding",
    ],
    builtIn: "HR Admin console",
    image: "/images/site/sol-hr.jpg",
  },
  {
    slug: "payroll",
    icon: "💰",
    name: "Payroll",
    tagline: "Pay runs that stay on schedule, every cycle.",
    summary:
      "Run Australian pay cycles with pay categories, schedules, payslips, superannuation and PAYG — all scoped per organisation in a multi-tenant platform.",
    features: [
      "Pay runs with approval workflow and payslip generation",
      "Pay schedules, pay categories and earning types",
      "Superannuation records and PAYG withholding",
      "Payslips with gross, tax, super and net",
      "Payroll reporting and per-period totals",
      "Everything scoped to the organisation — safe for multi-tenant use",
    ],
    builtIn: "Organisation Admin → Payroll",
    image: "/images/site/sol-payroll.jpg",
  },
  {
    slug: "rostering-time",
    icon: "📅",
    name: "Rostering & Time",
    tagline: "Build rosters, catch conflicts, capture every hour.",
    summary:
      "Publish shifts, swap them when plans change, and capture attendance and timesheets that feed straight into payroll.",
    features: [
      "Roster calendar with draft, published and locked states",
      "Shift creation with breaks, overtime flags and role labels",
      "Shift swaps with approval workflow",
      "Automatic conflict detection — overlaps, leave clashes, overtime",
      "Clock in / clock out attendance records",
      "Timesheets with submit and approval workflow",
      "Employee availability windows",
    ],
    builtIn: "Organisation Admin → Rostering & Time",
    image: "/images/site/sol-rostering.jpg",
  },
  {
    slug: "employee-portal",
    icon: "🙋",
    name: "Employee Self-Service",
    tagline: "Give every team member their own workspace.",
    summary:
      "Staff see only their own data — roster, pay, leave and documents — so the HR inbox stops filling up with the same questions.",
    features: [
      "Personal profile with a self-service update form",
      "Roster, upcoming shifts and shift-swap requests",
      "Clock in / out with attendance history and timesheets",
      "Leave applications, balances and history",
      "Payslips and pay history",
      "Expense claims with withdraw support",
      "Documents, policies and onboarding tasks",
      "Notifications for shifts, leave and company announcements",
    ],
    builtIn: "Employee console",
    image: "/images/site/sol-employee.jpg",
  },
  {
    slug: "ai-assistants",
    icon: "🤖",
    name: "AI Assistants",
    tagline: "Ask your HR system a question — get the real answer.",
    summary:
      "Each console has an assistant that answers from live organisation data and explains where anything lives in the portal. Connect any LLM provider, or run the built-in engine.",
    features: [
      "Available in the Organisation, HR and Employee consoles",
      "Answers from live data — headcount, leave, payroll, certifications",
      "Employee assistant is strictly limited to that person's own record",
      "Explains where any feature lives in the portal",
      "Understands plain English and Hinglish",
      "Bring your own model — OpenAI, Anthropic or any compatible endpoint",
      "Works without a key using the built-in deterministic engine",
    ],
    builtIn: "Every console",
    image: "/images/site/sol-ai.jpg",
  },
];

export const INDUSTRIES: Industry[] = [
  {
    slug: "hospitality",
    icon: "🍽️",
    name: "Hospitality & Tourism",
    summary:
      "Rosters that change by the hour, casual teams and award-sensitive hours — managed without spreadsheets.",
    highlights: [
      "Casual and part-time rosters with shift swapping",
      "Clock in/out for split shifts and overtime",
      "Certifications like RSA and food safety tracked automatically",
    ],
    image: "/images/site/ind-hospitality.jpg",
  },
  {
    slug: "healthcare",
    icon: "🏥",
    name: "Healthcare & Aged Care",
    summary:
      "Compliance-heavy workforces where credential expiry and coverage can never slip.",
    highlights: [
      "Mandatory certifications with expiry alerts",
      "Shift coverage and conflict detection",
      "Policy acknowledgement tracking for every clinician",
    ],
    image: "/images/site/ind-healthcare.jpg",
  },
  {
    slug: "childcare-education",
    icon: "🧸",
    name: "Childcare & Education",
    summary:
      "Working-with-children checks, ongoing training and ratio-driven rosters in one system.",
    highlights: [
      "Qualification and check expiry tracking",
      "Onboarding checklists for new educators",
      "Rosters built around room ratios and availability",
    ],
    image: "/images/site/ind-childcare.jpg",
  },
  {
    slug: "logistics",
    icon: "🚚",
    name: "Logistics & Warehousing",
    summary:
      "High-volume hourly teams, overtime control and licences that must stay current.",
    highlights: [
      "Timesheets feeding directly into pay runs",
      "Overtime and attendance reporting",
      "Licence tracking — forklift, heavy vehicle, white card",
    ],
    image: "/images/site/ind-logistics.jpg",
  },
  {
    slug: "manufacturing",
    icon: "🏭",
    name: "Manufacturing",
    summary:
      "Shift-based production lines with site safety requirements and clear cost visibility.",
    highlights: [
      "Multi-site rostering and locations",
      "Safety training and certification registers",
      "Attendance and overtime analytics",
    ],
    image: "/images/site/ind-manufacturing.jpg",
  },
  {
    slug: "accounting-payroll",
    icon: "🧾",
    name: "Accounting & Payroll Bureaus",
    summary:
      "Manage payroll for many client organisations from one multi-tenant platform.",
    highlights: [
      "One login across multiple client organisations",
      "Per-organisation payroll runs and payslips",
      "Full audit trail of every change",
    ],
    image: "/images/site/ind-accounting.jpg",
  },
];

export const PLANS: Plan[] = [
  {
    name: "Essentials",
    price: "$9",
    unit: "per employee / month",
    audience: "Small teams moving off spreadsheets",
    features: [
      "Employee records and org structure",
      "Leave management and balances",
      "Documents and policy acknowledgements",
      "Onboarding and offboarding checklists",
      "Employee self-service portal",
      "Email support",
    ],
    cta: "Start with Essentials",
  },
  {
    name: "Engage",
    price: "$14",
    unit: "per employee / month",
    audience: "Growing businesses that rostering and payroll",
    featured: true,
    features: [
      "Everything in Essentials",
      "Rostering, shifts and shift swaps",
      "Time & attendance with timesheets",
      "Payroll with pay runs and payslips",
      "Expenses and performance reviews",
      "AI assistants in every console",
      "Priority support",
    ],
    cta: "Choose Engage",
  },
  {
    name: "Elite",
    price: "Custom",
    unit: "talk to us",
    audience: "Multi-site and compliance-heavy organisations",
    features: [
      "Everything in Engage",
      "Advanced HR reporting and analytics",
      "Certification compliance management",
      "Custom roles and permissions",
      "Integrations and data sync",
      "Onboarding and migration support",
    ],
    cta: "Speak to sales",
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "talk to us",
    audience: "Groups, bureaus and franchises",
    features: [
      "Everything in Elite",
      "Unlimited organisations under one platform",
      "Platform admin console and audit trail",
      "Dedicated environment and SLA options",
      "Custom development and integrations",
      "Named account team",
    ],
    cta: "Speak to sales",
  },
];

export const ADD_ONS: AddOn[] = [
  {
    name: "Rostering & Time",
    price: "$4",
    blurb: "Roster calendar, shift swaps, conflict detection, clock in/out and timesheets.",
  },
  {
    name: "AI Assistant",
    price: "$3",
    blurb: "Live AI answers in every console, connected to your own organisation data.",
  },
  {
    name: "Managed Payroll",
    price: "$20",
    blurb: "Our team runs and reviews your pay cycles with you each period.",
  },
  {
    name: "HR Advisory",
    price: "$14",
    blurb: "Ongoing HR guidance, document reviews and employee-relations support.",
  },
];

export const FAQ = [
  {
    q: "What is PeopleCore AU?",
    a: "An Australian HR platform with four connected consoles — platform admin, organisation admin, HR admin and employee self-service — covering people records, rostering, time, payroll, leave, compliance and documents, with an AI assistant in every console.",
  },
  {
    q: "Is it multi-tenant?",
    a: "Yes. Every record is scoped to an organisation, and platform administrators manage all organisations, plans and subscriptions from a separate Super Admin console.",
  },
  {
    q: "Can employees see other people's data?",
    a: "No. The employee portal is scoped to the signed-in person's own record, and self-service-only accounts cannot enter the organisation or HR consoles.",
  },
  {
    q: "Does the AI need an external provider?",
    a: "It's your choice. Connect OpenAI, Anthropic or any OpenAI-compatible endpoint for live AI, or run the built-in engine that answers from your data without any API key.",
  },
];
