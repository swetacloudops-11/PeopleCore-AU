// Prisma's Decimal exposes toString(), so it satisfies the structural type below.
type MoneyValue = number | string | { toString(): string };

export function formatMoney(value: MoneyValue, currency = "AUD") {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? parseFloat(value)
      : parseFloat(value.toString());
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Date maths helpers. These live outside components on purpose — the
 * react-hooks/purity rule forbids calling Date.now() during render, so pages
 * call these instead.
 */
export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

/** True when the date has already passed (null/undefined ⇒ false). */
export function isPast(date: Date | null | undefined): boolean {
  return date ? date.getTime() < Date.now() : false;
}

/** Whole days between two dates (positive when `date` is in the future). */
export function daysUntil(date: Date): number {
  const MS = 86_400_000;
  const today = new Date(Date.now());
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS);
}
